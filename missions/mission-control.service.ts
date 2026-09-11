import { RepositoryBundle, getRepositories } from '@/lib/repositories';
import {
  MissionEntity,
  TaskEntity,
  AgentEntity,
  ArtifactEntity,
  KnowledgeDocument,
  AgentDirectRequest,
  AgentDirectResponse,
  CreateBranchingMissionInput,
  ConcurrentMissionExecutionResult,
  ConcurrentTaskExecutionSummary,
} from '@/schemas/repositories';
import { evaluateArtifactUsability, ArtifactUsabilityEvaluation } from '@/lib/gemini';
import {
  checkMissionBudget,
  assertMissionBudgetBeforeSpawn,
  MissionBudgetConfig,
  MissionBudgetCheckResult,
} from '@/lib/budget';
import { getGrowthAgentService } from '@/agents/growth.agent';
import { getDevelopmentAgentService } from '@/agents/development.agent';
import { getQualityAgentService } from '@/agents/quality.agent';
import {
  ensureMissionProjectWorkspace,
  saveArtifactToProjectWorkspace,
  executeMissionPullRequestTool,
  MissionPROutput,
} from '@/lib/project-workspace';
import { decomposeMissionWithLLM, DecomposedTask } from '@/lib/gemini-orchestrator';

export interface ConsolidationReport {
  success: boolean;
  totalMissionsScanned: number;
  duplicateGroupsFound: number;
  duplicateMissionsRemoved: number;
  tasksReLinkedOrMerged: number;
  artifactsReLinked: number;
  approvalsReLinked: number;
  toolCallsReLinked: number;
  activitiesReLinked: number;
  details: Array<{
    canonicalId: string;
    canonicalTitle: string;
    mergedDuplicateIds: string[];
    mergedTasksCount: number;
    mergedArtifactsCount: number;
  }>;
  message: string;
}

export interface CreateMissionInput {
  title: string;
  objective: string;
  type?: 'mission' | 'side_quest';
  assignedAgent?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  founderUid: string;
  taskTitles?: string[];
}

export interface MissionDecompositionResult {
  mission: MissionEntity;
  tasks: TaskEntity[];
  delegatedTask?: TaskEntity;
  assignedAgent?: AgentEntity;
}

export interface Pass2CompoundingResult {
  success: boolean;
  evaluation: ArtifactUsabilityEvaluation;
  knowledgeDocument?: KnowledgeDocument;
  artifact: ArtifactEntity;
  mission: MissionEntity;
  task?: TaskEntity | null;
  summary: string;
}

export class MissionControlService {
  constructor(private repos: RepositoryBundle = getRepositories()) {}

  /**
   * Initializes standard system agents in Firestore if not already present.
   */
  async ensureSystemAgents(): Promise<void> {
    const ceoAgent = await this.repos.agents.getById('agent-ceo');
    if (!ceoAgent) {
      await this.repos.agents.create({
        id: 'agent-ceo',
        name: 'Neptena CEO Agent',
        role: 'ceo',
        status: 'idle',
        description: 'Executive orchestrator translating strategic founder objectives into decomposed missions and delegating tasks.',
        capabilities: ['mission_planning', 'agent_delegation', 'knowledge_synthesis', 'autonomy_governance'],
        modelTier: 'gemini-3.1-pro-preview',
        prompt: `You are the Executive CEO Orchestrator for Neptena-OS.
Your objective is to translate high-level founder strategy into structured, decomposed missions, establish topological dependency graphs across Growth, Development, and Quality specialists, enforce autonomy governance policies, and ensure seamless knowledge compounding across the entire organization.`,
        systemPrompt: `You are the Executive CEO Orchestrator for Neptena-OS.
Your objective is to translate high-level founder strategy into structured, decomposed missions, establish topological dependency graphs across Growth, Development, and Quality specialists, enforce autonomy governance policies, and ensure seamless knowledge compounding across the entire organization.`,
        defaultPrompt: `You are the Executive CEO Orchestrator for Neptena-OS.
Your objective is to translate high-level founder strategy into structured, decomposed missions, establish topological dependency graphs across Growth, Development, and Quality specialists, enforce autonomy governance policies, and ensure seamless knowledge compounding across the entire organization.`,
        maxConcurrentWorkers: 3,
      });
    }

    const growthAgent = await this.repos.agents.getById('agent-growth');
    if (!growthAgent) {
      await this.repos.agents.create({
        id: 'agent-growth',
        name: 'Growth Specialist Agent',
        role: 'growth',
        status: 'idle',
        description: 'Autonomous growth engine performing market intelligence, competitive analysis, messaging, and funnel optimization.',
        capabilities: ['market_analysis', 'copywriting', 'funnel_optimization', 'distribution'],
        modelTier: 'gemini-3.7-flash',
        prompt: `You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.
Your objective is to perform rigorous market research, competitive analysis, messaging, positioning, and funnel optimization. Always ground your conclusions in factual market data and deliver clear, actionable growth blueprints.`,
        systemPrompt: `You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.
Your objective is to perform rigorous market research, competitive analysis, messaging, positioning, and funnel optimization. Always ground your conclusions in factual market data and deliver clear, actionable growth blueprints.`,
        defaultPrompt: `You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.
Your objective is to perform rigorous market research, competitive analysis, messaging, positioning, and funnel optimization. Always ground your conclusions in factual market data and deliver clear, actionable growth blueprints.`,
        maxConcurrentWorkers: 5,
      });
    }

    const devAgent = await this.repos.agents.getById('agent-development');
    if (!devAgent) {
      await this.repos.agents.create({
        id: 'agent-development',
        name: 'Development Lead Agent',
        role: 'development',
        status: 'idle',
        description: 'Technical lead generating production code scaffolds, opening draft pull requests, and managing release autonomy gates.',
        capabilities: ['prd_analysis', 'scaffolding', 'git_workflow', 'code_generation', 'qa_testing'],
        modelTier: 'gemini-3.7-flash',
        prompt: `You are the Technical Development Lead Agent of Neptena-OS.
Your objective is to translate PRDs and technical tasks into clean, production-grade TypeScript/Next.js code architectures, scaffold git branches and commits, create structured pull requests, and verify code against release autonomy gates.`,
        systemPrompt: `You are the Technical Development Lead Agent of Neptena-OS.
Your objective is to translate PRDs and technical tasks into clean, production-grade TypeScript/Next.js code architectures, scaffold git branches and commits, create structured pull requests, and verify code against release autonomy gates.`,
        defaultPrompt: `You are the Technical Development Lead Agent of Neptena-OS.
Your objective is to translate PRDs and technical tasks into clean, production-grade TypeScript/Next.js code architectures, scaffold git branches and commits, create structured pull requests, and verify code against release autonomy gates.`,
        maxConcurrentWorkers: 5,
      });
    }

    const qualityAgent = await this.repos.agents.getById('agent-quality');
    if (!qualityAgent) {
      await this.repos.agents.create({
        id: 'agent-quality',
        name: 'Quality Specialist Agent',
        role: 'quality',
        status: 'idle',
        description: 'Independent black-box QA specialist scrutinizing and testing Development and Growth deliverables against founder objectives without implementation bias.',
        capabilities: ['independent_qa', 'objective_verification', 'black_box_testing', 'growth_scrutiny', 'code_verification', 'deliverable_audit'],
        modelTier: 'gemini-3.7-flash',
        prompt: `You are the Independent Quality Specialist Agent of Neptena-OS.
Your objective is to conduct independent black-box quality audits on deliverables from Growth and Development. Blinded to implementation plans, judge deliverables strictly on goal fidelity, technical craftsmanship, edge cases, and founder requirements.`,
        systemPrompt: `You are the Independent Quality Specialist Agent of Neptena-OS.
Your objective is to conduct independent black-box quality audits on deliverables from Growth and Development. Blinded to implementation plans, judge deliverables strictly on goal fidelity, technical craftsmanship, edge cases, and founder requirements.`,
        defaultPrompt: `You are the Independent Quality Specialist Agent of Neptena-OS.
Your objective is to conduct independent black-box quality audits on deliverables from Growth and Development. Blinded to implementation plans, judge deliverables strictly on goal fidelity, technical craftsmanship, edge cases, and founder requirements.`,
        maxConcurrentWorkers: 4,
      });
    }
  }

