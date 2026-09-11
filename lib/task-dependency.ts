import { TaskEntity, MissionEntity } from '@/schemas/repositories';

export interface OrderedTask extends TaskEntity {
  stepNumber: number;
  dependencyTitles: string[];
  dependencyDetails: Array<{ id: string; title: string; status: string; stepNumber?: number }>;
  isBlockedByPrereq: boolean;
  unmetPrerequisites: string[];
}

/**
 * Sorts tasks by their dependency hierarchy (topological sort)
 * so prerequisite tasks always appear before dependent tasks.
 */
export function sortTasksByDependencyOrder(tasks: TaskEntity[]): OrderedTask[] {
  if (!tasks || tasks.length === 0) return [];

  const taskMap = new Map<string, TaskEntity>();
  tasks.forEach(t => taskMap.set(t.id, t));

  // Build dependency graph and in-degree counts
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: TaskEntity[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      // Cycle detected - break cycle safely
      return;
    }
    visiting.add(taskId);

    const task = taskMap.get(taskId);
    if (task && task.dependsOnTaskIds && task.dependsOnTaskIds.length > 0) {
      for (const depId of task.dependsOnTaskIds) {
        if (taskMap.has(depId)) {
          visit(depId);
        }
      }
    }

    visiting.delete(taskId);
    visited.add(taskId);
    if (task) {
      ordered.push(task);
    }
  }

  // Visit all tasks
  tasks.forEach(t => visit(t.id));

  // Map task IDs to 1-indexed Step numbers
  const idToStep = new Map<string, number>();
  ordered.forEach((t, idx) => idToStep.set(t.id, idx + 1));

  return ordered.map((task, idx) => {
    const depIds = task.dependsOnTaskIds || [];
    const dependencyDetails: OrderedTask['dependencyDetails'] = [];
    const dependencyTitles: string[] = [];
    const unmetPrerequisites: string[] = [];

    for (const depId of depIds) {
      const depTask = taskMap.get(depId);
      const stepNum = idToStep.get(depId);
      if (depTask) {
        dependencyDetails.push({
          id: depId,
          title: depTask.title,
          status: depTask.status,
          stepNumber: stepNum,
        });
        dependencyTitles.push(`Step ${stepNum || '?'}: ${depTask.title}`);
        if (depTask.status !== 'completed') {
          unmetPrerequisites.push(`Step ${stepNum || '?'}: ${depTask.title} (${depTask.status})`);
        }
      } else {
        dependencyTitles.push(`Task ${depId.slice(0, 8)}`);
      }
    }

    const isBlockedByPrereq = unmetPrerequisites.length > 0;

    return {
      ...task,
      stepNumber: idx + 1,
      dependencyTitles,
      dependencyDetails,
      isBlockedByPrereq,
      unmetPrerequisites,
    };
  });
}

export interface DashboardMetrics {
  totalMissions: number;
  activeMissions: number;
  queuedMissions: number;
  completedMissions: number;
  totalTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  blockedTasks: number;
  pendingTasks: number;
  completionPercentage: number;
}

export function computeDashboardMetrics(missions: Array<MissionEntity & { tasks?: TaskEntity[] }>): DashboardMetrics {
  const totalMissions = missions.length;
  const activeMissions = missions.filter(m => m.status === 'active').length;
  const queuedMissions = missions.filter(m => m.status === 'queued' || m.status === 'draft').length;
  const completedMissions = missions.filter(m => m.status === 'completed').length;

  let totalTasks = 0;
  let inProgressTasks = 0;
  let completedTasks = 0;
  let blockedTasks = 0;
  let pendingTasks = 0;

  missions.forEach(m => {
    (m.tasks || []).forEach(t => {
      totalTasks++;
      if (t.status === 'completed') completedTasks++;
      else if (t.status === 'in_progress') inProgressTasks++;
      else if (t.status === 'blocked') blockedTasks++;
      else if (t.status === 'pending') pendingTasks++;
    });
  });

  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalMissions,
    activeMissions,
    queuedMissions,
    completedMissions,
    totalTasks,
    inProgressTasks,
    completedTasks,
    blockedTasks,
    pendingTasks,
    completionPercentage,
  };
}
