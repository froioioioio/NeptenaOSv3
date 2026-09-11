import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getQualityAgentService } from '@/agents/quality.agent';
import { getGrowthAgentService } from '@/agents/growth.agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);
    const qualityAgent = getQualityAgentService(repos);

    let taskId = body.taskId as string | undefined;
    const targetArtifactId = body.targetArtifactId as string | undefined;
    const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.trim() : undefined;
    const taskInstruction = typeof body.taskInstruction === 'string' ? body.taskInstruction.trim() : undefined;
    const auditFocus = typeof body.auditFocus === 'string' ? body.auditFocus.trim() : undefined;

    // If no taskId is provided, bootstrap an end-to-end test mission:
    // 1. Run Growth or Dev specialist to produce an artifact
    // 2. Spawn Quality Specialist to independently audit the output without implementation bias
    if (!taskId) {
      const growthAgent = getGrowthAgentService(repos);
      const derivedTitle = body.missionTitle || (customPrompt ? `Side Quest: QA: ${customPrompt.slice(0, 50)}...` : 'Side Quest: Production Delivery Verification & QA');
      const derivedObjective = body.objective || (customPrompt ? customPrompt : 'Independently scrutinize and verify deliverable quality and goal alignment without bias');

      const missionResult = await missionControl.createAndDelegateMission({
        title: derivedTitle,
        objective: derivedObjective,
        type: 'side_quest',
        founderUid: body.founderUid || 'founder_manual_trigger',
        assignedAgent: 'agent-growth',
        taskTitles: [
          'Generate high-conversion positioning report for developer tooling',
          taskInstruction || customPrompt || 'Execute independent black-box quality assurance audit and goal verification',
        ],
      });

      if (!missionResult.delegatedTask) {
        return NextResponse.json(
          { success: false, error: 'Failed to initialize mission for QA audit' },
          { status: 500 }
        );
      }

      // Execute task 1 with Growth Agent to generate an artifact
      const growthRes = await growthAgent.executeDelegatedTask(missionResult.delegatedTask.id);

      // Now prepare task 2 for Quality Specialist
      const secondTask = missionResult.tasks[1];
      if (secondTask) {
        await repos.tasks.update(secondTask.id, {
          assignedTo: 'agent-quality',
          status: 'in_progress',
        });
        taskId = secondTask.id;
      } else {
        taskId = missionResult.delegatedTask.id;
      }

      const executionResult = await qualityAgent.executeDelegatedTask(taskId, growthRes.artifact.id, {
        customPrompt,
        taskInstruction,
        auditFocus,
      });

      return NextResponse.json({
        success: true,
        message: 'Quality Specialist Agent executed independent black-box QA audit successfully',
        result: executionResult,
        inspectedArtifact: growthRes.artifact,
      });
    }

    const executionResult = await qualityAgent.executeDelegatedTask(taskId, targetArtifactId, {
      customPrompt,
      taskInstruction,
      auditFocus,
    });

    return NextResponse.json({
      success: true,
      message: 'Quality Specialist Agent executed independent black-box QA audit successfully',
      result: executionResult,
    });
  } catch (error: unknown) {
    console.error('Error executing quality agent audit:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during quality agent execution',
      },
      { status: 500 }
    );
  }
}
