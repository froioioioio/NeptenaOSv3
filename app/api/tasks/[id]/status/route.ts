import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      );
    }

    if (!status || !['pending', 'in_progress', 'completed', 'failed', 'blocked'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Valid status is required (pending, in_progress, completed, failed, blocked)' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const task = await repos.tasks.getById(id);
    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task not found: ${id}` },
        { status: 404 }
      );
    }

    const updatedTask = await repos.tasks.update(id, {
      status,
      updatedAt: Date.now(),
    });

    // If marked completed, check if next dependent tasks in the mission can be unblocked/transitioned to in_progress
    if (status === 'completed') {
      const allMissionTasks = await repos.tasks.listByMission(task.missionId);
      for (const nextTask of allMissionTasks) {
        if (
          nextTask.status === 'pending' ||
          nextTask.status === 'blocked'
        ) {
          const allPrereqs = (nextTask.dependsOnTaskIds || []).map(pId =>
            pId === id ? updatedTask : allMissionTasks.find(t => t.id === pId)
          );
          const allPrereqsCompleted = allPrereqs.length > 0 && allPrereqs.every(p => p && p.status === 'completed');
          if (allPrereqsCompleted) {
            await repos.tasks.update(nextTask.id, {
              status: 'in_progress',
              updatedAt: Date.now(),
            });
          }
        }
      }

      // Check if all tasks in mission are completed
      const finalMissionTasks = await repos.tasks.listByMission(task.missionId);
      if (finalMissionTasks.length > 0 && finalMissionTasks.every(t => t.status === 'completed')) {
        await repos.missions.update(task.missionId, {
          status: 'completed',
          updatedAt: Date.now(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (error: unknown) {
    console.error('Failed to update task status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