  /**
   * Handles direct Agent requests to Mission Control (no message bus needed, synchronous request/response).
   * Logs every request and response as an ActivityRecord in Firestore.
   */
  async handleAgentDirectRequest(request: AgentDirectRequest): Promise<AgentDirectResponse> {
    const { missionId, agentId, taskId, requestType, payload } = request;
    const now = Date.now();
    let actionTaken = '';
    let message = '';
    let responseData: Record<string, unknown> = {};
    let status: 'success' | 'failed' = 'success';
    let errorMsg: string | undefined;

    try {
      const mission = await this.repos.missions.getById(missionId);
      if (!mission) {
        throw new Error(`Mission [${missionId}] not found`);
      }

      switch (requestType) {
        case 're_prioritize': {
          const newPriority = payload.newPriority || 'high';
          const oldPriority = mission.priority;
          const targetTaskId = payload.targetTaskId || taskId;

          await this.repos.missions.update(missionId, {
            priority: newPriority,
            updatedAt: now,
          });

          let targetTask: TaskEntity | null = null;
          if (targetTaskId) {
            targetTask = await this.repos.tasks.getById(targetTaskId);
          }

          actionTaken = `Mission Control updated mission priority from [${oldPriority}] to [${newPriority}]`;
          message = `Priority successfully adjusted to [${newPriority}]. Reason: ${payload.priorityReason || 'Agent autonomous optimization request'}`;
          responseData = {
            missionId,
            oldPriority,
            newPriority,
            reason: payload.priorityReason || 'Autonomous optimization',
            targetTaskId,
            targetTaskTitle: targetTask?.title,
            updatedAt: now,
          };
          break;
        }

        case 'ask_agent_output': {
          const targetAgentId = payload.targetAgentId || (agentId === 'agent-growth' ? 'agent-development' : 'agent-growth');
          const artifactType = payload.artifactType;

          // Query artifacts associated with this mission or matching target agent/type
          const missionArtifacts = await this.repos.artifacts.listByMission(missionId);
          let relevantArtifacts = missionArtifacts;
          if (artifactType) {
            relevantArtifacts = missionArtifacts.filter(a => a.type === artifactType);
          }

          // Also check if knowledge docs exist referencing this mission
          const knowledgeDocs = (await this.repos.knowledge.listAll?.()) || [];
          const relatedKnowledge = knowledgeDocs.filter(d => 
            d.sources?.some(s => s.includes(missionId) || s.includes(targetAgentId)) ||
            d.title.toLowerCase().includes(mission.title.toLowerCase().slice(0, 15))
          );

          // Fetch tool calls to extract latest agent outputs
          const agentToolCalls = await this.repos.toolCalls.listByAgent(targetAgentId);
          const latestToolCall = agentToolCalls[0] || null;

          actionTaken = `Mission Control retrieved intelligence package from [${targetAgentId}] for [${agentId}]`;
          message = `Found ${relevantArtifacts.length} artifact(s) and ${relatedKnowledge.length} knowledge doc(s) from [${targetAgentId}].`;
          
          responseData = {
            requestingAgent: agentId,
            targetAgent: targetAgentId,
            missionId,
            artifactsCount: relevantArtifacts.length,
            artifacts: relevantArtifacts.map(a => ({
              id: a.id,
              title: a.title,
              type: a.type,
              version: a.version,
              snippet: a.content.slice(0, 300) + (a.content.length > 300 ? '...' : ''),
              fullContent: a.content,
              createdAt: a.createdAt,
            })),
            knowledgeDocs: relatedKnowledge.map(k => ({
              id: k.id,
              title: k.title,
              domain: k.domain,
              confidence: k.confidence,
              snippet: k.content.slice(0, 300) + '...',
            })),
            latestToolCallSnippet: latestToolCall?.output ? JSON.stringify(latestToolCall.output).slice(0, 200) : null,
          };
          break;
        }

        case 'flag_blocker': {
          const blockerReason = payload.blockerReason || 'Unspecified technical blocker';
          const severity = payload.severity || 'blocking';
          const targetTaskId = taskId || payload.targetTaskId;

          let blockedTask: TaskEntity | null = null;
          if (targetTaskId) {
            blockedTask = await this.repos.tasks.getById(targetTaskId);
            if (blockedTask) {
              await this.repos.tasks.update(targetTaskId, {
                status: 'blocked',
                updatedAt: now,
              });
            }
          }

          actionTaken = `Mission Control registered blocker on task [${targetTaskId || 'mission-level'}] with severity [${severity}]`;
          message = `Blocker registered: "${blockerReason}". Task status marked as 'blocked'. Mission Control flagged for Founder attention.`;
          
          responseData = {
            missionId,
            taskId: targetTaskId,
            taskTitle: blockedTask?.title,
            blockerReason,
            severity,
            suggestedRemedy: payload.suggestedRemedy || 'Awaiting dependency resolution or Founder input',
            taskStatus: 'blocked',
            flaggedAt: now,
          };
          break;
        }

        case 'custom_request':
        default: {
          actionTaken = `Mission Control processed custom request: ${payload.customAction || 'query'}`;
          message = `Custom request processed successfully.`;
          responseData = {
            missionId,
            agentId,
            customAction: payload.customAction,
            processedAt: now,
            details: payload.customParams || {},
          };
          break;
        }
      }
    } catch (err: unknown) {
      status = 'failed';
      errorMsg = err instanceof Error ? err.message : String(err);
      actionTaken = `Mission Control failed to process request [${requestType}]`;
      message = `Error: ${errorMsg}`;
    }

    // 1. Log as ActivityRecord in Firestore
    const activity = await this.repos.activities.create({
      missionId,
      taskId: taskId || undefined,
      agentId,
      requestType,
      action: actionTaken,
      details: (payload || {}) as Record<string, unknown>,
      result: responseData,
      status,
      timestamp: now,
    });

    // 2. Also log as ToolCall telemetry for unified agent trace
    await this.repos.toolCalls.create({
      missionId,
      taskId: taskId || 'mission-control',
      agentId,
      toolName: `mc_direct_request:${requestType}`,
      input: { requestType, ...payload },
      output: responseData,
      status: status === 'success' ? 'success' : 'failed',
      startedAt: now,
      completedAt: Date.now(),
      error: errorMsg,
    }).catch(() => null);

    return {
      success: status === 'success',
      activityId: activity.id,
      requestType,
      agentId,
      missionId,
      taskId,
      timestamp: now,
      actionTaken,
      message,
      data: responseData,
      error: errorMsg,
    };
  }

