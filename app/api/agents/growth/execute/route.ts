import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getGrowthAgentService } from '@/agents/growth.agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);
    const growthAgent = getGrowthAgentService(repos);

    let taskId = body.taskId as string | undefined;
    const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.trim() : undefined;
    const taskInstruction = typeof body.taskInstruction === 'string' ? body.taskInstruction.trim() : undefined;

    // If no taskId is provided, automatically bootstrap a new test mission with a delegated task
    if (!taskId) {
      const derivedTitle = body.missionTitle || (customPrompt ? `Side Quest: Growth: ${customPrompt.slice(0, 50)}...` : 'Side Quest: Competitor Research & Growth Strategy');
      const derivedObjective = body.objective || (customPrompt ? customPrompt : 'Autonomous competitor intelligence, channel audit, and positioning angles');
      const derivedTask = taskInstruction || customPrompt || 'Perform web research on developer-focused AI operating system competitors';

      const missionResult = await missionControl.createAndDelegateMission({
        title: derivedTitle,
        objective: derivedObjective,
        type: 'side_quest',
        founderUid: body.founderUid || 'founder_manual_trigger',
        taskTitles: [derivedTask],
      });

      if (!missionResult.delegatedTask) {
        return NextResponse.json(
          { success: false, error: 'Failed to create and delegate mission task' },
          { status: 500 }
        );
      }
      taskId = missionResult.delegatedTask.id;
    }

    const executionResult = await growthAgent.executeDelegatedTask(taskId, {
      customPrompt,
      taskInstruction,
      queryOverride: body.queryOverride,
    });

    return NextResponse.json({
      success: true,
      message: 'Pass 1 executed successfully: Growth Agent -> Worker -> Search Tool -> Artifact',
      result: executionResult,
    });
  } catch (error: unknown) {
    console.error('Error executing growth agent pass 1:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during growth agent execution',
      },
      { status: 500 }
    );
  }
}
