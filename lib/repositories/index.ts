import { Firestore } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import { FirestoreMissionRepository } from './firestore/mission.repository';
import { FirestoreTaskRepository } from './firestore/task.repository';
import { FirestoreAgentRepository } from './firestore/agent.repository';
import { FirestoreWorkerRepository } from './firestore/worker.repository';
import { FirestoreToolCallRepository } from './firestore/tool-call.repository';
import { FirestoreArtifactRepository } from './firestore/artifact.repository';
import { FirestoreApprovalRepository } from './firestore/approval.repository';
import { FirestoreActivityRepository } from './firestore/activity.repository';
import { MarkdownKnowledgeRepository, getKnowledgeRepository } from './knowledge.repository';
import {
  MissionRepository,
  TaskRepository,
  AgentRepository,
  WorkerRepository,
  ToolCallRepository,
  ArtifactRepository,
  ApprovalRepository,
  KnowledgeRepository,
  ActivityRepository,
} from '@/schemas/repositories';

export * from './firestore/mission.repository';
export * from './firestore/task.repository';
export * from './firestore/agent.repository';
export * from './firestore/worker.repository';
export * from './firestore/tool-call.repository';
export * from './firestore/artifact.repository';
export * from './firestore/approval.repository';
export * from './firestore/activity.repository';
export * from './knowledge.repository';

export interface RepositoryBundle {
  missions: MissionRepository;
  tasks: TaskRepository;
  agents: AgentRepository;
  workers: WorkerRepository;
  toolCalls: ToolCallRepository;
  artifacts: ArtifactRepository;
  approvals: ApprovalRepository;
  activities: ActivityRepository;
  knowledge: KnowledgeRepository;
}

export function createRepositories(customDb?: Firestore): RepositoryBundle {
  const db = customDb || getFirebaseFirestore();
  return {
    missions: new FirestoreMissionRepository(db),
    tasks: new FirestoreTaskRepository(db),
    agents: new FirestoreAgentRepository(db),
    workers: new FirestoreWorkerRepository(db),
    toolCalls: new FirestoreToolCallRepository(db),
    artifacts: new FirestoreArtifactRepository(db),
    approvals: new FirestoreApprovalRepository(db),
    activities: new FirestoreActivityRepository(db),
    knowledge: getKnowledgeRepository(),
  };
}

// Lazy-initialized default repositories singleton
let _defaultRepos: RepositoryBundle | null = null;

export function getRepositories(): RepositoryBundle {
  if (!_defaultRepos) {
    _defaultRepos = createRepositories();
  }
  return _defaultRepos;
}
