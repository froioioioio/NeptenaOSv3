import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { taskId, assignedAgent, autoByType } = body;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    let result;
    if (autoByType || !assignedAgent) {
      result = await missionControl.delegateTaskByType(taskId);
    } else if (assignedAgent === 'agent-growth' || assignedAgent === 'agent-development' || assignedAgent === 'agent-quality') {
      result = await missionControl.delegateTask(taskId, assignedAgent);
    } else {
      return NextResponse.json(
        { success: false, error: 'assignedAgent must be "agent-growth", "agent-development", or "agent-quality"' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Task [${taskId}] delegated to [${result.task.assignedTo}]`,
      task: result.task,
      agent: result.agent,
    });
  } catch (error: unknown) {
    console.error('Error delegating task:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delegate task' },
      { status: 500 }
    );
  }
}