  /**
   * Creates a Mission with custom branch definitions (supporting independent concurrent branches).
   */
  async createBranchingMission(input: CreateBranchingMissionInput): Promise<MissionDecompositionResult> {
    await this.ensureSystemAgents();

    // 0. Deduplication check: If identical mission already exists and is active/completed, reuse it
    const existing = await this.findExistingDuplicateMission(input.title, input.objective, input.founderUid);
    if (existing) {
      const existingTasks = await this.repos.tasks.listByMission(existing.id);
      const rootTask = existingTasks.find(t => !t.dependsOnTaskIds || t.dependsOnTaskIds.length === 0) || existingTasks[0];
      const assignedAgent = await this.repos.agents.getById(existing.assignedAgent || 'agent-ceo');
      return {
        mission: existing,
        tasks: existingTasks,
        delegatedTask: rootTask,
        assignedAgent: assignedAgent || undefined,
      };
    }

    // 1. Create Mission entity
    const mission = await this.repos.missions.create({
      title: input.title,
      objective: input.objective,
      type: 'mission',
      assignedAgent: 'agent-ceo',
      status: 'active',
      priority: input.priority || 'high',
      founderUid: input.founderUid,
    });

    // Initialize dedicated workspace directory on disk
    try {
      const { folderName } = await ensureMissionProjectWorkspace(mission);
      await this.repos.missions.update(mission.id, { projectFolder: folderName });
      mission.projectFolder = folderName;
    } catch (err) {
      console.warn(`Failed initializing project workspace for mission [${mission.id}]:`, err);
    }

    const createdTasks: TaskEntity[] = [];
    const taskIndexToIdMap = new Map<number, string>();

    // 2. Create tasks with topological index mapping for branch dependencies
    for (let i = 0; i < input.tasks.length; i++) {
      const spec = input.tasks[i];
      const autoAgent = spec.assignedTo || this.classifyTaskAgentType(spec.title, spec.description);
      
      // Resolve dependencies either from explicit task IDs or from branch indices
      const resolvedDependsOn: string[] = spec.dependsOnTaskIds ? [...spec.dependsOnTaskIds] : [];
      if (spec.dependsOnBranchIndices && spec.dependsOnBranchIndices.length > 0) {
        for (const idx of spec.dependsOnBranchIndices) {
          const depId = taskIndexToIdMap.get(idx);
          if (depId && !resolvedDependsOn.includes(depId)) {
            resolvedDependsOn.push(depId);
          }
        }
      }

      const task = await this.repos.tasks.create({
        missionId: mission.id,
        title: spec.title,
        description: spec.description || `Branch Task ${i + 1}: ${spec.title}`,
        status: 'pending',
        assignedTo: autoAgent,
        dependsOnTaskIds: resolvedDependsOn,
      });

      createdTasks.push(task);
      taskIndexToIdMap.set(i, task.id);
    }

    // Find independent root tasks (dependsOnTaskIds is empty) and mark as ready / in_progress
    const independentRoots = createdTasks.filter(t => !t.dependsOnTaskIds || t.dependsOnTaskIds.length === 0);
    for (const rootTask of independentRoots) {
      await this.repos.tasks.update(rootTask.id, {
        status: 'in_progress',
      });
    }

    return {
      mission,
      tasks: createdTasks,
      delegatedTask: independentRoots[0],
    };
  }

  /**
   * Evaluates the active mission against configured resource budgets.
   */
  async checkMissionBudget(missionId: string, overrides?: Partial<MissionBudgetConfig>): Promise<MissionBudgetCheckResult> {
    return checkMissionBudget(this.repos, missionId, overrides);
  }

  /**
   * Asserts mission budget is intact before spawning workers or tool calls.
   */
  async assertMissionBudget(missionId: string, overrides?: Partial<MissionBudgetConfig>): Promise<MissionBudgetCheckResult> {
    return assertMissionBudgetBeforeSpawn(this.repos, missionId, overrides);
  }

  /**
   * Executes independent tasks within a mission CONCURRENTLY in parallel waves.
   */
  async executeMissionConcurrently(missionId: string, budgetOverrides?: Partial<MissionBudgetConfig>): Promise<ConcurrentMissionExecutionResult> {
    await this.ensureSystemAgents();
    const startTime = Date.now();
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) {
      throw new Error(`Mission [${missionId}] not found`);
    }

    // Enforce pre-flight budget check before mission execution begins
    await this.assertMissionBudget(missionId, budgetOverrides);

    // Set mission status to active
    await this.repos.missions.update(missionId, { status: 'active', updatedAt: startTime });

    const growthAgent = getGrowthAgentService(this.repos);
    const devAgent = getDevelopmentAgentService(this.repos);
    const qualityAgent = getQualityAgentService(this.repos);

    const logs: string[] = [];
    logs.push(`[${new Date().toISOString()}] Initializing Concurrent Mission Execution for Mission [${missionId}]: "${mission.title}"`);

    const executedTasks: ConcurrentTaskExecutionSummary[] = [];
    const waves: Array<{
      waveNumber: number;
      tasksRanSimultaneously: string[];
      taskCount: number;
      waveStartedAt: number;
      waveCompletedAt: number;
      waveDurationMs: number;
    }> = [];

    let waveIndex = 1;
    let maxConcurrentTasksRan = 0;
    const maxSafetyIterations = 20;
    let iteration = 0;

    while (iteration < maxSafetyIterations) {
      iteration++;

      // Pre-wave budget assertion
      const budgetCheck = await this.checkMissionBudget(missionId, budgetOverrides);
      if (!budgetCheck.allowed) {
        logs.push(`[Wave ${waveIndex} BLOCKED] Budget limit reached: ${budgetCheck.reason}. Halting further wave execution.`);
        break;
      }

      // Fetch fresh tasks from database
      const allTasks = await this.repos.tasks.listByMission(missionId);
      const completedTaskIds = new Set(allTasks.filter(t => t.status === 'completed').map(t => t.id));

      // Find all ready tasks:
      // 1. Not already completed or failed
      // 2. All dependsOnTaskIds are in completedTaskIds (or dependsOnTaskIds is empty)
      const readyTasks = allTasks.filter(task => {
        if (task.status === 'completed' || task.status === 'failed') return false;
        const deps = task.dependsOnTaskIds || [];
        return deps.every(depId => completedTaskIds.has(depId));
      });

      if (readyTasks.length === 0) {
        logs.push(`[Wave ${waveIndex}] No more ready tasks found. DAG traversal completed.`);
        break;
      }

      const waveStartedAt = Date.now();
      const waveTaskTitles = readyTasks.map(t => `"${t.title}" (${t.id.slice(0, 6)})`);
      logs.push(`[Wave ${waveIndex} START] Launching ${readyTasks.length} independent task(s) CONCURRENTLY in parallel: ${waveTaskTitles.join(', ')}`);

      if (readyTasks.length > maxConcurrentTasksRan) {
        maxConcurrentTasksRan = readyTasks.length;
      }

      // Mark all ready tasks as in_progress immediately before concurrent launch
      await Promise.all(readyTasks.map(t => this.repos.tasks.update(t.id, { status: 'in_progress', updatedAt: Date.now() })));

      // EXECUTE ALL READY TASKS CONCURRENTLY VIA Promise.all
      const waveResults = await Promise.all(
        readyTasks.map(async (task) => {
          const taskStart = Date.now();
          const targetAgent = task.assignedTo === 'agent-quality'
            ? 'agent-quality'
            : (task.assignedTo === 'agent-development'
                ? 'agent-development'
                : (task.assignedTo === 'agent-growth' ? 'agent-growth' : this.classifyTaskAgentType(task.title, task.description)));
          
          try {
            let workerId = '';
            let toolCallId = '';
            let artifactId = '';
            let artifactTitle = '';

            if (targetAgent === 'agent-quality') {
              const qaRes = await qualityAgent.executeDelegatedTask(task.id);
              workerId = qaRes.worker.id;
              toolCallId = qaRes.toolCall.id;
              artifactId = qaRes.artifact.id;
              artifactTitle = qaRes.artifact.title;
            } else if (targetAgent === 'agent-development') {
              const devRes = await devAgent.executeDelegatedTask(task.id);
              workerId = devRes.worker.id;
              toolCallId = devRes.toolCall.id;
              artifactId = devRes.artifact.id;
              artifactTitle = devRes.artifact.title;
            } else {
              const growthRes = await growthAgent.executeDelegatedTask(task.id);
              workerId = growthRes.worker.id;
              toolCallId = growthRes.toolCall.id;
              artifactId = growthRes.artifact.id;
              artifactTitle = growthRes.artifact.title;
            }

            const taskEnd = Date.now();
            const duration = taskEnd - taskStart;

            logs.push(`  [Wave ${waveIndex} Task Complete] Task [${task.id.slice(0, 6)}] "${task.title}" finished concurrently in ${duration}ms (Agent: ${targetAgent}, Worker: ${workerId}, Artifact: ${artifactId})`);

            return {
              taskId: task.id,
              taskTitle: task.title,
              assignedTo: targetAgent,
              workerId,
              toolCallId,
              artifactId,
              artifactTitle,
              status: 'completed' as const,
              startedAt: taskStart,
              completedAt: taskEnd,
              durationMs: duration,
              waveIndex,
            };
          } catch (taskErr: unknown) {
            const taskEnd = Date.now();
            const errorStr = taskErr instanceof Error ? taskErr.message : String(taskErr);
            await this.repos.tasks.update(task.id, { status: 'failed', updatedAt: taskEnd });
            logs.push(`  [Wave ${waveIndex} Task FAILED] Task [${task.id.slice(0, 6)}] "${task.title}" failed: ${errorStr}`);

            return {
              taskId: task.id,
              taskTitle: task.title,
              assignedTo: targetAgent,
              workerId: 'failed',
              toolCallId: 'failed',
              status: 'failed' as const,
              startedAt: taskStart,
              completedAt: taskEnd,
              durationMs: taskEnd - taskStart,
              waveIndex,
              error: errorStr,
            };
          }
        })
      );

      const waveCompletedAt = Date.now();
      const waveDurationMs = waveCompletedAt - waveStartedAt;

      waves.push({
        waveNumber: waveIndex,
        tasksRanSimultaneously: readyTasks.map(t => t.title),
        taskCount: readyTasks.length,
        waveStartedAt,
        waveCompletedAt,
        waveDurationMs,
      });

      executedTasks.push(...waveResults);
      logs.push(`[Wave ${waveIndex} COMPLETE] ${readyTasks.length} concurrent tasks finished in wave duration: ${waveDurationMs}ms.`);

      waveIndex++;
    }

