import { RepositoryBundle } from '@/lib/repositories';

export interface AgentWorkerUsage {
  agentId: string;
  activeWorkersCount: number;
  maxConcurrentWorkers: number;
}

export interface MissionBudgetConfig {
  maxWorkersPerMission?: number;
}

export interface MissionBudgetUsage {
  workersCount: number;
  activeWorkersCount?: number;
}

export interface MissionBudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: MissionBudgetUsage;
  agentUsage?: AgentWorkerUsage;
}

export class MissionBudgetExceededError extends Error {
  constructor(
    public readonly reason: string,
    public readonly currentUsage: MissionBudgetUsage,
    public readonly agentUsage?: AgentWorkerUsage
  ) {
    super(`[WORKER_LIMIT_EXCEEDED] ${reason}`);
    this.name = 'MissionBudgetExceededError';
  }
}

export class AgentConcurrencyLimitExceededError extends Error {
  constructor(
    public readonly reason: string,
    public readonly agentUsage: AgentWorkerUsage
  ) {
    super(`[AGENT_CONCURRENCY_LIMIT_EXCEEDED] ${reason}`);
    this.name = 'AgentConcurrencyLimitExceededError';
  }
}

/**
 * Default fallback concurrent worker capacity per agent if not specified on the agent entity.
 */
export const DEFAULT_AGENT_MAX_CONCURRENT_WORKERS: Record<string, number> = {
  'agent-ceo': 3,
  'agent-growth': 5,
  'agent-development': 5,
  'agent-dev': 5,
  'agent-quality': 4,
};

/**
 * Checks whether an agent is within its max concurrent worker limit.
 */
export async function checkAgentWorkerLimit(
  repos: RepositoryBundle,
  agentId: string
): Promise<{ allowed: boolean; reason?: string; agentUsage: AgentWorkerUsage }> {
  const agent = await repos.agents.getById(agentId);
  const maxConcurrent = agent?.maxConcurrentWorkers ?? DEFAULT_AGENT_MAX_CONCURRENT_WORKERS[agentId] ?? 5;

  // Find all active (running or idle) workers belonging to this parent agent
  const workers = await repos.workers.listByParentAgent(agentId);
  const activeWorkers = workers.filter((w) => w.status === 'running' || w.status === 'idle');
  const activeWorkersCount = activeWorkers.length;

  const agentUsage: AgentWorkerUsage = {
    agentId,
    activeWorkersCount,
    maxConcurrentWorkers: maxConcurrent,
  };

  if (activeWorkersCount >= maxConcurrent) {
    return {
      allowed: false,
      reason: `Agent [${agent?.name || agentId}] active worker limit reached (${activeWorkersCount}/${maxConcurrent} concurrent workers currently running)`,
      agentUsage,
    };
  }

  return {
    allowed: true,
    agentUsage,
  };
}

/**
 * Asserts that the agent has capacity to spawn an additional worker.
 * Throws AgentConcurrencyLimitExceededError if limit is reached.
 */
export async function assertAgentWorkerLimit(
  repos: RepositoryBundle,
  agentId: string
): Promise<AgentWorkerUsage> {
  const check = await checkAgentWorkerLimit(repos, agentId);
  if (!check.allowed) {
    throw new AgentConcurrencyLimitExceededError(check.reason || 'Agent concurrency limit reached', check.agentUsage);
  }
  return check.agentUsage;
}

/**
 * Checks whether the mission and/or specific agent is within concurrent worker limits.
 * Tool call caps and execution timeouts are completely removed.
 */
export async function checkMissionBudget(
  repos: RepositoryBundle,
  missionId: string,
  agentIdOrOverrides?: string | Partial<MissionBudgetConfig>
): Promise<MissionBudgetCheckResult> {
  const mission = await repos.missions.getById(missionId);
  if (!mission) {
    throw new Error(`Mission [${missionId}] not found when verifying worker capacity`);
  }

  // 1. If a specific agentId is provided, enforce that agent's max concurrent workers limit
  if (typeof agentIdOrOverrides === 'string') {
    const agentCheck = await checkAgentWorkerLimit(repos, agentIdOrOverrides);
    const workers = await repos.workers.listByMission(missionId);
    return {
      allowed: agentCheck.allowed,
      reason: agentCheck.reason,
      currentUsage: {
        workersCount: workers.length,
        activeWorkersCount: agentCheck.agentUsage.activeWorkersCount,
      },
      agentUsage: agentCheck.agentUsage,
    };
  }

  // 2. Count active workers for this mission
  const missionWorkers = await repos.workers.listByMission(missionId);
  const activeMissionWorkers = missionWorkers.filter((w) => w.status === 'running' || w.status === 'idle');

  return {
    allowed: true,
    currentUsage: {
      workersCount: missionWorkers.length,
      activeWorkersCount: activeMissionWorkers.length,
    },
  };
}

/**
 * Pre-spawn assertion hook. Throws if agent max concurrent worker limit is breached.
 */
export async function assertMissionBudgetBeforeSpawn(
  repos: RepositoryBundle,
  missionId: string,
  agentIdOrOverrides?: string | Partial<MissionBudgetConfig>
): Promise<MissionBudgetCheckResult> {
  const check = await checkMissionBudget(repos, missionId, agentIdOrOverrides);
  if (!check.allowed) {
    throw new MissionBudgetExceededError(check.reason || 'Worker limit exceeded', check.currentUsage, check.agentUsage);
  }
  return check;
}
