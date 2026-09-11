import { Firestore } from 'firebase/firestore';
import { createRepositories, RepositoryBundle } from '@/lib/repositories';
import { 
  MissionEntity, 
  TaskEntity, 
  AgentEntity, 
  WorkerEntity, 
  ToolCallEntity, 
  ArtifactEntity 
} from '@/schemas/repositories';

export interface StepResult {
  step: string;
  entity: string;
  operation: 'create' | 'read' | 'update' | 'query' | 'delete';
  status: 'passed' | 'failed';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface CrudTestSuiteReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  steps: StepResult[];
}

export async function runRepositoriesCrudSuite(customDb?: Firestore): Promise<CrudTestSuiteReport> {
  const startTime = Date.now();
  const repos: RepositoryBundle = createRepositories(customDb);
  const steps: StepResult[] = [];

  const runStep = async (
    entity: string,
    operation: StepResult['operation'],
    step: string,
    action: () => Promise<Record<string, unknown> | void>
  ) => {
    const stepStart = Date.now();
    try {
      const details = await action();
      steps.push({
        entity,
        operation,
        step,
        status: 'passed',
        latencyMs: Date.now() - stepStart,
        details: (details as Record<string, unknown>) || undefined,
      });
    } catch (err: unknown) {
      steps.push({
        entity,
        operation,
        step,
        status: 'failed',
        latencyMs: Date.now() - stepStart,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const testSuffix = `test_${Date.now()}`;
  const testFounderUid = `founder_${testSuffix}`;

  try {
    // ----------------------------------------------------
    // 1. MISSION CRUD
    // ----------------------------------------------------
    let createdMission: MissionEntity;
    await runStep('Mission', 'create', 'Create test mission entity', async () => {
      createdMission = await repos.missions.create({
        title: `Q3 Growth & Acquisition Architecture (${testSuffix})`,
        objective: 'Architect automated viral loop and technical distribution strategy.',
        assignedAgent: 'growth',
        status: 'draft',
        priority: 'high',
        founderUid: testFounderUid,
      });
      if (!createdMission.id) throw new Error('Mission ID was not generated');
      return { id: createdMission.id, status: createdMission.status };
    });

    await runStep('Mission', 'read', 'Read mission by ID', async () => {
      const fetched = await repos.missions.getById(createdMission.id);
      if (!fetched) throw new Error(`Mission [${createdMission.id}] not found`);
      if (fetched.title !== createdMission.title) throw new Error('Mission title mismatch');
      return { id: fetched.id, title: fetched.title };
    });

    await runStep('Mission', 'query', 'Query missions by founderUid and status', async () => {
      const list = await repos.missions.listByFounder(testFounderUid);
      if (!list.some((m) => m.id === createdMission.id)) throw new Error('Mission missing from founder query');
      const draftList = await repos.missions.listByStatus('draft');
      if (!draftList.some((m) => m.id === createdMission.id)) throw new Error('Mission missing from status query');
      return { founderMissionsCount: list.length, draftMissionsCount: draftList.length };
    });

    await runStep('Mission', 'update', 'Update mission status and objective', async () => {
      const updated = await repos.missions.update(createdMission.id, {
        status: 'active',
        priority: 'critical',
      });
      if (updated.status !== 'active' || updated.priority !== 'critical') {
        throw new Error('Mission update assertions failed');
      }
      return { id: updated.id, newStatus: updated.status, priority: updated.priority };
    });

    // ----------------------------------------------------
    // 2. TASK CRUD
    // ----------------------------------------------------
    let createdTask: TaskEntity;
    await runStep('Task', 'create', 'Create task associated with mission', async () => {
      createdTask = await repos.tasks.create({
        missionId: createdMission.id,
        title: 'Analyze competitor SEO keywords and backlinks',
        description: 'Run automated crawl of top 5 competitors in developer tools niche.',
        status: 'pending',
        assignedTo: 'growth',
      });
      if (!createdTask.id) throw new Error('Task ID was not generated');
      return { id: createdTask.id, missionId: createdTask.missionId };
    });

    await runStep('Task', 'read', 'Read task by ID', async () => {
      const fetched = await repos.tasks.getById(createdTask.id);
      if (!fetched) throw new Error(`Task [${createdTask.id}] not found`);
      if (fetched.missionId !== createdMission.id) throw new Error('Task missionId mismatch');
      return { id: fetched.id, status: fetched.status };
    });

    await runStep('Task', 'query', 'Query tasks by missionId', async () => {
      const list = await repos.tasks.listByMission(createdMission.id);
      if (!list.some((t) => t.id === createdTask.id)) throw new Error('Task missing from mission task list');
      return { taskCount: list.length };
    });

    await runStep('Task', 'update', 'Update task status to in_progress', async () => {
      const updated = await repos.tasks.update(createdTask.id, {
        status: 'in_progress',
        description: 'Crawl in progress: 3/5 competitors completed.',
      });
      if (updated.status !== 'in_progress') throw new Error('Task status update failed');
      return { id: updated.id, status: updated.status };
    });

    // ----------------------------------------------------
    // 3. AGENT CRUD
    // ----------------------------------------------------
    const testAgentId = `agent_growth_${testSuffix}`;
    await runStep('Agent', 'create', 'Register specialized agent', async () => {
      const agent = await repos.agents.create({
        id: testAgentId,
        name: 'Growth Specialist Agent',
        role: 'growth',
        status: 'idle',
        capabilities: ['seo_analysis', 'copywriting', 'viral_loops'],
        modelTier: 'gemini-3.7-flash',
      });
      if (agent.id !== testAgentId) throw new Error('Agent ID mismatch');
      return { id: agent.id, role: agent.role };
    });

    await runStep('Agent', 'read', 'Read agent by ID', async () => {
      const fetched = await repos.agents.getById(testAgentId);
      if (!fetched) throw new Error(`Agent [${testAgentId}] not found`);
      return { id: fetched.id, status: fetched.status };
    });

    await runStep('Agent', 'update', 'Assign mission and update status', async () => {
      const updated = await repos.agents.assignMission(testAgentId, createdMission.id);
      if (updated.currentMissionId !== createdMission.id || updated.status !== 'running') {
        throw new Error('Agent assignment update failed');
      }
      return { id: updated.id, currentMissionId: updated.currentMissionId, status: updated.status };
    });

    // ----------------------------------------------------
    // 4. WORKER CRUD
    // ----------------------------------------------------
    let createdWorker: WorkerEntity;
    await runStep('Worker', 'create', 'Spawn ephemeral worker for task execution', async () => {
      createdWorker = await repos.workers.create({
        taskId: createdTask.id,
        missionId: createdMission.id,
        parentAgentId: testAgentId,
        role: 'subtask_crawler',
        status: 'running',
        spawnedAt: Date.now(),
      });
      if (!createdWorker.id) throw new Error('Worker ID was not generated');
      return { id: createdWorker.id, parentAgentId: createdWorker.parentAgentId };
    });

    await runStep('Worker', 'read', 'Read worker by ID', async () => {
      const fetched = await repos.workers.getById(createdWorker.id);
      if (!fetched) throw new Error(`Worker [${createdWorker.id}] not found`);
      return { id: fetched.id, status: fetched.status };
    });

    await runStep('Worker', 'update', 'Complete worker and record termination timestamp', async () => {
      const updated = await repos.workers.updateStatus(
        createdWorker.id,
        'completed',
        'Crawl completed successfully for all 5 domains.'
      );
      if (updated.status !== 'completed' || !updated.terminatedAt) {
        throw new Error('Worker status or termination timestamp missing');
      }
      return { id: updated.id, status: updated.status, summary: updated.resultSummary };
    });

    // ----------------------------------------------------
    // 5. TOOL CALL CRUD
    // ----------------------------------------------------
    let createdToolCall: ToolCallEntity;
    await runStep('ToolCall', 'create', 'Record tool invocation telemetry', async () => {
      createdToolCall = await repos.toolCalls.create({
        missionId: createdMission.id,
        taskId: createdTask.id,
        agentId: testAgentId,
        workerId: createdWorker.id,
        toolName: 'web_search',
        input: { query: 'developer tools viral growth loops 2026', maxResults: 10 },
        status: 'running',
        startedAt: Date.now(),
      });
      if (!createdToolCall.id) throw new Error('ToolCall ID was not generated');
      return { id: createdToolCall.id, toolName: createdToolCall.toolName };
    });

    await runStep('ToolCall', 'read', 'Read tool call by ID', async () => {
      const fetched = await repos.toolCalls.getById(createdToolCall.id);
      if (!fetched) throw new Error(`ToolCall [${createdToolCall.id}] not found`);
      return { id: fetched.id, status: fetched.status };
    });

    await runStep('ToolCall', 'update', 'Record tool execution result and output', async () => {
      const output = { hits: 10, topDomains: ['github.com', 'news.ycombinator.com'] };
      const updated = await repos.toolCalls.recordResult(createdToolCall.id, output, 'success');
      if (updated.status !== 'success' || !updated.completedAt || !updated.output) {
        throw new Error('ToolCall result recording failed');
      }
      return { id: updated.id, status: updated.status, completedAt: updated.completedAt };
    });

    // ----------------------------------------------------
    // 6. ARTIFACT CRUD
    // ----------------------------------------------------
    let createdArtifact: ArtifactEntity;
    await runStep('Artifact', 'create', 'Create versioned mission artifact', async () => {
      createdArtifact = await repos.artifacts.create({
        missionId: createdMission.id,
        taskId: createdTask.id,
        title: 'Competitor Growth Matrix Report',
        type: 'research_report',
        content: '# Competitor Matrix\n\n- Organic growth channels identified: 4\n- Keyword overlap: 68%',
        version: 1,
      });
      if (!createdArtifact.id) throw new Error('Artifact ID was not generated');
      return { id: createdArtifact.id, title: createdArtifact.title, version: createdArtifact.version };
    });

    await runStep('Artifact', 'read', 'Read artifact by ID', async () => {
      const fetched = await repos.artifacts.getById(createdArtifact.id);
      if (!fetched) throw new Error(`Artifact [${createdArtifact.id}] not found`);
      return { id: fetched.id, title: fetched.title };
    });

    await runStep('Artifact', 'update', 'Update artifact content and version', async () => {
      const updated = await repos.artifacts.update(createdArtifact.id, {
        content: '# Competitor Matrix (v2 Final)\n\n- Organic channels: 6\n- Action items documented.',
        version: 2,
      });
      if (updated.version !== 2) throw new Error('Artifact version update failed');
      return { id: updated.id, version: updated.version };
    });

    // ----------------------------------------------------
    // CLEANUP / DELETION VERIFICATION (Completes Full CRUD cycle)
    // ----------------------------------------------------
    await runStep('Cleanup', 'delete', 'Delete created test entities', async () => {
      await repos.artifacts.delete(createdArtifact.id);
      await repos.toolCalls.delete(createdToolCall.id);
      await repos.workers.delete(createdWorker.id);
      await repos.agents.delete(testAgentId);
      await repos.tasks.delete(createdTask.id);
      await repos.missions.delete(createdMission.id);

      const verifyMission = await repos.missions.getById(createdMission.id);
      if (verifyMission !== null) throw new Error('Mission deletion failed');
      const verifyTask = await repos.tasks.getById(createdTask.id);
      if (verifyTask !== null) throw new Error('Task deletion failed');

      return { cleanedEntities: ['Mission', 'Task', 'Agent', 'Worker', 'ToolCall', 'Artifact'] };
    });

  } catch {
    // Step failure already recorded in steps array
  }

  const passed = steps.filter((s) => s.status === 'passed').length;
  const failed = steps.filter((s) => s.status === 'failed').length;

  return {
    timestamp: Date.now(),
    totalTests: steps.length,
    passed,
    failed,
    durationMs: Date.now() - startTime,
    success: failed === 0 && steps.length > 0,
    steps,
  };
}
