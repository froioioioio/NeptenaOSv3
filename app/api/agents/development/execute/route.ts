import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getDevelopmentAgentService } from '@/agents/development.agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);
    const devAgent = getDevelopmentAgentService(repos);

    let taskId = body.taskId as string | undefined;
    const prdArtifactId = body.prdArtifactId as string | undefined;
    const deliverableType = body.deliverableType as 'code' | 'document' | 'presentation' | 'image' | 'video' | undefined;
    const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.trim() : undefined;
    const taskInstruction = typeof body.taskInstruction === 'string' ? body.taskInstruction.trim() : undefined;
    const suggestedFileName = typeof body.suggestedFileName === 'string' ? body.suggestedFileName.trim() : undefined;
    const model = typeof body.model === 'string' ? body.model.trim() : undefined;

    // If no taskId is provided, automatically bootstrap a new mission with a deliverable task
    if (!taskId) {
      const typeLabelMap: Record<string, string> = {
        code: 'Source Code & Architecture',
        document: 'Executive Document / Whitepaper',
        presentation: 'Pitch Deck & Slide Presentation',
        image: 'Visual Asset & SVG Graphics',
        video: 'Video Storyboard & Production Script',
      };
      const activeLabel = deliverableType ? typeLabelMap[deliverableType] || 'Production Deliverable' : 'Production Deliverable';

      const derivedTitle = body.missionTitle || (customPrompt ? `Side Quest: ${activeLabel}: ${customPrompt.slice(0, 45)}...` : `Side Quest: ${activeLabel} Generation`);
      const derivedObjective = body.objective || (customPrompt ? customPrompt : `Generate ${activeLabel} and save directly to mission project workspace`);
      const derivedTask = taskInstruction || customPrompt || `Generate ${activeLabel} deliverable`;

      const missionResult = await missionControl.createAndDelegateMission({
        title: derivedTitle,
        objective: derivedObjective,
        type: 'side_quest',
        founderUid: body.founderUid || 'founder_manual_trigger',
        assignedAgent: 'agent-development',
        taskTitles: [
          derivedTask,
          `Verify ${activeLabel} quality and integrity`,
        ],
      });

      // Update lead task to be assigned to agent-development
      const leadTask = missionResult.tasks[0];
      if (!leadTask) {
        return NextResponse.json(
          { success: false, error: 'Failed to create mission and task' },
          { status: 500 }
        );
      }

      await repos.tasks.update(leadTask.id, {
        status: 'in_progress',
        assignedTo: 'agent-development',
      });
      taskId = leadTask.id;
    }

    const executionResult = await devAgent.executeDelegatedTask(taskId, prdArtifactId, {
      deliverableType,
      customPrompt,
      taskInstruction,
      suggestedFileName,
      model,
    });

    return NextResponse.json({
      success: true,
      message: `Production Agent executed successfully: Agent -> ${executionResult.worker.role} -> ${executionResult.deliverableOutput.toolName} -> Saved to Project Workspace`,
      result: executionResult,
    });
  } catch (error: unknown) {
    console.error('Error executing development agent:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during development agent execution',
      },
      { status: 500 }
    );
  }
}
