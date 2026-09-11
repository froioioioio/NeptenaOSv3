/**
 * Neptena-OS: Repository Interfaces
 * 
 * Abstraction layer for all persistent entity interactions (Firestore, SQLite, local disk).
 * Interface contracts for Phase 1 core data layer: Mission, Task, Agent, Worker, ToolCall, Artifact.
 */

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// 1. Mission Object
export interface MissionEntity {
  id: string;
  title: string;
  objective: string;
  type?: 'mission' | 'side_quest';
  assignedAgent: string;
  status: 'draft' | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  founderUid: string;
  projectFolder?: string;
  projectSlug?: string;
  prNumber?: number;
  prUrl?: string;
  prBranch?: string;
  prStatus?: 'none' | 'draft' | 'open' | 'merged';
  isArchived?: boolean;
  archivedAt?: number;
  cancelledAt?: number;
  cancellationReason?: string;
  totalTokensInput?: number;
  totalTokensOutput?: number;
  totalTokens?: number;
  costUsd?: number;
  costPhp?: number;
  llmCallsCount?: number;
  modelsUsed?: string[];
  modelUsageBreakdown?: Record<string, {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
    costUsd: number;
    costPhp: number;
    callsCount: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

// 2. Task Object
export interface TaskEntity {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  assignedTo: string; // Agent ID or Worker ID
  dependsOnTaskIds?: string[];
  createdAt: number;
  updatedAt: number;
}

// 3. Agent Object
export interface AgentEntity {
  id: string;
  name: string;
  role: 'ceo' | 'growth' | 'development' | 'quality' | 'worker';
  status: 'idle' | 'running' | 'paused' | 'standby';
  capabilities: string[];
  currentMissionId?: string;
  modelTier?: string;
  description?: string;
  prompt?: string;
  systemPrompt?: string;
  defaultPrompt?: string;
  maxConcurrentWorkers?: number;
  createdAt: number;
  updatedAt: number;
}

// 4. Worker Object (Ephemeral sub-agent spawned for discrete task execution)
export interface WorkerEntity {
  id: string;
  taskId: string;
  missionId: string;
  parentAgentId: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'terminated';
  spawnedAt: number;
  terminatedAt?: number;
  resultSummary?: string;
  createdAt: number;
  updatedAt: number;
}

// 5. ToolCall Object (Permissioned tool invocation records & activity telemetry)
export interface ToolCallEntity {
  id: string;
  missionId: string;
  taskId: string;
  agentId: string;
  workerId?: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: number;
  completedAt?: number;
  error?: string;
  approvalRequired?: boolean;
  approvedBy?: string;
  createdAt: number;
  updatedAt: number;
}

// Legacy Alias for ExecutionEntity
export type ExecutionEntity = ToolCallEntity;

// 6. Artifact Object (Versioned outputs: markdown docs, code diffs, JSON reports, documents, presentations, images, videos)
export interface ArtifactEntity {
  id: string;
  missionId: string;
  taskId?: string;
  title: string;
  type: 'markdown' | 'code' | 'json' | 'research_report' | 'diff' | 'document' | 'presentation' | 'image' | 'video';
  content: string;
  version: number;
  status?: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived' | 'completed';
  approvedBy?: string;
  approvedAt?: number;
  projectFilePath?: string;
  projectFolder?: string;
  createdAt: number;
  updatedAt: number;
}

// Extended Entities for Future Phases
export interface ApprovalEntity {
  id: string;
  missionId: string;
  taskId?: string;
  actionType: 'send_email' | 'publish_content' | 'spend_money' | 'merge_pr' | 'deploy' | 'delete_data';
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedByAgent: string;
  createdAt: number;
  resolvedAt?: number;
  resolutionNote?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDocument {
  id: string;
  domain: string;
  title: string;
  status: 'draft' | 'canonical' | 'superseded';
  confidence: number;
  sources: string[];
  created: string;
  updated: string;
  content: string;
  filePath?: string;
}

// Alias for KnowledgeDocument
export type KnowledgeEntity = KnowledgeDocument;

// 7. Activity Record Object (Direct Agent Requests, Telemetry, System Logs)
export interface ActivityRecordEntity {
  id: string;
  missionId: string;
  taskId?: string;
  agentId: string;
  requestType: 're_prioritize' | 'ask_agent_output' | 'flag_blocker' | 'custom_request';
  action: string;
  details: Record<string, unknown>;
  result: Record<string, unknown>;
  status: 'success' | 'failed' | 'pending';
  timestamp: number;
  createdAt: number;
  updatedAt: number;
}

// Agent Direct Request / Response Contracts (No message bus required, direct request/response)
export interface AgentDirectRequest {
  missionId: string;
  agentId: string;
  taskId?: string;
  requestType: 're_prioritize' | 'ask_agent_output' | 'flag_blocker' | 'custom_request';
  payload: {
    // For re_prioritize
    newPriority?: 'low' | 'medium' | 'high' | 'critical';
    priorityReason?: string;
    targetTaskId?: string;
    
    // For ask_agent_output
    targetAgentId?: string;
    artifactType?: string;
    specificDocOrArtifactId?: string;
    query?: string;
    
    // For flag_blocker
    blockerReason?: string;
    severity?: 'warning' | 'blocking' | 'critical';
    suggestedRemedy?: string;
    
    // For custom requests
    customAction?: string;
    customParams?: Record<string, unknown>;
  };
}

export interface AgentDirectResponse {
  success: boolean;
  activityId: string;
  requestType: string;
  agentId: string;
  missionId: string;
  taskId?: string;
  timestamp: number;
  actionTaken: string;
  message: string;
  data: Record<string, unknown>;
  error?: string;
}

export interface BranchTaskSpec {
  id?: string;
  title: string;
  description?: string;
  assignedTo?: 'agent-growth' | 'agent-development' | 'agent-quality' | string;
  dependsOnTaskIds?: string[];
  dependsOnBranchIndices?: number[];
}

export interface CreateBranchingMissionInput {
  title: string;
  objective: string;
  founderUid: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tasks: BranchTaskSpec[];
}

export interface ConcurrentTaskExecutionSummary {
  taskId: string;
  taskTitle: string;
  assignedTo: string;
  workerId: string;
  toolCallId: string;
  artifactId?: string;
  artifactTitle?: string;
  status: 'completed' | 'failed' | 'blocked';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  waveIndex: number;
  error?: string;
}

export interface ConcurrentMissionExecutionResult {
  missionId: string;
  missionTitle: string;
  status: 'active' | 'completed' | 'in_progress' | 'failed' | 'blocked';
  totalTasks: number;
  completedTasksCount: number;
  failedTasksCount: number;
  totalDurationMs: number;
  wavesExecuted: number;
  maxConcurrentTasksRan: number;
  concurrencyProof: {
    waves: Array<{
      waveNumber: number;
      tasksRanSimultaneously: string[];
      taskCount: number;
      waveStartedAt: number;
      waveCompletedAt: number;
      waveDurationMs: number;
    }>;
    concurrentOverlapsDetected: boolean;
  };
  executedTasks: ConcurrentTaskExecutionSummary[];
  logs: string[];
}

// ==========================================
// REPOSITORY INTERFACES (DATA ACCESS LAYER)
// ==========================================

export interface MissionRepository {
  getById(id: string): Promise<MissionEntity | null>;
  listByFounder(founderUid: string, options?: QueryOptions): Promise<MissionEntity[]>;
  listByStatus(status: MissionEntity['status']): Promise<MissionEntity[]>;
  listAll?(options?: { includeArchived?: boolean }): Promise<MissionEntity[]>;
  listArchived?(): Promise<MissionEntity[]>;
  archive?(id: string): Promise<MissionEntity>;
  unarchive?(id: string): Promise<MissionEntity>;
  cancel?(id: string, reason?: string): Promise<MissionEntity>;
  create(mission: Omit<MissionEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<MissionEntity>;
  update(id: string, updates: Partial<Omit<MissionEntity, 'id' | 'createdAt'>>): Promise<MissionEntity>;
  delete(id: string): Promise<boolean>;
}

export interface TaskRepository {
  getById(id: string): Promise<TaskEntity | null>;
  listByMission(missionId: string): Promise<TaskEntity[]>;
  listByStatus(status: TaskEntity['status']): Promise<TaskEntity[]>;
  create(task: Omit<TaskEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<TaskEntity>;
  update(id: string, updates: Partial<Omit<TaskEntity, 'id' | 'createdAt'>>): Promise<TaskEntity>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository {
  getById(id: string): Promise<AgentEntity | null>;
  listAll(): Promise<AgentEntity[]>;
  create(agent: Omit<AgentEntity, 'createdAt' | 'updatedAt'> & { id: string; createdAt?: number; updatedAt?: number }): Promise<AgentEntity>;
  update(id: string, updates: Partial<Omit<AgentEntity, 'id' | 'createdAt'>>): Promise<AgentEntity>;
  updateStatus(id: string, status: AgentEntity['status']): Promise<AgentEntity>;
  assignMission(id: string, missionId: string | undefined): Promise<AgentEntity>;
  delete(id: string): Promise<boolean>;
}

export interface WorkerRepository {
  getById(id: string): Promise<WorkerEntity | null>;
  listAll(): Promise<WorkerEntity[]>;
  listByMission(missionId: string): Promise<WorkerEntity[]>;
  listByTask(taskId: string): Promise<WorkerEntity[]>;
  listByParentAgent(agentId: string): Promise<WorkerEntity[]>;
  create(worker: Omit<WorkerEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<WorkerEntity>;
  update(id: string, updates: Partial<Omit<WorkerEntity, 'id' | 'createdAt'>>): Promise<WorkerEntity>;
  updateStatus(id: string, status: WorkerEntity['status'], resultSummary?: string): Promise<WorkerEntity>;
  delete(id: string): Promise<boolean>;
}

export interface ToolCallRepository {
  getById(id: string): Promise<ToolCallEntity | null>;
  listAll(): Promise<ToolCallEntity[]>;
  listByMission(missionId: string): Promise<ToolCallEntity[]>;
  listByTask(taskId: string): Promise<ToolCallEntity[]>;
  listByWorker(workerId: string): Promise<ToolCallEntity[]>;
  listByAgent(agentId: string): Promise<ToolCallEntity[]>;
  create(toolCall: Omit<ToolCallEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ToolCallEntity>;
  update(id: string, updates: Partial<Omit<ToolCallEntity, 'id' | 'createdAt'>>): Promise<ToolCallEntity>;
  recordResult(id: string, output: Record<string, unknown>, status: 'success' | 'failed', error?: string): Promise<ToolCallEntity>;
  delete(id: string): Promise<boolean>;
}

export type ExecutionRepository = ToolCallRepository;

export interface ArtifactRepository {
  getById(id: string): Promise<ArtifactEntity | null>;
  listByMission(missionId: string): Promise<ArtifactEntity[]>;
  listByTask(taskId: string): Promise<ArtifactEntity[]>;
  listByStatus?(status: NonNullable<ArtifactEntity['status']>): Promise<ArtifactEntity[]>;
  listAll?(): Promise<ArtifactEntity[]>;
  create(artifact: Omit<ArtifactEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ArtifactEntity>;
  update(id: string, updates: Partial<Omit<ArtifactEntity, 'id' | 'createdAt'>>): Promise<ArtifactEntity>;
  updateStatus?(id: string, status: NonNullable<ArtifactEntity['status']>, approvedBy?: string): Promise<ArtifactEntity>;
  delete(id: string): Promise<boolean>;
}

export interface ApprovalRepository {
  getById(id: string): Promise<ApprovalEntity | null>;
  listPending(): Promise<ApprovalEntity[]>;
  listAll?(): Promise<ApprovalEntity[]>;
  listByMission?(missionId: string): Promise<ApprovalEntity[]>;
  create(approval: Omit<ApprovalEntity, 'id' | 'createdAt' | 'status'> & { id?: string; status?: ApprovalEntity['status']; createdAt?: number }): Promise<ApprovalEntity>;
  update?(id: string, updates: Partial<Omit<ApprovalEntity, 'id' | 'createdAt'>>): Promise<ApprovalEntity>;
  resolve(id: string, decision: 'approved' | 'rejected', note?: string): Promise<ApprovalEntity>;
  delete?(id: string): Promise<boolean>;
}

export interface KnowledgeRepository {
  createDraft(doc: {
    id?: string;
    domain: string;
    title: string;
    content: string;
    confidence?: number;
    sources?: string[];
    created?: string;
    updated?: string;
  }): Promise<KnowledgeDocument>;
  getById(id: string): Promise<KnowledgeDocument | null>;
  listByDomain(domain: string): Promise<KnowledgeDocument[]>;
  markCanonical(id: string): Promise<KnowledgeDocument>;
  updateStatus?(id: string, status: KnowledgeDocument['status']): Promise<KnowledgeDocument>;
  update?(id: string, updates: Partial<Pick<KnowledgeDocument, 'title' | 'content' | 'domain' | 'confidence' | 'sources' | 'status'>>): Promise<KnowledgeDocument>;
  listAll?(): Promise<KnowledgeDocument[]>;
  listCanonical?(domain?: string): Promise<KnowledgeDocument[]>;
  listByStatus?(status: KnowledgeDocument['status']): Promise<KnowledgeDocument[]>;
  searchByKeyword?(keyword: string): Promise<KnowledgeDocument[]>;
  delete?(id: string): Promise<boolean>;
}

export interface ActivityRepository {
  getById(id: string): Promise<ActivityRecordEntity | null>;
  listAll(limit?: number): Promise<ActivityRecordEntity[]>;
  listByMission(missionId: string): Promise<ActivityRecordEntity[]>;
  listByAgent(agentId: string): Promise<ActivityRecordEntity[]>;
  create(activity: Omit<ActivityRecordEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ActivityRecordEntity>;
  update?(id: string, updates: Partial<Omit<ActivityRecordEntity, 'id' | 'createdAt'>>): Promise<ActivityRecordEntity>;
  delete?(id: string): Promise<boolean>;
}


