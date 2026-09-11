import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getDevelopmentAgentService } from '@/agents/development.agent';

export interface DevAgentTestStepResult {
  step: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

export async function runDevelopmentAgentTest(): Promise<{
  success: boolean;
  durationMs: number;
  results: DevAgentTestStepResult[];
  createdEntities?: {
    missionId: string;
    taskId: string;
    prdArtifactId: string;
    workerId: string;
    toolCallId: string;
    codeArtifactId: string;
    branchName: string;
    prNumber: number;
    prUrl: string;
    scaffoldedFilePath: string;
    isDraft: boolean;
  };
}> {
  const startTime = Date.now();
  const results: DevAgentTestStepResult[] = [];
  const repos = getRepositories();
  const missionControl = getMissionControlService(repos);
  const devAgent = getDevelopmentAgentService(repos);

  let missionId = '';
  let taskId = '';
  let prdArtifactId = '';
  let workerId = '';
  let toolCallId = '';
  let codeArtifactId = '';
  let branchName = '';
  let prNumber = 0;
  let prUrl = '';
  let scaffoldedFilePath = '';
  let isDraft = false;

  try {
    // Step 1: Create Mission & PRD Artifact
    const missionResult = await missionControl.createAndDelegateMission({
      title: `Feature Scaffold Mission ${Date.now()}`,
      objective: 'Convert PRD specification into an active GitHub feature branch, scaffolded TypeScript module, and Draft PR',
      founderUid: 'founder_dev_test',
      assignedAgent: 'agent-development',
      taskTitles: [
        'Turn PRD artifact into GitHub branch with scaffolded file and draft PR',
      ],
    });

    missionId = missionResult.mission.id;

    // Create a mock/real PRD artifact for this mission to feed into Dev Agent
    const prdArtifact = await repos.artifacts.create({
      missionId,
      title: 'PRD: Autonomous Task Notification Webhook',
      type: 'markdown',
      content: `# Product Requirements Document (PRD)

## Overview
Build an autonomous webhook notification dispatcher for Mission Control task updates.

## Technical Specifications
- **Component**: \`WebhookNotificationDispatcher\`
- **Interfaces**: Config with endpoint, retry count, secret HMAC key.
- **Methods**: \`initialize()\`, \`execute(params)\`, \`verifySignature()\`
- **Acceptance Criteria**:
  - Typed payload interfaces
  - Exponential backoff retry handler
  - Unit test suite scaffold
`,
      version: 1,
    });
    prdArtifactId = prdArtifact.id;

    // Delegate task to agent-development
    const devTask = missionResult.tasks[0];
    const updatedTask = await repos.tasks.update(devTask.id, {
      status: 'in_progress',
      assignedTo: 'agent-development',
    });
    taskId = updatedTask.id;

    results.push({
      step: '1. Mission & PRD Artifact Setup',
      success: !!missionId && !!prdArtifactId && updatedTask.assignedTo === 'agent-development',
      details: {
        missionId,
        prdArtifactId,
        taskId,
        assignedAgent: updatedTask.assignedTo,
      },
    });

    // Step 2: Execute Development Agent on Delegated Task
    const devExec = await devAgent.executeDelegatedTask(taskId, prdArtifactId);
    workerId = devExec.worker.id;
    toolCallId = devExec.toolCall.id;
    codeArtifactId = devExec.artifact.id;
    branchName = devExec.gitOutput.branchName;
    prNumber = devExec.gitOutput.prNumber;
    prUrl = devExec.gitOutput.prUrl;
    scaffoldedFilePath = devExec.gitOutput.scaffoldedFilePath;
    isDraft = devExec.gitOutput.isDraft;

    results.push({
      step: '2. Dev Agent Spawns Worker & Executes GitHub Tool',
      success: devExec.success && !!devExec.worker && !!devExec.toolCall,
      details: {
        workerId,
        workerRole: devExec.worker.role,
        toolCallId,
        toolName: devExec.toolCall.toolName,
        toolStatus: devExec.toolCall.status,
      },
    });

    // Step 3: Verify GitHub Tool Scaffolding & Draft PR Output
    const hasBranch = branchName.startsWith('feat/prd-');
    const hasFilePath = scaffoldedFilePath.includes('.ts');
    const hasPrUrl = prUrl.includes('github.com');
    const isDraftFlag = isDraft === true;

    results.push({
      step: '3. GitHub Tool Output Verification (Branch, File, Draft PR)',
      success: hasBranch && hasFilePath && hasPrUrl && isDraftFlag,
      details: {
        repository: devExec.gitOutput.repository,
        branchName,
        scaffoldedFilePath,
        prNumber,
        prUrl,
        isDraft,
      },
    });

    // Step 4: Verify Resulting Code Artifact in Firestore
    const retrievedArtifact = await repos.artifacts.getById(codeArtifactId);
    const hasScaffoldCode = (retrievedArtifact?.content.length || 0) > 200;
    const hasMobileChecklist = retrievedArtifact?.content.includes('Mobile Verification Checklist');

    results.push({
      step: '4. Code Artifact & Mobile Instructions Stored in Firestore',
      success: !!retrievedArtifact && hasScaffoldCode && hasMobileChecklist,
      details: {
        codeArtifactId,
        artifactType: retrievedArtifact?.type,
        contentLength: retrievedArtifact?.content.length,
        hasMobileChecklist,
      },
    });

    // Step 5: Verify Worker Termination and Task Completion
    const retrievedWorker = await repos.workers.getById(workerId);
    const retrievedTask = await repos.tasks.getById(taskId);

    results.push({
      step: '5. Worker Terminated & Task Completed',
      success: retrievedWorker?.status === 'completed' && retrievedTask?.status === 'completed',
      details: {
        workerStatus: retrievedWorker?.status,
        taskStatus: retrievedTask?.status,
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
        prdArtifactId,
        workerId,
        toolCallId,
        codeArtifactId,
        branchName,
        prNumber,
        prUrl,
        scaffoldedFilePath,
        isDraft,
      },
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      step: 'Execution Error Handler',
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
