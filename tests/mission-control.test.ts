import { Firestore } from 'firebase/firestore';
import { createRepositories } from '@/lib/repositories';
import { MissionControlService } from '@/missions/mission-control.service';

export interface MissionControlTestReport {
  timestamp: number;
  success: boolean;
  durationMs: number;
  createdMissionId: string;
  totalTasks: number;
  delegatedTaskId: string;
  delegatedAgentId: string;
  delegatedTaskStatus: string;
  agentStatus: string;
  cleanupCompleted: boolean;
  details: {
    missionTitle: string;
    tasks: { id: string; title: string; status: string; assignedTo: string }[];
  };
  error?: string;
}

export async function runMissionControlDelegationSuite(customDb?: Firestore): Promise<MissionControlTestReport> {
  const startTime = Date.now();
  const repos = createRepositories(customDb);
  const service = new MissionControlService(repos);

  const testSuffix = `mc_${Date.now()}`;
  const founderUid = `founder_test_${testSuffix}`;

  try {
    // 1. Trigger Mission creation, decomposition, and delegation
    const result = await service.createAndDelegateMission({
      title: `Developer Tools Viral Strategy (${testSuffix})`,
      objective: 'Formulate an initial distribution strategy and competitor research document.',
      founderUid,
      taskTitles: [
        'Analyze top 5 developer tool landing pages',
        'Draft Twitter & LinkedIn positioning copy',
        'Produce growth telemetry summary report',
      ],
    });

    // 2. Assertions
    if (!result.mission.id) throw new Error('Mission was not created with an ID');
    if (result.tasks.length !== 3) throw new Error(`Expected 3 tasks, got ${result.tasks.length}`);
    if (!result.delegatedTask) throw new Error('No task was delegated to Growth Agent');
    if (result.delegatedTask.assignedTo !== 'agent-growth') {
      throw new Error(`Expected task to be assigned to agent-growth, got ${result.delegatedTask.assignedTo}`);
    }
    if (result.delegatedTask.status !== 'in_progress') {
      throw new Error(`Expected delegated task status in_progress, got ${result.delegatedTask.status}`);
    }
    if (result.assignedAgent?.status !== 'running') {
      throw new Error(`Expected Growth Agent status running, got ${result.assignedAgent?.status}`);
    }

    // 3. Confirm reading back from Firestore via repos
    const fetchedMission = await repos.missions.getById(result.mission.id);
    if (!fetchedMission) throw new Error('Could not fetch created mission from Firestore');

    const missionTasks = await repos.tasks.listByMission(result.mission.id);
    if (missionTasks.length !== 3) throw new Error(`Fetched ${missionTasks.length} tasks instead of 3 from Firestore`);

    const inProgressTask = missionTasks.find(t => t.id === result.delegatedTask!.id);
    if (!inProgressTask || inProgressTask.status !== 'in_progress' || inProgressTask.assignedTo !== 'agent-growth') {
      throw new Error('Task state in Firestore does not match delegation expectations');
    }

    // 4. Cleanup test data
    for (const task of result.tasks) {
      await repos.tasks.delete(task.id);
    }
    await repos.missions.delete(result.mission.id);

    return {
      timestamp: Date.now(),
      success: true,
      durationMs: Date.now() - startTime,
      createdMissionId: result.mission.id,
      totalTasks: result.tasks.length,
      delegatedTaskId: result.delegatedTask.id,
      delegatedAgentId: 'agent-growth',
      delegatedTaskStatus: result.delegatedTask.status,
      agentStatus: result.assignedAgent.status,
      cleanupCompleted: true,
      details: {
        missionTitle: result.mission.title,
        tasks: result.tasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assignedTo: t.assignedTo,
        })),
      },
    };
  } catch (err: unknown) {
    return {
      timestamp: Date.now(),
      success: false,
      durationMs: Date.now() - startTime,
      createdMissionId: '',
      totalTasks: 0,
      delegatedTaskId: '',
      delegatedAgentId: 'agent-growth',
      delegatedTaskStatus: 'error',
      agentStatus: 'error',
      cleanupCompleted: false,
      details: {
        missionTitle: '',
        tasks: [],
      },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
