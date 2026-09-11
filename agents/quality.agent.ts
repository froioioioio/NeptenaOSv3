import { RepositoryBundle, getRepositories } from '@/lib/repositories';
import {
  TaskEntity,
  WorkerEntity,
  ToolCallEntity,
  ArtifactEntity,
  AgentEntity,
  MissionEntity,
} from '@/schemas/repositories';
import { executeQualityAuditTool, QualityAuditToolOutput } from '@/tools/quality.tool';
import { assertMissionBudgetBeforeSpawn } from '@/lib/budget';

export interface QualityExecutionResult {
  success: boolean;
  missionId: string;
  taskId: string;
  agent: AgentEntity;
  worker: WorkerEntity;
  toolCall: ToolCallEntity;
  artifact: ArtifactEntity;
  updatedTask: TaskEntity;
  qaOutput: QualityAuditToolOutput;
  summary: string;
}

export class QualityAgentService {
  constructor(private repos: RepositoryBundle = getRepositories()) {}

  /**
   * Ensures the Quality Specialist Agent exists in Firestore.
   */
  async ensureQualityAgent(): Promise<AgentEntity> {
    let agent = await this.repos.agents.getById('agent-quality');
    if (!agent) {
      agent = await this.repos.agents.create({
        id: 'agent-quality',
        name: 'Quality Specialist Agent',
        role: 'quality',
        status: 'idle',
        capabilities: [
          'independent_qa',
          'objective_verification',
          'black_box_testing',
          'growth_scrutiny',
          'code_verification',
          'deliverable_audit',
        ],
        modelTier: 'gemini-3.7-flash',
      });
    }
    return agent;
  }

