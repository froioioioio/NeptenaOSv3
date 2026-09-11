import { NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const founderUid = searchParams.get('founderUid');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const archivedOnly = searchParams.get('archivedOnly') === 'true';
    const skipConsolidation = searchParams.get('skipConsolidation') === 'true';
    const repos = getRepositories();
    const service = getMissionControlService();

    // Orchestrator automated duplicate mission cleanup
    let consolidationReport = null;
    if (!skipConsolidation && !archivedOnly) {
      try {
        consolidationReport = await service.consolidateDuplicateMissions({
          founderUid: founderUid || undefined,
        });
      } catch (consErr) {
        console.warn('Auto-consolidation warning:', consErr);
      }
    }

    let allMissions;
    if (founderUid) {
      allMissions = await repos.missions.listByFounder(founderUid);
    } else {
      // Return all missions for global mission control view (ordered by recent)
      const allDraft = await repos.missions.listByStatus('draft');
      const allActive = await repos.missions.listByStatus('active');
      const allCompleted = await repos.missions.listByStatus('completed');
      const allFailed = await repos.missions.listByStatus('failed');
      const allQueued = await repos.missions.listByStatus('queued');
      const allCancelled = await repos.missions.listByStatus('cancelled');
      allMissions = [...allActive, ...allDraft, ...allQueued, ...allCompleted, ...allFailed, ...allCancelled];
    }

    const totalArchivedCount = allMissions.filter(m => m.isArchived === true).length;

    let filteredMissions = allMissions;
    if (archivedOnly) {
      filteredMissions = allMissions.filter(m => m.isArchived === true);
    } else if (!includeArchived) {
      filteredMissions = allMissions.filter(m => !m.isArchived);
    }

    // Sort by createdAt descending
    filteredMissions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Also fetch tasks for each mission to give rich live status
    const missionsWithTasks = await Promise.all(
      filteredMissions.map(async (mission) => {
        const tasks = await repos.tasks.listByMission(mission.id);
        return {
          ...mission,
          tasks,
        };
      })
    );

    return NextResponse.json({
      success: true,
      missions: missionsWithTasks,
      totalArchivedCount,
      consolidationReport,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      objective,
      founderUid = 'founder_default',
      priority = 'high',
      taskTitles,
      tasks,
      runImmediately = false,
    } = body;

    if (!title || !objective) {
      return NextResponse.json({
        success: false,
        error: 'Title and objective are required.',
      }, { status: 400 });
    }

    const service = getMissionControlService();
    let result;

    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      result = await service.createBranchingMission({
        title,
        objective,
        founderUid,
        priority,
        tasks,
      });
    } else {
      result = await service.createAndDelegateMission({
        title,
        objective,
        founderUid,
        priority,
        taskTitles,
      });
    }

    let executionResult = null;
    if (runImmediately && result.mission?.id) {
      executionResult = await service.executeMissionConcurrently(result.mission.id);
    }

    return NextResponse.json({
      success: true,
      result,
      executionResult,
    }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