    // Final evaluation of mission status
    const finalTasks = await this.repos.tasks.listByMission(missionId);
    const allCompleted = finalTasks.length > 0 && finalTasks.every(t => t.status === 'completed');
    const hasFailed = finalTasks.some(t => t.status === 'failed');
    const finalMissionStatus = allCompleted ? 'completed' : (hasFailed ? 'failed' : 'active');

    await this.repos.missions.update(missionId, {
      status: finalMissionStatus,
      updatedAt: Date.now(),
    });

    const totalDurationMs = Date.now() - startTime;
    logs.push(`[${new Date().toISOString()}] Concurrent Mission Execution finished with status [${finalMissionStatus}] in ${totalDurationMs}ms total.`);

    // Verify concurrent overlaps: true if any wave had >1 task
    const concurrentOverlapsDetected = waves.some(w => w.taskCount > 1);

    return {
      missionId,
      missionTitle: mission.title,
      status: finalMissionStatus,
      totalTasks: finalTasks.length,
      completedTasksCount: finalTasks.filter(t => t.status === 'completed').length,
      failedTasksCount: finalTasks.filter(t => t.status === 'failed').length,
      totalDurationMs,
      wavesExecuted: waves.length,
      maxConcurrentTasksRan,
      concurrencyProof: {
        waves,
        concurrentOverlapsDetected,
      },
      executedTasks,
      logs,
    };
  }

  /**
   * Creates a Mission, decomposes it into Tasks, and delegates one Task to the hardcoded Growth Agent.
   */
  async createAndDelegateMission(input: CreateMissionInput): Promise<MissionDecompositionResult> {
    await this.ensureSystemAgents();

    // 0. Deduplication check: If identical mission already exists and is active/completed, reuse it
    const existing = await this.findExistingDuplicateMission(input.title, input.objective, input.founderUid);
    if (existing) {
      const existingTasks = await this.repos.tasks.listByMission(existing.id);
      const primaryTask = existingTasks.find(t => t.status === 'in_progress') || existingTasks[0];
      const assignedAgent = await this.repos.agents.getById(existing.assignedAgent || 'agent-ceo');
      return {
        mission: existing,
        tasks: existingTasks,
        delegatedTask: primaryTask,
        assignedAgent: assignedAgent || undefined,
      };
    }

    // 1. Create Mission entity
    const mission = await this.repos.missions.create({
      title: input.title,
      objective: input.objective,
      type: input.type || 'mission',
      assignedAgent: 'agent-ceo', // Default to CEO for all generic mission flows now
      status: 'active',
      priority: input.priority || 'high',
      founderUid: input.founderUid,
    });

    // Initialize dedicated workspace directory on disk
    try {
      const { folderName } = await ensureMissionProjectWorkspace(mission);
      await this.repos.missions.update(mission.id, { projectFolder: folderName });
      mission.projectFolder = folderName;
    } catch (err) {
      console.warn(`Failed initializing project workspace for mission [${mission.id}]:`, err);
    }

    // 2. Break down into discrete Tasks
    let decomposedTasks: DecomposedTask[] = [];
    if (input.taskTitles && input.taskTitles.length > 0) {
      decomposedTasks = input.taskTitles.map(title => ({
        title,
        description: `Objective: ${mission.objective}.`,
        assignedAgent: (input.assignedAgent || this.classifyTaskAgentType(title, mission.objective)) as 'agent-growth' | 'agent-development' | 'agent-quality'
      }));
    } else {
      // Use LLM (Gemini) to orchestrate and manage the mission breakdown
      decomposedTasks = await decomposeMissionWithLLM(mission.title, mission.objective);
      
      // Fallback if LLM fails
      if (!decomposedTasks || decomposedTasks.length === 0) {
        const objContext = input.objective ? ` (${input.objective.slice(0, 70)}${input.objective.length > 70 ? '...' : ''})` : '';
        const fallbackTitles = [
          `Architect and build structural foundation for: ${input.title}${objContext}`,
          `Execute iterative development and component integration`,
          `Conduct independent quality assurance and structural audit`,
        ];
        
        decomposedTasks = fallbackTitles.map(title => ({
          title,
          description: `Objective: ${mission.objective}.`,
          assignedAgent: this.classifyTaskAgentType(title, mission.objective) as "agent-growth" | "agent-development" | "agent-quality"
        }));
      }
    }

    const createdTasks: TaskEntity[] = [];
    for (let i = 0; i < decomposedTasks.length; i++) {
      const taskSpec = decomposedTasks[i];
      const task = await this.repos.tasks.create({
        missionId: mission.id,
        title: taskSpec.title,
        description: taskSpec.description || `Step ${i + 1} of mission plan. Target: ${taskSpec.assignedAgent}.`,
        status: 'pending',
        assignedTo: taskSpec.assignedAgent,
        dependsOnTaskIds: i > 0 && createdTasks[i - 1] ? [createdTasks[i - 1].id] : [],
      });
      createdTasks.push(task);
    }

    // 3. Delegate the primary Task to the specified Agent (or inferred by task type)
    const primaryTask = createdTasks[0];
    const targetAgentId = primaryTask?.assignedTo || 'agent-growth';
    const taskToDelegate = createdTasks[0];
    let delegatedTask: TaskEntity | undefined;
    let assignedAgent: AgentEntity | undefined;

    if (taskToDelegate) {
      // Update Task status to in_progress and assign to the target agent
      delegatedTask = await this.repos.tasks.update(taskToDelegate.id, {
        status: 'in_progress',
        assignedTo: targetAgentId,
      });

      // Update Agent status to running and assign current mission
      assignedAgent = await this.repos.agents.assignMission(targetAgentId, mission.id);
    }

    return {
      mission,
      tasks: createdTasks.map(t => (delegatedTask && t.id === delegatedTask.id ? delegatedTask : t)),
      delegatedTask,
      assignedAgent,
    };
  }

  /**
   * Pass 2: Mission Control takes an Artifact, runs an LLM usability check,
   * and on pass writes a knowledge draft doc referencing the mission.
   */
  async evaluateAndCompoundArtifact(artifactId: string): Promise<Pass2CompoundingResult> {
    const artifact = await this.repos.artifacts.getById(artifactId);
    if (!artifact) {
      throw new Error(`Artifact [${artifactId}] not found`);
    }

    const mission = await this.repos.missions.getById(artifact.missionId);
    if (!mission) {
      throw new Error(`Mission [${artifact.missionId}] not found for Artifact [${artifactId}]`);
    }

    const task = artifact.taskId ? await this.repos.tasks.getById(artifact.taskId) : null;

    // 1. Run LLM Usability Check using Executive Pro Tier (Gemini 3.1 Pro Preview)
    const ceoAgent = await this.repos.agents.getById('agent-ceo');
    const evaluation = await evaluateArtifactUsability({
      missionId: mission.id,
      artifactTitle: artifact.title,
      artifactType: artifact.type,
      artifactContent: artifact.content,
      missionTitle: mission.title,
      missionObjective: mission.objective,
      model: ceoAgent?.modelTier || 'gemini-3.1-pro-preview',
    });

    if (!evaluation.passed) {
      return {
        success: false,
        evaluation,
        artifact,
        mission,
        task,
        summary: `LLM evaluation check failed (Score: ${evaluation.score}). Reason: ${evaluation.reasoning}`,
      };
    }

    // 2. On Pass: Write a Knowledge Draft Doc referencing the mission
    const docTitle = evaluation.recommendedTitle || artifact.title.replace(/^Research Findings:\s*/i, '');
    const docDomain = evaluation.domain || 'growth';
    const confidence = Math.min(1.0, Math.max(0.7, evaluation.score));
    
    // Explicit mission references in frontmatter sources & markdown body
    const sources = [
      `mission:${mission.id}`,
      `mission-title:${mission.title.replace(/[\n\r]+/g, ' ')}`,
      `artifact:${artifact.id}`,
      `task:${task?.id || artifact.taskId}`,
    ];

    const markdownBody = `# ${docTitle}

**Mission Reference**: \`${mission.title}\` (Mission ID: \`${mission.id}\`)  
**Mission Objective**: ${mission.objective}  
**Source Artifact**: \`${artifact.id}\` (Task: \`${task?.title || artifact.taskId}\`)  
**Quality Score**: ${(confidence * 100).toFixed(0)}% (Evaluated by ${evaluation.evaluatedBy})  
**Evaluation Reasoning**: ${evaluation.reasoning}  

---

## Strategic Takeaways
${evaluation.synthesizedTakeaways.map((t) => `- ${t}`).join('\n')}

---

## Synthesized Intelligence & Findings
${evaluation.suggestedMarkdown}

---
*Drafted automatically by Neptena-OS Mission Control Knowledge Compounding Gate from Mission \`${mission.id}\`.*
`;

    const knowledgeDoc = await this.repos.knowledge.createDraft({
      domain: docDomain,
      title: docTitle,
      content: markdownBody,
      confidence,
      sources,
    });

    return {
      success: true,
      evaluation,
      knowledgeDocument: knowledgeDoc,
      artifact,
      mission,
      task,
      summary: `LLM evaluation PASSED (Score: ${evaluation.score}). Created Knowledge Draft [${knowledgeDoc.id}] in /company/${docDomain}/ referencing Mission [${mission.id}].`,
    };
  }

  /**
   * Automatically classifies task category to appropriate Agent ID (Growth, Development, or Quality)
   */
  classifyTaskAgentType(title: string, description?: string): 'agent-growth' | 'agent-development' | 'agent-quality' {
    const text = `${title} ${description || ''}`.toLowerCase();
    const qualityKeywords = [
      'quality', 'qa', 'audit', 'scrutiniz', 'black-box', 'black box', 'verify deliverable',
      'test deliverable', 'independent test', 'unbiased', 'objective check', 'compliance',
      'verify requirement', 'acceptance test'
    ];
    for (const kw of qualityKeywords) {
      if (text.includes(kw)) {
        return 'agent-quality';
      }
    }

    const devKeywords = [
      'scaffold', 'code', 'git', 'pr', 'branch', 'repo', 'repository', 'draft pr',
      'typescript', 'react', 'backend', 'frontend', 'api', 'architecture', 'unit test',
      'test', 'merge', 'production', 'deploy', 'refactor', 'feature', 'bug', 'patch'
    ];
    for (const kw of devKeywords) {
      if (text.includes(kw)) {
        return 'agent-development';
      }
    }
    return 'agent-growth';
  }

  /**
   * Delegates a specific Task to an explicit Agent (Growth, Development, or Quality)
   */
  async delegateTask(taskId: string, agentId: 'agent-growth' | 'agent-development' | 'agent-quality'): Promise<{
    task: TaskEntity;
    agent: AgentEntity;
  }> {
    await this.ensureSystemAgents();

    const task = await this.repos.tasks.getById(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found`);
    }

    const updatedTask = await this.repos.tasks.update(taskId, {
      assignedTo: agentId,
      status: task.status === 'blocked' ? 'blocked' : 'in_progress',
    });

    const updatedAgent = await this.repos.agents.assignMission(agentId, task.missionId);

    return {
      task: updatedTask,
      agent: updatedAgent,
    };
  }

  /**
   * Automatically delegates a Task to Growth, Development, or Quality agent based on title/type
   */
  async delegateTaskByType(taskId: string, forceType?: 'growth' | 'development' | 'quality'): Promise<{
    task: TaskEntity;
    agent: AgentEntity;
  }> {
    const task = await this.repos.tasks.getById(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found`);
    }

    let targetAgentId: 'agent-growth' | 'agent-development' | 'agent-quality';
    if (forceType === 'quality') {
      targetAgentId = 'agent-quality';
    } else if (forceType === 'development') {
      targetAgentId = 'agent-development';
    } else if (forceType === 'growth') {
      targetAgentId = 'agent-growth';
    } else {
      targetAgentId = this.classifyTaskAgentType(task.title, task.description);
    }

    return this.delegateTask(taskId, targetAgentId);
  }

  /**
   * Retrieves a Mission along with all associated Tasks and Agent status.
   */
  async getMissionStatus(missionId: string): Promise<{
    mission: MissionEntity | null;
    tasks: TaskEntity[];
  }> {
    const mission = await this.repos.missions.getById(missionId);
    const tasks = await this.repos.tasks.listByMission(missionId);
    return { mission, tasks };
  }

  /**
   * Generates a consolidated Pull Request for an entire Mission, bundling all code and deliverables.
   */
  async createMissionPullRequest(missionId: string, options?: { targetBranch?: string; repo?: string }): Promise<MissionPROutput> {
    const devService = getDevelopmentAgentService(this.repos);
    return devService.createMissionPR(missionId, options);
  }

  /**
   * Archives an ongoing or completed Mission.
   * Cascades: Also archives all associated deliverables and artifacts so they are removed from the active Mission Control board.
   */
  async archiveMission(missionId: string): Promise<MissionEntity> {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) {
      throw new Error(`Mission [${missionId}] not found`);
    }

    const updated = await this.repos.missions.update(missionId, {
      isArchived: true,
      archivedAt: Date.now(),
    });

    // Cascade to all associated deliverables & artifacts
    let archivedArtifactsCount = 0;
    try {
      const artifacts = await this.repos.artifacts.listByMission(missionId);
      for (const artifact of artifacts) {
        if (artifact.status !== 'archived') {
          await this.repos.artifacts.update(artifact.id, {
            status: 'archived',
          });
          archivedArtifactsCount++;
        }
      }
    } catch (artErr) {
      console.warn(`Failed cascading archive to artifacts for mission [${missionId}]:`, artErr);
    }

    await this.repos.activities.create({
      missionId,
      agentId: 'agent-ceo',
      activityType: 'mission_archived',
      description: `Mission '${mission.title}' (Status: ${mission.status}) moved to central archive. ${archivedArtifactsCount} associated deliverable(s) archived and removed from active board.`,
      status: 'completed',
    });

    return updated;
  }

  /**
   * Unarchives (restores) a Mission back to the active board.
   * Cascades: Also unarchives associated deliverables so they reappear on the board.
   */
  async unarchiveMission(missionId: string): Promise<MissionEntity> {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) {
      throw new Error(`Mission [${missionId}] not found`);
    }

    const updated = await this.repos.missions.update(missionId, {
      isArchived: false,
      archivedAt: undefined,
    });

    // Cascade to restore associated deliverables
    try {
      const artifacts = await this.repos.artifacts.listByMission(missionId);
      for (const artifact of artifacts) {
        if (artifact.status === 'archived') {
          await this.repos.artifacts.update(artifact.id, {
            status: 'pending_approval',
          });
        }
      }
    } catch (artErr) {
      console.warn(`Failed restoring artifacts for unarchived mission [${missionId}]:`, artErr);
    }

    await this.repos.activities.create({
      missionId,
      agentId: 'agent-ceo',
      activityType: 'mission_unarchived',
      description: `Mission '${mission.title}' restored from archive to active board.`,
      status: 'completed',
    });

    return updated;
  }

  /**
   * Cancels a Mission: marks status as 'cancelled' and routes directly to the archive.
   * Cascades: Also cleans up pending/in-progress tasks, resets agent assignments,
   * and archives/cancels all associated deliverables and artifacts so they are removed from the active Mission Control board.
   */
  async cancelMission(missionId: string, reason?: string): Promise<{
    mission: MissionEntity;
    affectedTasksCount: number;
    archivedArtifactsCount: number;
  }> {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) {
      throw new Error(`Mission [${missionId}] not found`);
    }

    const now = Date.now();
    const cancellationReason = reason?.trim() || 'Cancelled by Founder';

    // 1. Update mission status to 'cancelled' and mark as archived
    const updatedMission = await this.repos.missions.update(missionId, {
      status: 'cancelled',
      isArchived: true,
      cancelledAt: now,
      archivedAt: now,
      cancellationReason,
    });

    // 2. Halt/fail all non-completed tasks
    const tasks = await this.repos.tasks.listByMission(missionId);
    let affectedTasksCount = 0;
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'in_progress' || task.status === 'blocked') {
        await this.repos.tasks.update(task.id, {
          status: 'failed',
          description: `${task.description || ''} [Cancelled: ${cancellationReason}]`.trim(),
        });
        affectedTasksCount++;
      }
    }

    // 3. Cascade: Archive all associated deliverables & artifacts
    let archivedArtifactsCount = 0;
    try {
      const artifacts = await this.repos.artifacts.listByMission(missionId);
      for (const artifact of artifacts) {
        await this.repos.artifacts.update(artifact.id, {
          status: 'archived',
        });
        archivedArtifactsCount++;
      }
    } catch (artErr) {
      console.warn(`Failed cascading cancellation to artifacts for mission [${missionId}]:`, artErr);
    }

    // 4. Reset any agents working on this mission
    const allAgents = await this.repos.agents.listAll();
    for (const agent of allAgents) {
      if (agent.currentMissionId === missionId) {
        await this.repos.agents.update(agent.id, {
          status: 'idle',
          currentMissionId: '',
        });
      }
    }

    // 5. Record Activity Log
    await this.repos.activities.create({
      missionId,
      agentId: 'agent-ceo',
      activityType: 'mission_cancelled',
      description: `Mission '${mission.title}' was cancelled (${cancellationReason}) and sent directly to the archive. ${archivedArtifactsCount} associated deliverable(s) archived.`,
      status: 'completed',
    });

    return {
      mission: updatedMission,
      affectedTasksCount,
      archivedArtifactsCount,
    };
  }

  /**
   * Completes a Mission: marks status as 'completed'.
   * Ensures all associated deliverables and artifacts are canonicalized,
   * associated with this mission, and marked as 'completed'.
   * Also cleans up pending/in-progress tasks by marking them completed,
   * resets agent assignments, and logs the completion.
   */
  async completeMission(missionId: string): Promise<{
    mission: MissionEntity;
    affectedTasksCount: number;
    completedArtifactsCount: number;
  }> {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) {
      throw new Error(`Mission [${missionId}] not found`);
    }

    // 1. Update mission status to 'completed'
    const updatedMission = await this.repos.missions.update(missionId, {
      status: 'completed',
    });

    // 2. Mark all non-completed tasks as completed
    const tasks = await this.repos.tasks.listByMission(missionId);
    let affectedTasksCount = 0;
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'in_progress' || task.status === 'blocked') {
        await this.repos.tasks.update(task.id, {
          status: 'completed',
          description: `${task.description || ''} [Mission Marked as Completed]`.trim(),
        });
        affectedTasksCount++;
      }
    }

    // 3. Associate and mark all mission deliverables & artifacts as 'completed'
    const missionArtifacts = await this.repos.artifacts.listByMission(missionId);
    const taskArtifacts = await Promise.all(
      tasks.map((t) => this.repos.artifacts.listByTask(t.id))
    );
    const allRelatedArtifactsMap = new Map<string, ArtifactEntity>();
    for (const art of missionArtifacts) {
      allRelatedArtifactsMap.set(art.id, art);
    }
    for (const taskArtList of taskArtifacts) {
      for (const art of taskArtList) {
        allRelatedArtifactsMap.set(art.id, art);
      }
    }

    let completedArtifactsCount = 0;
    const now = Date.now();
    for (const art of allRelatedArtifactsMap.values()) {
      if (art.status !== 'archived') {
        let projectFilePath = art.projectFilePath;
        let projectFolder = art.projectFolder;

        try {
          const workspaceResult = await saveArtifactToProjectWorkspace(updatedMission, art);
          if (workspaceResult?.projectFilePath) {
            projectFilePath = workspaceResult.projectFilePath;
            projectFolder = workspaceResult.projectFolder;
          }
        } catch (wsErr) {
          console.warn(`[completeMission] Could not save artifact to project workspace:`, wsErr);
        }

        await this.repos.artifacts.update(art.id, {
          missionId: missionId,
          status: 'completed',
          approvedBy: art.approvedBy || 'Founder / CEO',
          approvedAt: art.approvedAt || now,
          projectFilePath: projectFilePath || art.projectFilePath,
          projectFolder: projectFolder || art.projectFolder,
          updatedAt: now,
        });

        completedArtifactsCount++;
      }
    }

    // 4. Reset any agents working on this mission
    const allAgents = await this.repos.agents.listAll();
    for (const agent of allAgents) {
      if (agent.currentMissionId === missionId) {
        await this.repos.agents.update(agent.id, {
          status: 'idle',
          currentMissionId: '',
        });
      }
    }

    // 5. Record Activity Log
    // @ts-expect-error - using untyped system fields
    await this.repos.activities.create({
      missionId,
      agentId: 'agent-ceo',
      activityType: 'mission_completed',
      description: `Mission '${mission.title}' was marked as completed by Founder. ${affectedTasksCount} task(s) and ${completedArtifactsCount} deliverable(s) marked as completed.`,
      status: 'completed',
    });

    return {
      mission: updatedMission,
      affectedTasksCount,
      completedArtifactsCount,
    };
  }

  /**
   * Cleans up / archives orphaned deliverables (deliverables whose parent mission is archived, cancelled, or missing).
   */
  async cleanupOrphanedArtifacts(): Promise<{ cleanedCount: number; remainingActiveCount: number }> {
    const allArtifacts = typeof this.repos.artifacts.listAll === 'function'
      ? await this.repos.artifacts.listAll()
      : [];
    const allMissions = typeof this.repos.missions.listAll === 'function'
      ? await this.repos.missions.listAll({ includeArchived: true })
      : [];

    const activeMissionIds = new Set(
      allMissions.filter(m => !m.isArchived && m.status !== 'cancelled').map(m => m.id)
    );

    let cleanedCount = 0;
    for (const artifact of allArtifacts) {
      const isOrphaned = !artifact.missionId || !activeMissionIds.has(artifact.missionId);
      if (isOrphaned && artifact.status !== 'archived') {
        await this.repos.artifacts.update(artifact.id, {
          status: 'archived',
        });
        cleanedCount++;
      }
    }

    const remainingActiveCount = allArtifacts.length - cleanedCount;
    return { cleanedCount, remainingActiveCount };
  }

  /**
   * Normalizes mission title and objective for duplicate identification.
   */
  normalizeMissionKey(title: string, objective?: string): string {
    const normTitle = (title || '')
      .toLowerCase()
      .trim()
      .replace(/^ceo strategy:\s*/i, '')
      .replace(/^strategic initiative:\s*/i, '')
      .replace(/^mission:\s*/i, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');

    const normObjective = (objective || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');

    return `${normTitle}:::${normObjective}`;
  }

  /**
   * Checks if an identical mission already exists to prevent duplicate mission creation.
   */
  async findExistingDuplicateMission(title: string, objective: string, founderUid?: string): Promise<MissionEntity | null> {
    const allMissions = typeof this.repos.missions.listAll === 'function'
      ? await this.repos.missions.listAll({ includeArchived: false })
      : (await this.repos.missions.listByStatus('active'));

    const targetKey = this.normalizeMissionKey(title, objective);
    const targetTitleNorm = (title || '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

    for (const m of allMissions) {
      if (m.isArchived || m.status === 'cancelled') continue;
      if (founderUid && m.founderUid && m.founderUid !== founderUid && founderUid !== 'founder_manual_trigger' && founderUid !== 'founder_default') {
        continue;
      }
      const currentKey = this.normalizeMissionKey(m.title, m.objective);
      if (currentKey === targetKey) {
        return m;
      }
      const currentTitleNorm = (m.title || '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
      if (currentTitleNorm === targetTitleNorm && targetTitleNorm.length > 4) {
        const currObj = (m.objective || '').toLowerCase().trim();
        const targObj = (objective || '').toLowerCase().trim();
        if (currObj === targObj || (currObj.length > 10 && targObj.includes(currObj.slice(0, 25))) || (targObj.length > 10 && currObj.includes(targObj.slice(0, 25)))) {
          return m;
        }
      }
    }
    return null;
  }

  /**
   * Automatically scans all missions, detects duplicate missions with identical Title and Objective/Scope,
   * and consolidates them into a single primary canonical mission:
   * - Keeps the primary mission with the most progress/deliverables/tasks
   * - Re-links and merges all tasks, deliverables, approvals, tool calls, and activity logs
   * - Aggregates token and cost metrics
   * - Removes the redundant duplicate missions from the database
   */
  async consolidateDuplicateMissions(options?: { dryRun?: boolean; founderUid?: string }): Promise<ConsolidationReport> {
    const allMissions = typeof this.repos.missions.listAll === 'function'
      ? await this.repos.missions.listAll({ includeArchived: true })
      : [
          ...(await this.repos.missions.listByStatus('active')),
          ...(await this.repos.missions.listByStatus('draft')),
          ...(await this.repos.missions.listByStatus('queued')),
          ...(await this.repos.missions.listByStatus('completed')),
          ...(await this.repos.missions.listByStatus('failed')),
          ...(await this.repos.missions.listByStatus('cancelled')),
        ];

    // Candidate active/completed missions (ignore already cancelled missions if distinct)
    const candidateMissions = allMissions.filter(m => !m.isArchived && m.status !== 'cancelled');

    // Group candidate missions by normalized key
    const groupsMap = new Map<string, MissionEntity[]>();
    for (const m of candidateMissions) {
      if (options?.founderUid && m.founderUid && m.founderUid !== options.founderUid && options.founderUid !== 'founder_manual_trigger') {
        continue;
      }
      const key = this.normalizeMissionKey(m.title, m.objective);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(m);
    }

    let duplicateGroupsFound = 0;
    let duplicateMissionsRemoved = 0;
    let tasksReLinkedOrMerged = 0;
    let artifactsReLinked = 0;
    let approvalsReLinked = 0;
    let toolCallsReLinked = 0;
    let activitiesReLinked = 0;
    const details: ConsolidationReport['details'] = [];

    for (const [, group] of groupsMap.entries()) {
      if (group.length <= 1) continue;

      duplicateGroupsFound++;

      // Score each mission in the duplicate group to identify the best canonical mission
      const scoredMissions = await Promise.all(
        group.map(async (m) => {
          let score = 0;
          if (m.status === 'completed') score += 100;
          else if (m.status === 'active') score += 50;
          else if (m.status === 'queued') score += 20;

          const tasks = await this.repos.tasks.listByMission(m.id);
          const completedTasks = tasks.filter(t => t.status === 'completed').length;
          score += completedTasks * 15 + tasks.length * 3;

          const artifacts = await this.repos.artifacts.listByMission(m.id);
          score += artifacts.length * 20;

          if (m.costUsd || m.totalTokens) score += 10;
          if (m.projectFolder) score += 10;

          return { mission: m, score, tasks, artifacts };
        })
      );

      // Sort descending by score; if tied, preserve earliest created
      scoredMissions.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.mission.createdAt || 0) - (b.mission.createdAt || 0);
      });

      const canonical = scoredMissions[0];
      const duplicates = scoredMissions.slice(1);

      const mergedDuplicateIds: string[] = [];
      let groupTasksMerged = 0;
      let groupArtifactsMerged = 0;

      let aggregateCostUsd = canonical.mission.costUsd || 0;
      let aggregateCostPhp = canonical.mission.costPhp || 0;
      let aggregateTokens = canonical.mission.totalTokens || 0;
      let aggregateTokensInput = canonical.mission.totalTokensInput || 0;
      let aggregateTokensOutput = canonical.mission.totalTokensOutput || 0;
      let aggregateLlmCalls = canonical.mission.llmCallsCount || 0;

      for (const dup of duplicates) {
        mergedDuplicateIds.push(dup.mission.id);

        aggregateCostUsd += dup.mission.costUsd || 0;
        aggregateCostPhp += dup.mission.costPhp || 0;
        aggregateTokens += dup.mission.totalTokens || 0;
        aggregateTokensInput += dup.mission.totalTokensInput || 0;
        aggregateTokensOutput += dup.mission.totalTokensOutput || 0;
        aggregateLlmCalls += dup.mission.llmCallsCount || 0;

        if (!options?.dryRun) {
          // 1. Task deduplication & re-linking
          const canonicalTasks = await this.repos.tasks.listByMission(canonical.mission.id);
          const dupTasks = await this.repos.tasks.listByMission(dup.mission.id);

          for (const dt of dupTasks) {
            const matchingCanonicalTask = canonicalTasks.find(
              ct => ct.title.toLowerCase().trim() === dt.title.toLowerCase().trim()
            );

            if (matchingCanonicalTask) {
              // Re-link child artifacts to matching canonical task
              const taskArtifacts = await this.repos.artifacts.listByTask(dt.id);
              for (const art of taskArtifacts) {
                await this.repos.artifacts.update(art.id, {
                  missionId: canonical.mission.id,
                  taskId: matchingCanonicalTask.id,
                });
                artifactsReLinked++;
                groupArtifactsMerged++;
              }

              // Re-link toolCalls to matching canonical task
              const taskToolCalls = await this.repos.toolCalls.listByTask(dt.id);
              for (const tc of taskToolCalls) {
                await this.repos.toolCalls.update(tc.id, {
                  missionId: canonical.mission.id,
                  taskId: matchingCanonicalTask.id,
                });
                toolCallsReLinked++;
              }

              // Delete redundant duplicate task
              await this.repos.tasks.delete(dt.id);
              tasksReLinkedOrMerged++;
              groupTasksMerged++;
            } else {
              // Unique task on duplicate mission: re-link to canonical mission
              await this.repos.tasks.update(dt.id, {
                missionId: canonical.mission.id,
              });
              tasksReLinkedOrMerged++;
              groupTasksMerged++;
            }
          }

          // 2. Re-link any deliverables/artifacts belonging to duplicate mission
          const dupArtifacts = await this.repos.artifacts.listByMission(dup.mission.id);
          for (const art of dupArtifacts) {
            await this.repos.artifacts.update(art.id, {
              missionId: canonical.mission.id,
            });
            artifactsReLinked++;
            groupArtifactsMerged++;
          }

          // 3. Re-link approvals
          if (typeof this.repos.approvals.listByMission === 'function') {
            const dupApprovals = await this.repos.approvals.listByMission(dup.mission.id);
            for (const app of dupApprovals) {
              if (this.repos.approvals.update) {
                await this.repos.approvals.update(app.id, { missionId: canonical.mission.id });
                approvalsReLinked++;
              }
            }
          }

          // 4. Re-link toolCalls
          const dupToolCalls = await this.repos.toolCalls.listByMission(dup.mission.id);
          for (const tc of dupToolCalls) {
            await this.repos.toolCalls.update(tc.id, {
              missionId: canonical.mission.id,
            });
            toolCallsReLinked++;
          }

          // 5. Re-link activities
          const dupActivities = await this.repos.activities.listByMission(dup.mission.id);
          for (const act of dupActivities) {
            if (this.repos.activities.update) {
              await this.repos.activities.update(act.id, { missionId: canonical.mission.id });
              activitiesReLinked++;
            }
          }

          // 6. Re-link workers
          const dupWorkers = await this.repos.workers.listByMission(dup.mission.id);
          for (const w of dupWorkers) {
            await this.repos.workers.update(w.id, {
              missionId: canonical.mission.id,
            });
          }

          // 7. Delete the duplicate mission entity from database
          await this.repos.missions.delete(dup.mission.id);
          duplicateMissionsRemoved++;
        } else {
          duplicateMissionsRemoved += duplicates.length;
        }
      }

      if (!options?.dryRun) {
        // Update canonical mission with aggregate tokens, cost, and updated timestamp
        await this.repos.missions.update(canonical.mission.id, {
          costUsd: aggregateCostUsd,
          costPhp: aggregateCostPhp,
          totalTokens: aggregateTokens,
          totalTokensInput: aggregateTokensInput,
          totalTokensOutput: aggregateTokensOutput,
          llmCallsCount: aggregateLlmCalls,
          updatedAt: Date.now(),
        });

        // Record Activity Log on canonical mission
        await this.repos.activities.create({
          missionId: canonical.mission.id,
          agentId: 'agent-ceo',
          action: `CEO Orchestrator automatically consolidated ${duplicates.length} duplicate mission(s)`,
          details: {
            canonicalId: canonical.mission.id,
            canonicalTitle: canonical.mission.title,
            mergedDuplicateIds,
            groupTasksMerged,
            groupArtifactsMerged,
          },
          result: {
            success: true,
            status: 'consolidated',
          },
          status: 'success',
          timestamp: Date.now(),
        });
      }

      details.push({
        canonicalId: canonical.mission.id,
        canonicalTitle: canonical.mission.title,
        mergedDuplicateIds,
        mergedTasksCount: groupTasksMerged,
        mergedArtifactsCount: groupArtifactsMerged,
      });
    }

    const message = duplicateMissionsRemoved > 0
      ? `CEO Orchestrator successfully consolidated ${duplicateMissionsRemoved} duplicate mission(s) across ${duplicateGroupsFound} duplicate group(s). Merged ${tasksReLinkedOrMerged} task(s) and re-linked ${artifactsReLinked} deliverable(s).`
      : 'No duplicate missions found. All mission titles and objectives are distinct.';

    return {
      success: true,
      totalMissionsScanned: candidateMissions.length,
      duplicateGroupsFound,
      duplicateMissionsRemoved,
      tasksReLinkedOrMerged,
      artifactsReLinked,
      approvalsReLinked,
      toolCallsReLinked,
      activitiesReLinked,
      details,
      message,
    };
  }

  /**
   * Lists all archived missions with their associated tasks, artifacts, and summary stats.
   */
  async listArchivedMissions(filterStatus?: string): Promise<Array<MissionEntity & { tasks: TaskEntity[]; artifactsCount: number }>> {
    let archived: MissionEntity[];
    if (typeof this.repos.missions.listArchived === 'function') {
      archived = await this.repos.missions.listArchived();
    } else {
      const all = typeof this.repos.missions.listAll === 'function'
        ? await this.repos.missions.listAll({ includeArchived: true })
        : [];
      archived = all.filter(m => m.isArchived === true);
    }

    if (filterStatus && filterStatus !== 'all') {
      archived = archived.filter(m => m.status === filterStatus);
    }

    archived.sort((a, b) => (b.archivedAt || b.updatedAt || 0) - (a.archivedAt || a.updatedAt || 0));

    const enriched = await Promise.all(
      archived.map(async (m) => {
        const tasks = await this.repos.tasks.listByMission(m.id);
        const artifacts = await this.repos.artifacts.listByMission(m.id);
        return {
          ...m,
          tasks,
          artifactsCount: artifacts.length,
        };
      })
    );

    return enriched;
  }
}

// Singleton helper
let _missionControlService: MissionControlService | null = null;
export function getMissionControlService(repos?: RepositoryBundle): MissionControlService {
  if (repos) return new MissionControlService(repos);
  if (!_missionControlService) {
    _missionControlService = new MissionControlService();
  }
  return _missionControlService;
}

