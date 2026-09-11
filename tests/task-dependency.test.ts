import { TaskEntity, MissionEntity } from '@/schemas/repositories';
import { 
  sortTasksByDependencyOrder, 
  computeDashboardMetrics,
  OrderedTask,
  DashboardMetrics 
} from '@/lib/task-dependency';

export interface TaskDependencyTestResult {
  step: string;
  status: 'passed' | 'failed';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface TaskDependencyTestSuiteReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  steps: TaskDependencyTestResult[];
}

export async function runTaskDependencyTestSuite(): Promise<TaskDependencyTestSuiteReport> {
  const startTime = Date.now();
  const steps: TaskDependencyTestResult[] = [];

  const runStep = async (step: string, action: () => Promise<Record<string, unknown> | void>) => {
    const stepStart = Date.now();
    try {
      const details = await action();
      steps.push({
        step,
        status: 'passed',
        latencyMs: Date.now() - stepStart,
        details: (details as Record<string, unknown>) || undefined,
      });
    } catch (err: unknown) {
      steps.push({
        step,
        status: 'failed',
        latencyMs: Date.now() - stepStart,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Step 1: Empty and Single-Task Handling
  await runStep('1. Empty and Single-Task Topological Ordering', async () => {
    const emptyResult = sortTasksByDependencyOrder([]);
    if (emptyResult.length !== 0) throw new Error('Expected empty array for empty tasks');

    const singleTask: TaskEntity = {
      id: 'task-1',
      missionId: 'mission-1',
      title: 'Analyze Market',
      description: 'Single isolated task',
      status: 'pending',
      assignedTo: 'growth',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const singleResult = sortTasksByDependencyOrder([singleTask]);
    if (singleResult.length !== 1) throw new Error('Expected 1 ordered task');
    if (singleResult[0].stepNumber !== 1) throw new Error('Expected stepNumber 1');
    if (singleResult[0].isBlockedByPrereq !== false) throw new Error('Single task without dependencies should not be blocked');

    return { singleResultCount: singleResult.length, stepNumber: singleResult[0].stepNumber };
  });

  // Step 2: Linear Dependency Chain Ordering
  await runStep('2. Linear Dependency Chain (A -> B -> C)', async () => {
    // Task C depends on B, Task B depends on A, Task A has no dependencies
    const tasks: TaskEntity[] = [
      {
        id: 'task-c',
        missionId: 'mission-1',
        title: 'Publish Results',
        description: 'Final step',
        status: 'pending',
        assignedTo: 'growth',
        dependsOnTaskIds: ['task-b'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'task-a',
        missionId: 'mission-1',
        title: 'Extract Raw Keywords',
        description: 'First step',
        status: 'completed',
        assignedTo: 'growth',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'task-b',
        missionId: 'mission-1',
        title: 'Cluster Keywords by Intent',
        description: 'Second step',
        status: 'pending',
        assignedTo: 'growth',
        dependsOnTaskIds: ['task-a'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const ordered = sortTasksByDependencyOrder(tasks);
    if (ordered.length !== 3) throw new Error(`Expected 3 tasks, got ${ordered.length}`);

    // Verify ordering: task-a (1), task-b (2), task-c (3)
    if (ordered[0].id !== 'task-a') throw new Error(`Expected task-a first, got ${ordered[0].id}`);
    if (ordered[1].id !== 'task-b') throw new Error(`Expected task-b second, got ${ordered[1].id}`);
    if (ordered[2].id !== 'task-c') throw new Error(`Expected task-c third, got ${ordered[2].id}`);

    // Verify step numbers
    if (ordered[0].stepNumber !== 1 || ordered[1].stepNumber !== 2 || ordered[2].stepNumber !== 3) {
      throw new Error('Step numbers do not match topological sequence');
    }

    // Verify blocking status:
    // task-a: completed, not blocked
    // task-b: depends on task-a (completed) -> not blocked by uncompleted prereq
    // task-c: depends on task-b (pending) -> isBlockedByPrereq = true
    if (ordered[0].isBlockedByPrereq) throw new Error('Task A should not be blocked');
    if (ordered[1].isBlockedByPrereq) throw new Error('Task B should not be blocked since Task A is completed');
    if (!ordered[2].isBlockedByPrereq) throw new Error('Task C should be blocked since Task B is pending');
    if (ordered[2].unmetPrerequisites.length !== 1) {
      throw new Error(`Expected 1 unmet prerequisite for Task C, got ${ordered[2].unmetPrerequisites.length}`);
    }

    return {
      orderedIds: ordered.map(t => t.id),
      stepNumbers: ordered.map(t => t.stepNumber),
      taskCUnmetPrereqs: ordered[2].unmetPrerequisites,
    };
  });

  // Step 3: Complex Multi-Parent DAG Graph
  await runStep('3. Multi-Parent DAG (Diamond Dependency)', async () => {
    // A -> B, A -> C, (B and C) -> D
    const tasks: TaskEntity[] = [
      {
        id: 'task-d',
        missionId: 'mission-dag',
        title: 'Synthesize Cross-Domain Report',
        description: 'Combines B and C',
        status: 'pending',
        assignedTo: 'ceo',
        dependsOnTaskIds: ['task-b', 'task-c'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'task-b',
        missionId: 'mission-dag',
        title: 'Draft Code Architecture',
        description: 'Engineering track',
        status: 'completed',
        assignedTo: 'development',
        dependsOnTaskIds: ['task-a'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'task-c',
        missionId: 'mission-dag',
        title: 'Draft Market ICP',
        description: 'Growth track',
        status: 'in_progress',
        assignedTo: 'growth',
        dependsOnTaskIds: ['task-a'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'task-a',
        missionId: 'mission-dag',
        title: 'Mission Objective Clarification',
        description: 'Root objective',
        status: 'completed',
        assignedTo: 'ceo',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const ordered = sortTasksByDependencyOrder(tasks);
    if (ordered.length !== 4) throw new Error(`Expected 4 tasks, got ${ordered.length}`);

    // Task A must be before B and C; B and C must be before D
    const idxA = ordered.findIndex(t => t.id === 'task-a');
    const idxB = ordered.findIndex(t => t.id === 'task-b');
    const idxC = ordered.findIndex(t => t.id === 'task-c');
    const idxD = ordered.findIndex(t => t.id === 'task-d');

    if (idxA > idxB || idxA > idxC) throw new Error('Task A must appear before Task B and C');
    if (idxB > idxD || idxC > idxD) throw new Error('Task B and C must appear before Task D');

    const taskD = ordered.find(t => t.id === 'task-d')!;
    if (!taskD.isBlockedByPrereq) throw new Error('Task D should be blocked because Task C is in_progress');
    if (taskD.dependencyDetails.length !== 2) throw new Error('Task D should have 2 dependency details');

    return {
      topologicalSequence: ordered.map(t => `${t.stepNumber}: ${t.id}`),
      taskDBlocked: taskD.isBlockedByPrereq,
      taskDUnmetPrereqs: taskD.unmetPrerequisites,
    };
  });

  // Step 4: Circular Dependency Resilience
  await runStep('4. Cycle Resilience (A -> B -> A)', async () => {
    const cyclicTasks: TaskEntity[] = [
      {
        id: 'cycle-1',
        missionId: 'mission-cycle',
        title: 'Cyclic Node 1',
        description: 'Depends on Node 2',
        status: 'pending',
        assignedTo: 'growth',
        dependsOnTaskIds: ['cycle-2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'cycle-2',
        missionId: 'mission-cycle',
        title: 'Cyclic Node 2',
        description: 'Depends on Node 1',
        status: 'pending',
        assignedTo: 'development',
        dependsOnTaskIds: ['cycle-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    // Must not hang, crash, or throw infinite recursion
    const ordered = sortTasksByDependencyOrder(cyclicTasks);
    if (ordered.length !== 2) throw new Error(`Expected 2 tasks returned despite cycle, got ${ordered.length}`);

    return {
      resolvedOrder: ordered.map(t => t.id),
      cyclicHandledGracefully: true,
    };
  });

  // Step 5: Dashboard Metric Aggregations
  await runStep('5. Dashboard Metrics Computation', async () => {
    const mockMissions: Array<MissionEntity & { tasks?: TaskEntity[] }> = [
      {
        id: 'm1',
        title: 'Mission 1',
        objective: 'Objective 1',
        status: 'active',
        founderUid: 'founder-1',
        assignedAgent: 'agent-growth',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tasks: [
          { id: 't1', missionId: 'm1', title: 'T1', description: '', status: 'completed', assignedTo: 'growth', createdAt: 0, updatedAt: 0 },
          { id: 't2', missionId: 'm1', title: 'T2', description: '', status: 'in_progress', assignedTo: 'growth', createdAt: 0, updatedAt: 0 },
        ],
      },
      {
        id: 'm2',
        title: 'Mission 2',
        objective: 'Objective 2',
        status: 'queued',
        founderUid: 'founder-1',
        assignedAgent: 'agent-development',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tasks: [
          { id: 't3', missionId: 'm2', title: 'T3', description: '', status: 'pending', assignedTo: 'development', createdAt: 0, updatedAt: 0 },
          { id: 't4', missionId: 'm2', title: 'T4', description: '', status: 'blocked', assignedTo: 'development', createdAt: 0, updatedAt: 0 },
        ],
      },
      {
        id: 'm3',
        title: 'Mission 3',
        objective: 'Objective 3',
        status: 'completed',
        founderUid: 'founder-1',
        assignedAgent: 'agent-ceo',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tasks: [
          { id: 't5', missionId: 'm3', title: 'T5', description: '', status: 'completed', assignedTo: 'ceo', createdAt: 0, updatedAt: 0 },
        ],
      },
    ];

    const metrics = computeDashboardMetrics(mockMissions);

    if (metrics.totalMissions !== 3) throw new Error(`Expected 3 total missions, got ${metrics.totalMissions}`);
    if (metrics.activeMissions !== 1) throw new Error(`Expected 1 active mission, got ${metrics.activeMissions}`);
    if (metrics.queuedMissions !== 1) throw new Error(`Expected 1 queued mission, got ${metrics.queuedMissions}`);
    if (metrics.completedMissions !== 1) throw new Error(`Expected 1 completed mission, got ${metrics.completedMissions}`);

    if (metrics.totalTasks !== 5) throw new Error(`Expected 5 total tasks, got ${metrics.totalTasks}`);
    if (metrics.completedTasks !== 2) throw new Error(`Expected 2 completed tasks, got ${metrics.completedTasks}`);
    if (metrics.inProgressTasks !== 1) throw new Error(`Expected 1 in_progress task, got ${metrics.inProgressTasks}`);
    if (metrics.blockedTasks !== 1) throw new Error(`Expected 1 blocked task, got ${metrics.blockedTasks}`);
    if (metrics.pendingTasks !== 1) throw new Error(`Expected 1 pending task, got ${metrics.pendingTasks}`);
    if (metrics.completionPercentage !== 40) throw new Error(`Expected 40% completion, got ${metrics.completionPercentage}%`);

    return { metrics };
  });

  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;

  return {
    timestamp: startTime,
    totalTests: steps.length,
    passed,
    failed,
    durationMs: Date.now() - startTime,
    success: failed === 0,
    steps,
  };
}
