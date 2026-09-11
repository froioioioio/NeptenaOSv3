import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getGrowthAgentService } from '@/agents/growth.agent';

export interface Pass1TestStepResult {
  step: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

export async function runGrowthPass1Test(): Promise<{
  success: boolean;
  durationMs: number;
  results: Pass1TestStepResult[];
  createdEntities?: {
    missionId: string;
    taskId: string;
    workerId: string;
    toolCallId: string;
    artifactId: string;
    artifactTitle: string;
    artifactSnippet: string;
  };
}> {
  const startTime = Date.now();
  const results: Pass1TestStepResult[] = [];
  const repos = getRepositories();
  const missionControl = getMissionControlService(repos);
  const growthAgent = getGrowthAgentService(repos);

  let missionId: string | null = null;
  let taskId: string | null = null;
  let workerId: string | null = null;
  let toolCallId: string | null = null;
  let artifactId: string | null = null;
  let artifactTitle = '';
  let artifactSnippet = '';

  try {
    // Step 1: Create Mission and delegate Task to Growth Agent
    const missionResult = await missionControl.createAndDelegateMission({
      title: `Automated Pass 1 Test Mission ${Date.now()}`,
      objective: 'Verify Growth Agent -> Worker -> Search Tool -> Artifact generation pipeline',
      founderUid: 'founder_pass1_test',
      taskTitles: [
        'Analyze top 3 competitors in developer OS space and extract positioning insights',
      ],
    });

    missionId = missionResult.mission.id;
    const delegatedTask = missionResult.delegatedTask;

    if (!delegatedTask) {
      throw new Error('Failed to delegate task to agent-growth');
    }
    taskId = delegatedTask.id;

    results.push({
      step: '1. Mission Creation & Task Delegation',
      success: delegatedTask.assignedTo === 'agent-growth' && delegatedTask.status === 'in_progress',
      details: {
        missionId: missionResult.mission.id,
        taskId: delegatedTask.id,
        assignedTo: delegatedTask.assignedTo,
        status: delegatedTask.status,
      },
    });

    // Step 2: Growth Agent receives delegated Task, spawns Worker, calls Search Tool, creates Artifact
    const executionResult = await growthAgent.executeDelegatedTask(taskId);
    workerId = executionResult.worker.id;
    toolCallId = executionResult.toolCall.id;
    artifactId = executionResult.artifact.id;
    artifactTitle = executionResult.artifact.title;
    artifactSnippet = executionResult.artifact.content.slice(0, 200) + '...';

    results.push({
      step: '2. Growth Agent Spawns Worker & Executes Tool',
      success: executionResult.success && !!executionResult.worker && !!executionResult.toolCall,
      details: {
        workerId: executionResult.worker.id,
        workerRole: executionResult.worker.role,
        workerStatus: executionResult.worker.status,
        toolName: executionResult.toolCall.toolName,
        toolCallStatus: executionResult.toolCall.status,
      },
    });

    // Step 3: Verify ToolCall in Firestore
    const persistedToolCall = await repos.toolCalls.getById(toolCallId);
    results.push({
      step: '3. Verify ToolCall Entity in Firestore',
      success: !!persistedToolCall && persistedToolCall.status === 'success' && persistedToolCall.workerId === workerId,
      details: {
        toolCallId: persistedToolCall?.id,
        toolName: persistedToolCall?.toolName,
        hasOutput: !!persistedToolCall?.output,
        status: persistedToolCall?.status,
      },
    });

    // Step 4: Verify Artifact Entity in Firestore
    const persistedArtifact = await repos.artifacts.getById(artifactId);
    const missionArtifacts = await repos.artifacts.listByMission(missionId);
    results.push({
      step: '4. Verify Artifact Entity in Firestore',
      success: !!persistedArtifact && persistedArtifact.id === artifactId && missionArtifacts.length > 0,
      details: {
        artifactId: persistedArtifact?.id,
        title: persistedArtifact?.title,
        type: persistedArtifact?.type,
        contentLength: persistedArtifact?.content.length,
        version: persistedArtifact?.version,
      },
    });

    // Step 5: Verify Worker Termination and Task Completion
    const persistedWorker = await repos.workers.getById(workerId);
    const persistedTask = await repos.tasks.getById(taskId);
    results.push({
      step: '5. Verify Worker & Task State Transitions',
      success: persistedWorker?.status === 'completed' && persistedTask?.status === 'completed',
      details: {
        workerStatus: persistedWorker?.status,
        taskStatus: persistedTask?.status,
        resultSummary: persistedWorker?.resultSummary,
      },
    });

    const allPassed = results.every((r) => r.success);
    return {
      success: allPassed,
      durationMs: Date.now() - startTime,
      results,
      createdEntities: {
        missionId,
        taskId,
        workerId,
        toolCallId,
        artifactId,
        artifactTitle,
        artifactSnippet,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({
      step: 'Pass 1 Execution Failure',
      success: false,
      error: errorMsg,
    });
    return {
      success: false,
      durationMs: Date.now() - startTime,
      results,
    };
  }
}
