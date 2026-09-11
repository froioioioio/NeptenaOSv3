import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.trim() : undefined;
    const missionTitle = body.missionTitle || (customPrompt ? `CEO Strategy: ${customPrompt.slice(0, 45)}...` : 'Autonomous High-Leverage Strategic Initiative');
    const objective = body.objective || (customPrompt ? customPrompt : 'Lead executive decomposition, task delegation, and cross-agent concurrent orchestration.');

    // 1. Create and decompose mission via CEO Orchestrator
    const decompositionResult = await missionControl.createAndDelegateMission({
      title: missionTitle,
      objective: objective,
      founderUid: body.founderUid || 'founder_manual_trigger',
      assignedAgent: body.assignedAgent || 'agent-growth',
      taskTitles: body.taskTitles || [
        customPrompt ? `Execute strategy: ${customPrompt.slice(0, 60)}` : 'Perform initial market & competitive intelligence',
        'Scaffold architectural design & implementation',
        'Audit deliverable quality and goal alignment',
      ],
    });

    // 2. Optionally execute immediately if requested
    let executionResult = null;
    if (body.autoExecute !== false && decompositionResult.mission) {
      executionResult = await missionControl.executeMissionConcurrently(decompositionResult.mission.id);
    }

    return NextResponse.json({
      success: true,
      message: 'CEO Orchestrator spawned strategic initiative with custom prompt successfully',
      decomposition: decompositionResult,
      execution: executionResult,
    });
  } catch (error: unknown) {
    console.error('Error executing CEO agent worker:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute CEO agent worker',
      },
      { status: 500 }
    );
  }
}
