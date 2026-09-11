import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { ArtifactEntity } from '@/schemas/repositories';
import { saveArtifactToProjectWorkspace, ensureMissionProjectWorkspace } from '@/lib/project-workspace';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const missionId = searchParams.get('missionId');
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status') as ArtifactEntity['status'];
    const id = searchParams.get('id');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const archivedOnly = searchParams.get('archivedOnly') === 'true';

    const repos = getRepositories();

    if (id) {
      const artifact = await repos.artifacts.getById(id);
      if (!artifact) {
        return NextResponse.json({ success: false, error: 'Artifact not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, artifact });
    }

    if (taskId) {
      const artifacts = await repos.artifacts.listByTask(taskId);
      const filtered = includeArchived ? artifacts : artifacts.filter(a => a.status !== 'archived');
      return NextResponse.json({ success: true, artifacts: filtered });
    }

    if (missionId) {
      const artifacts = await repos.artifacts.listByMission(missionId);
      const filtered = includeArchived ? artifacts : artifacts.filter(a => a.status !== 'archived');
      return NextResponse.json({ success: true, artifacts: filtered });
    }

    if (status && repos.artifacts.listByStatus) {
      const artifacts = await repos.artifacts.listByStatus(status);
      artifacts.sort((a, b) => b.createdAt - a.createdAt);
      return NextResponse.json({ success: true, status, artifacts });
    }

    // Default: fetch all artifacts
    const allArtifacts = repos.artifacts.listAll ? await repos.artifacts.listAll() : [];
    allArtifacts.sort((a, b) => b.createdAt - a.createdAt);

    const totalCount = allArtifacts.length;
    const archivedCount = allArtifacts.filter(a => a.status === 'archived').length;

    let filteredArtifacts = allArtifacts;
    if (archivedOnly) {
      filteredArtifacts = allArtifacts.filter(a => a.status === 'archived');
    } else if (!includeArchived) {
      filteredArtifacts = allArtifacts.filter(a => a.status !== 'archived');
    }

    return NextResponse.json({
      success: true,
      total: totalCount,
      activeCount: totalCount - archivedCount,
      archivedCount,
      artifacts: filteredArtifacts,
    });
  } catch (error: unknown) {
    console.error('Error fetching artifacts:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch artifacts',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      id,
      status,
      approvedBy = 'Founder / CEO',
      missionId = 'mission-default',
      taskId,
      title,
      type = 'markdown',
      content,
    } = body;
    const repos = getRepositories();

    // 1. Close / Archive Single Deliverable Action
    if (action === 'close' || action === 'archive') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'Artifact ID is required to close/archive' }, { status: 400 });
      }
      const updated = await repos.artifacts.update(id, {
        status: 'archived',
        updatedAt: Date.now(),
      });
      return NextResponse.json({
        success: true,
        message: `Deliverable '${updated.title}' was closed and archived.`,
        artifact: updated,
      });
    }

    // 2. Unarchive / Re-open Deliverable Action
    if (action === 'unarchive' || action === 'reopen') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'Artifact ID is required to re-open' }, { status: 400 });
      }
      const updated = await repos.artifacts.update(id, {
        status: 'pending_approval',
        updatedAt: Date.now(),
      });
      return NextResponse.json({
        success: true,
        message: `Deliverable '${updated.title}' was re-opened.`,
        artifact: updated,
      });
    }

    // 3. Batch Cleanup Orphaned / Inactive Deliverables Action
    if (action === 'cleanup_orphaned' || action === 'close_orphaned') {
      const service = getMissionControlService(repos);
      const result = await service.cleanupOrphanedArtifacts();
      return NextResponse.json({
        success: true,
        cleanedCount: result.cleanedCount,
        remainingActiveCount: result.remainingActiveCount,
        message: `Successfully closed ${result.cleanedCount} deliverable(s) from inactive/archived missions.`,
      });
    }

    // 4. Batch Close All Deliverables Action
    if (action === 'close_all') {
      const { ids } = body;
      const allArtifacts = repos.artifacts.listAll ? await repos.artifacts.listAll() : [];
      
      let toClose: { id: string }[] = allArtifacts.filter(a => a.status !== 'archived');
      
      // If client supplied specific active deliverable IDs, merge them to guarantee coverage
      if (Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(toClose.map(a => a.id));
        for (const suppliedId of ids) {
          if (suppliedId && !idSet.has(suppliedId)) {
            toClose.push({ id: suppliedId });
            idSet.add(suppliedId);
          }
        }
      }

      const now = Date.now();
      const results = await Promise.allSettled(
        toClose.map(artifact =>
          repos.artifacts.update(artifact.id, {
            status: 'archived',
            updatedAt: now,
          })
        )
      );

      const successfulCount = results.filter(r => r.status === 'fulfilled').length;

      return NextResponse.json({
        success: true,
        closedCount: successfulCount > 0 ? successfulCount : toClose.length,
        message: `Successfully closed and archived ${successfulCount > 0 ? successfulCount : toClose.length} deliverable(s).`,
      });
    }

    // 5. One-tap Approve Action
    if (action === 'approve' || action === 'update_status') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'Artifact ID is required for status update' }, { status: 400 });
      }
      const targetStatus: NonNullable<ArtifactEntity['status']> = status || (action === 'approve' ? 'approved' : 'pending_approval');
      
      let updated: ArtifactEntity;
      let projectFilePath: string | undefined;
      let projectFolder: string | undefined;

      // When approving, persist the artifact content to the designated mission folder
      if (targetStatus === 'approved') {
        const existingArtifact = await repos.artifacts.getById(id);
        if (existingArtifact) {
          try {
            // Find mission to identify designated project folder
            const mission = existingArtifact.missionId
              ? await repos.missions.getById(existingArtifact.missionId)
              : null;
            
            const missionObj = mission || {
              id: existingArtifact.missionId || 'mission-default',
              title: 'Mission Deliverables',
              objective: 'Mission deliverable workspace',
            };

            await ensureMissionProjectWorkspace(missionObj);
            const saved = await saveArtifactToProjectWorkspace(missionObj, {
              id: existingArtifact.id,
              title: existingArtifact.title,
              type: existingArtifact.type,
              content: existingArtifact.content,
            });
            projectFilePath = saved.projectFilePath;
            projectFolder = saved.projectFolder;
          } catch (storageErr) {
            console.warn(`Failed to store approved artifact ${id} in mission folder:`, storageErr);
          }
        }
      }

      const payload: Partial<ArtifactEntity> = {
        status: targetStatus,
        updatedAt: Date.now(),
      };

      if (targetStatus === 'approved') {
        payload.approvedAt = Date.now();
        payload.approvedBy = approvedBy;
        if (projectFilePath) payload.projectFilePath = projectFilePath;
        if (projectFolder) payload.projectFolder = projectFolder;
      }

      updated = await repos.artifacts.update(id, payload);

      return NextResponse.json({
        success: true,
        message: `Artifact status updated to ${targetStatus}${projectFilePath ? ` and stored in ${projectFilePath}` : ''}`,
        artifact: updated,
        projectFilePath,
        projectFolder,
      });
    }

    // 6. Creation Action
    if (!title || !content) {
      return NextResponse.json({ success: false, error: 'Title and content are required to create an artifact' }, { status: 400 });
    }

    const created = await repos.artifacts.create({
      id: id || undefined,
      missionId,
      taskId: taskId || undefined,
      title,
      type,
      content,
      status: (status as ArtifactEntity['status']) || 'pending_approval',
      version: 1,
    });

    return NextResponse.json({
      success: true,
      message: 'Artifact created successfully',
      artifact: created,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in artifacts POST:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process artifact action',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates = {} } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Artifact ID is required' }, { status: 400 });
    }

    const repos = getRepositories();
    const updated = await repos.artifacts.update(id, updates);

    return NextResponse.json({
      success: true,
      artifact: updated,
    });
  } catch (error: unknown) {
    console.error('Error updating artifact:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update artifact',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Artifact ID is required' }, { status: 400 });
    }

    const repos = getRepositories();
    const deleted = await repos.artifacts.delete(id);

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error: unknown) {
    console.error('Error deleting artifact:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete artifact',
      },
      { status: 500 }
    );
  }
}
