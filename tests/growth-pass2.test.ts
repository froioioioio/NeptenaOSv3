import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { getGrowthAgentService } from '@/agents/growth.agent';

export interface Pass2TestStepResult {
  step: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

export async function runGrowthPass2Test(): Promise<{
  success: boolean;
  durationMs: number;
  results: Pass2TestStepResult[];
  createdEntities?: {
    missionId: string;
    taskId: string;
    workerId: string;
    toolCallId: string;
    artifactId: string;
    artifactTitle: string;
    knowledgeDocId: string;
    knowledgeDocTitle: string;
    knowledgeFilePath: string;
    evaluationScore: number;
    evaluatedBy: string;
  };
}> {
  const startTime = Date.now();
  const results: Pass2TestStepResult[] = [];
  const repos = getRepositories();
  const missionControl = getMissionControlService(repos);
  const growthAgent = getGrowthAgentService(repos);

  let missionId: string | null = null;
  let taskId: string | null = null;
  let workerId: string | null = null;
  let toolCallId: string | null = null;
  let artifactId: string | null = null;
  let artifactTitle = '';
  let knowledgeDocId = '';
  let knowledgeDocTitle = '';
  let knowledgeFilePath = '';
  let evaluationScore = 0;
  let evaluatedBy = '';

  try {
    // Step 1: Create Mission & Delegate Lead Task to Growth Agent
    const missionResult = await missionControl.createAndDelegateMission({
      title: `End-to-End Pass 2 Test Mission ${Date.now()}`,
      objective: 'Validate complete Pass 1 -> Pass 2 loop: Growth Agent Worker -> Artifact -> LLM Evaluation -> Knowledge Draft Compounding',
      founderUid: 'founder_pass2_test',
      taskTitles: [
        'Research developer tooling distribution channels and competitor differentiation',
      ],
    });

    missionId = missionResult.mission.id;
    const delegatedTask = missionResult.delegatedTask;
    if (!delegatedTask) {
      throw new Error('Failed to delegate task to agent-growth');
    }
    taskId = delegatedTask.id;

    results.push({
      step: '1. Mission & Task Delegation',
      success: delegatedTask.assignedTo === 'agent-growth' && delegatedTask.status === 'in_progress',
      details: {
        missionId,
        taskId,
        assignedAgent: delegatedTask.assignedTo,
      },
    });

    // Step 2: Execute Pass 1 (Growth Agent -> Worker -> Search Tool -> Artifact)
    const pass1Exec = await growthAgent.executeDelegatedTask(taskId);
    workerId = pass1Exec.worker.id;
    toolCallId = pass1Exec.toolCall.id;
    artifactId = pass1Exec.artifact.id;
    artifactTitle = pass1Exec.artifact.title;

    results.push({
      step: '2. Pass 1 Worker & Artifact Generation',
      success: pass1Exec.success && !!pass1Exec.artifact && !!pass1Exec.worker,
      details: {
        workerId,
        toolCallId,
        artifactId,
        artifactType: pass1Exec.artifact.type,
      },
    });

    // Step 3: Mission Control Pass 2 LLM Usability Check
    const pass2Result = await missionControl.evaluateAndCompoundArtifact(artifactId);
    evaluationScore = pass2Result.evaluation.score;
    evaluatedBy = pass2Result.evaluation.evaluatedBy;

    results.push({
      step: '3. Pass 2 LLM Usability Check',
      success: pass2Result.success && pass2Result.evaluation.passed,
      details: {
        passed: pass2Result.evaluation.passed,
        score: pass2Result.evaluation.score,
        evaluatedBy: pass2Result.evaluation.evaluatedBy,
        reasoning: pass2Result.evaluation.reasoning,
        domain: pass2Result.evaluation.domain,
      },
    });

    if (!pass2Result.knowledgeDocument) {
      throw new Error('Pass 2 failed to create knowledge document');
    }

    knowledgeDocId = pass2Result.knowledgeDocument.id;
    knowledgeDocTitle = pass2Result.knowledgeDocument.title;
    knowledgeFilePath = pass2Result.knowledgeDocument.filePath || `/company/${pass2Result.knowledgeDocument.domain}/${pass2Result.knowledgeDocument.id}.md`;

    // Step 4: Verify Knowledge Draft Doc in /company repository
    const retrievedDoc = await repos.knowledge.getById(knowledgeDocId);
    const hasMissionSource = retrievedDoc?.sources.some((s) => s.includes(missionId!));
    const isDraft = retrievedDoc?.status === 'draft';
    const hasContent = (retrievedDoc?.content.length || 0) > 100;

    results.push({
      step: '4. Knowledge Draft Compounding & Mission Reference Verification',
      success: !!retrievedDoc && isDraft && !!hasMissionSource && hasContent,
      details: {
        knowledgeDocId,
        status: retrievedDoc?.status,
        domain: retrievedDoc?.domain,
        sources: retrievedDoc?.sources,
        hasMissionSource,
        filePath: retrievedDoc?.filePath,
      },
    });

    // Step 5: Verify End-to-End Chain Linkage
    const allPassed = results.every((r) => r.success);
    results.push({
      step: '5. Complete End-to-End Chain Linkage',
      success: allPassed,
      details: {
        missionId,
        taskId,
        workerId,
        artifactId,
        knowledgeDocId,
        chainComplete: true,
      },
    });

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
        knowledgeDocId,
        knowledgeDocTitle,
        knowledgeFilePath,
        evaluationScore,
        evaluatedBy,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({
      step: 'Pass 2 Execution Failure',
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