  /**
   * Executes an Independent Black-Box QA Audit Task:
   * 1. Validates assigned task.
   * 2. Retrieves target deliverable (from Development or Growth) to scrutinize.
   * 3. Strictly excludes implementation plans or internal design docs to eliminate confirmation bias.
   * 4. Spawns an Ephemeral Worker (`quality_audit_worker`).
   * 5. Runs the Quality Audit Tool with objective mission criteria.
   * 6. Records ToolCall and publishes a versioned Independent QA Audit Artifact.
   * 7. Completes worker and marks task done.
   */
  async executeDelegatedTask(
    taskId: string,
    targetArtifactId?: string,
    options?: { customPrompt?: string; taskInstruction?: string; auditFocus?: string }
  ): Promise<QualityExecutionResult> {
    const task = await this.repos.tasks.getById(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found`);
    }

    const mission = await this.repos.missions.getById(task.missionId);
    if (!mission) {
      throw new Error(`Mission [${task.missionId}] not found for Task [${taskId}]`);
    }

    // 1. Ensure Quality Specialist Agent exists & is marked running
    await this.ensureQualityAgent();
    const agent = await this.repos.agents.update('agent-quality', {
      status: 'running',
      currentMissionId: mission.id,
    });

    // 2. Budget / concurrency limit verification
    await assertMissionBudgetBeforeSpawn(this.repos, mission.id, 'agent-quality');

    // 3. Find the target deliverable/artifact to audit
    let deliverableArtifact: ArtifactEntity | null = null;
    if (targetArtifactId) {
      deliverableArtifact = await this.repos.artifacts.getById(targetArtifactId);
    }

    if (!deliverableArtifact) {
      // Find most recent artifact in the mission created by Dev or Growth
      const missionArtifacts = await this.repos.artifacts.listByMission(mission.id);
      deliverableArtifact = missionArtifacts[0] || null;
    }

    const targetTitle = deliverableArtifact?.title || `Specialist Output for ${task.title}`;
    const targetType = deliverableArtifact?.type || 'markdown';
    const targetContent = deliverableArtifact?.content || `# Deliverable under Review\n\nTask: ${task.title}\nDescription: ${task.description}`;
    const producerRole = targetType === 'code' ? 'development' : 'growth';

    // 4. Spawn Ephemeral Worker
    const now = Date.now();
    const worker = await this.repos.workers.create({
      taskId: task.id,
      missionId: mission.id,
      parentAgentId: 'agent-quality',
      role: 'quality_audit_worker',
      status: 'running',
      spawnedAt: now,
    });

    // Merge baseline system prompt with user custom prompt on top
    const baseSystemPrompt = agent.prompt || agent.systemPrompt || 'You are the Independent Quality Specialist Agent of Neptena-OS.';
    const combinedCustomPrompt = options?.customPrompt
      ? `${baseSystemPrompt}\n\n[USER SPECIFIC QA AUDIT CRITERIA & DIRECTIVES]:\n${options.customPrompt}`
      : baseSystemPrompt;

    // 5. Create ToolCall record in Firestore
    const toolCallRecord = await this.repos.toolCalls.create({
      missionId: mission.id,
      taskId: task.id,
      agentId: 'agent-quality',
      workerId: worker.id,
      toolName: 'tool-independent-qa-audit',
      input: {
        missionTitle: mission.title,
        missionObjective: mission.objective,
        targetDeliverableTitle: targetTitle,
        targetDeliverableType: targetType,
        producerRole,
        antiBiasMode: 'black_box_strict',
        customPromptProvided: !!options?.customPrompt,
      },
      status: 'running',
      startedAt: Date.now(),
    });

    // 6. Execute Black-Box Quality Audit Tool (blinded to implementation plan)
    const qaOutput: QualityAuditToolOutput = await executeQualityAuditTool({
      missionId: mission.id,
      missionTitle: mission.title,
      missionObjective: options?.customPrompt ? `${mission.objective} (Audit Criteria: ${options.customPrompt})` : mission.objective,
      targetDeliverableTitle: targetTitle,
      targetDeliverableType: targetType,
      targetDeliverableContent: targetContent,
      producerRole,
      model: agent.modelTier || 'gemini-3.7-flash',
      customPrompt: combinedCustomPrompt,
    });

    // Update ToolCall with result
    const completedToolCall = await this.repos.toolCalls.update(toolCallRecord.id, {
      output: {
        passed: qaOutput.passed,
        qualityScore: qaOutput.qualityScore,
        verdict: qaOutput.verdict,
        alignmentWithGoal: qaOutput.alignmentWithGoal,
        findingsCount: qaOutput.positiveFindings.length,
        defectsCount: qaOutput.defectsOrGaps.length,
        scrutinySummary: qaOutput.scrutinySummary,
      },
      status: 'success',
      completedAt: Date.now(),
    });

    // 7. Format & Create QA Audit Artifact in Firestore
    const artifactMarkdown = this.formatQualityAuditArtifact(mission, task, qaOutput, targetTitle, worker.id);

    const artifact = await this.repos.artifacts.create({
      missionId: mission.id,
      taskId: task.id,
      title: `Independent QA Audit: ${targetTitle}`,
      type: 'markdown',
      content: artifactMarkdown,
      version: 1,
    });

    // 8. Terminate / Complete Worker
    const completedWorker = await this.repos.workers.updateStatus(
      worker.id,
      'completed',
      `Independent black-box audit completed with verdict: ${qaOutput.verdict} (Score: ${(qaOutput.qualityScore * 100).toFixed(0)}%).`
    );

    // 9. Update Task status
    const updatedTask = await this.repos.tasks.update(task.id, {
      status: 'completed',
    });

    // 10. Check if remaining tasks exist; if not reset agent to idle
    const allTasks = await this.repos.tasks.listByMission(mission.id);
    const hasRemainingPending = allTasks.some((t) => t.id !== task.id && t.status === 'pending');
    if (!hasRemainingPending) {
      await this.repos.agents.update('agent-quality', {
        status: 'idle',
        currentMissionId: '',
      });
    }

    return {
      success: true,
      missionId: mission.id,
      taskId: task.id,
      agent,
      worker: completedWorker,
      toolCall: completedToolCall,
      artifact,
      updatedTask,
      qaOutput,
      summary: `Quality Specialist Agent audited "${targetTitle}". Verdict: ${qaOutput.verdict} (${(qaOutput.qualityScore * 100).toFixed(0)}% quality score).`,
    };
  }

  /**
   * Helper to format rigorous Markdown report for the Quality Audit Artifact.
   */
  private formatQualityAuditArtifact(
    mission: MissionEntity,
    task: TaskEntity,
    qa: QualityAuditToolOutput,
    targetTitle: string,
    workerId: string
  ): string {
    const statusEmoji = qa.verdict === 'APPROVED' ? '🛡️ [APPROVED]' : (qa.verdict === 'REQUIRES_REFINEMENT' ? '⚠️ [REQUIRES REFINEMENT]' : '❌ [REJECTED]');

    const findingsList = qa.positiveFindings.map(f => `- ✅ ${f}`).join('\n');
    const defectsList = qa.defectsOrGaps.length > 0
      ? qa.defectsOrGaps.map(d => `- ⚠️ ${d}`).join('\n')
      : '- ✨ No critical defects or goal deviations detected.';
    const remList = qa.actionableRemediations.length > 0
      ? qa.actionableRemediations.map(r => `- 💡 ${r}`).join('\n')
      : '- 🚀 Deliverable meets or exceeds all mission requirements.';

    return `# Independent Quality Assurance Audit Report

**Verdict**: ${statusEmoji}  
**Quality Score**: \`${(qa.qualityScore * 100).toFixed(0)} / 100\` (${qa.alignmentWithGoal.toUpperCase()} GOAL ALIGNMENT)  
**Deliverable Audited**: \`${targetTitle}\`  
**Mission**: ${mission.title}  
**Auditing Agent**: Quality Specialist Agent (\`agent-quality\`)  
**Executing Worker**: \`${workerId}\`  
**Audit Protocol**: \`tool-independent-qa-audit\` (Black-Box / Anti-Bias)  
**Timestamp**: ${qa.evaluatedAt}  

> 🔒 **Anti-Bias Protocol Notice**:  
> ${qa.blindAuditNotice}

---

## 1. Executive Scrutiny Summary
${qa.scrutinySummary}

---

## 2. Mission Requirements vs. Deliverable Reality
| Parameter | Requirement / Mission Benchmark | Audit Assessment |
| :--- | :--- | :--- |
| **Mission Objective** | *${mission.objective}* | Verified aligned against tangible output |
| **Goal Fidelity** | Uncompromised alignment with founder goals | **${qa.alignmentWithGoal.toUpperCase()}** |
| **Quality Grade** | Minimum 75% threshold for production release | **${(qa.qualityScore * 100).toFixed(0)}%** (${qa.passed ? 'PASSED' : 'FAILED'}) |

---

## 3. Verified Positive Findings & Strengths
${findingsList}

---

## 4. Deficiencies, Gaps & Edge Cases
${defectsList}

---

## 5. Actionable Remediation Directives
${remList}

---
*Generated autonomously by Neptena-OS Quality Specialist Agent \`agent-quality\` (Worker \`${workerId}\`).*
`;
  }
}

// Singleton helper
let _qualityAgentService: QualityAgentService | null = null;
export function getQualityAgentService(repos?: RepositoryBundle): QualityAgentService {
  if (repos) return new QualityAgentService(repos);
  if (!_qualityAgentService) {
    _qualityAgentService = new QualityAgentService();
  }
  return _qualityAgentService;
}
