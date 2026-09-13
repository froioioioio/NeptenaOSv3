'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  AlertCircle,
  XCircle,
  Zap,
  Code2,
  ShieldCheck,
  Rocket,
  Bot,
  ArrowRight,
  ArrowDown,
  Workflow,
  ListOrdered,
  Layers,
  Sparkles,
  GitBranch,
  ChevronRight
} from 'lucide-react';
import { TaskEntity } from '@/schemas/repositories';
import { sortTasksByDependencyOrder, OrderedTask } from '@/lib/task-dependency';

interface TaskDependencyGraphProps {
  tasks: TaskEntity[];
  missionStatus?: string;
  missionTitle?: string;
  missionId?: string;
  compact?: boolean;
  defaultView?: 'graph' | 'list';
  isMissionExecutingConcurrently?: boolean;
  onDelegateTask?: (taskId: string, agentId: string) => void;
  onUpdateTaskStatus?: (taskId: string, newStatus: TaskEntity['status']) => void;
  onExecuteWorker?: (task: TaskEntity) => void;
  onRequestMergePR?: (task: TaskEntity) => void;
  delegatingTaskId?: string | null;
  updatingTaskId?: string | null;
  executingTaskId?: string | null;
  requestingMergeMissionId?: string | null;
}

interface GraphLevel {
  level: number;
  name: string;
  tasks: OrderedTask[];
}

export function TaskDependencyGraph({
  tasks,
  missionStatus,
  compact = false,
  defaultView = 'graph',
  isMissionExecutingConcurrently = false,
  onDelegateTask,
  onUpdateTaskStatus,
  onExecuteWorker,
  onRequestMergePR,
  delegatingTaskId,
  updatingTaskId,
  executingTaskId,
  requestingMergeMissionId,
}: TaskDependencyGraphProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'list'>(defaultView);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 1. Sort tasks topologically and enrich with step numbers
  const orderedTasks: OrderedTask[] = useMemo(() => {
    return sortTasksByDependencyOrder(tasks);
  }, [tasks]);

  // 2. Compute DAG levels / stages for visual flow representation
  const graphLevels: GraphLevel[] = useMemo(() => {
    if (orderedTasks.length === 0) return [];

    const taskLevelMap = new Map<string, number>();
    const taskMap = new Map<string, OrderedTask>();
    orderedTasks.forEach((t) => taskMap.set(t.id, t));

    // Calculate level for each task based on prerequisites
    function getTaskLevel(task: OrderedTask, visited = new Set<string>()): number {
      if (taskLevelMap.has(task.id)) return taskLevelMap.get(task.id)!;
      if (visited.has(task.id)) return 0; // Cycle safety

      visited.add(task.id);
      const depIds = task.dependsOnTaskIds || [];
      if (depIds.length === 0) {
        taskLevelMap.set(task.id, 0);
        return 0;
      }

      let maxDepLevel = -1;
      for (const depId of depIds) {
        const depTask = taskMap.get(depId);
        if (depTask) {
          const depLevel = getTaskLevel(depTask, new Set(visited));
          if (depLevel > maxDepLevel) maxDepLevel = depLevel;
        } else {
          if (maxDepLevel < 0) maxDepLevel = 0;
        }
      }

      const currentLevel = maxDepLevel + 1;
      taskLevelMap.set(task.id, currentLevel);
      return currentLevel;
    }

    // Check if any explicit dependencies exist
    const hasExplicitDependencies = orderedTasks.some(
      (t) => t.dependsOnTaskIds && t.dependsOnTaskIds.length > 0
    );

    // If no explicit dependencies, default to sequential stages or logical step groups
    if (!hasExplicitDependencies) {
      // Create sequential stages for linear execution
      orderedTasks.forEach((t, idx) => {
        taskLevelMap.set(t.id, idx);
      });
    } else {
      orderedTasks.forEach((t) => getTaskLevel(t));
    }

    // Group tasks into stage levels
    const maxLevel = Math.max(...Array.from(taskLevelMap.values()), 0);
    const levels: GraphLevel[] = [];

    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const tasksInLevel = orderedTasks.filter((t) => taskLevelMap.get(t.id) === lvl);
      if (tasksInLevel.length > 0) {
        let levelName = `Stage ${lvl + 1}`;
        if (lvl === 0) levelName = 'Phase 1: Inception & Prereqs';
        else if (lvl === maxLevel && maxLevel > 1) levelName = `Phase ${lvl + 1}: Final Review & Delivery`;
        else levelName = `Phase ${lvl + 1}: Core Execution`;

        levels.push({
          level: lvl,
          name: levelName,
          tasks: tasksInLevel,
        });
      }
    }

    return levels;
  }, [orderedTasks]);

  // Selected task data for highlighting
  const activeTask = useMemo(() => {
    return orderedTasks.find((t) => t.id === selectedTaskId) || null;
  }, [orderedTasks, selectedTaskId]);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
        No task execution records available for this mission.
      </div>
    );
  }

  const getAgentBadge = (assignedTo: string) => {
    if (assignedTo.includes('growth')) {
      return {
        label: 'Growth Agent',
        icon: <Rocket className="w-3 h-3 text-cyan-400" />,
        bg: 'bg-cyan-950/70 border-cyan-800/80 text-cyan-300',
        ring: 'ring-cyan-500/30',
        nodeBorder: 'border-cyan-700/60',
        glow: 'shadow-cyan-950/40',
      };
    } else if (assignedTo.includes('development') || assignedTo.includes('dev')) {
      return {
        label: 'Dev Agent',
        icon: <Code2 className="w-3 h-3 text-blue-400" />,
        bg: 'bg-blue-950/70 border-blue-800/80 text-blue-300',
        ring: 'ring-blue-500/30',
        nodeBorder: 'border-blue-700/60',
        glow: 'shadow-blue-950/40',
      };
    } else if (assignedTo.includes('quality') || assignedTo.includes('qa')) {
      return {
        label: 'Quality Agent',
        icon: <ShieldCheck className="w-3 h-3 text-purple-400" />,
        bg: 'bg-purple-950/70 border-purple-800/80 text-purple-300',
        ring: 'ring-purple-500/30',
        nodeBorder: 'border-purple-700/60',
        glow: 'shadow-purple-950/40',
      };
    }
    return {
      label: 'Specialist Agent',
      icon: <Bot className="w-3 h-3 text-slate-400" />,
      bg: 'bg-slate-900 border-slate-700 text-slate-300',
      ring: 'ring-slate-500/30',
      nodeBorder: 'border-slate-700',
      glow: 'shadow-slate-950/40',
    };
  };

  const getStatusDisplay = (status: TaskEntity['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          label: 'Completed',
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          dot: 'bg-emerald-400',
        };
      case 'in_progress':
        return {
          icon: <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />,
          label: 'In Progress',
          badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-800',
          dot: 'bg-cyan-400 animate-ping',
        };
      case 'blocked':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          label: 'Blocked',
          badge: 'bg-amber-950/80 text-amber-300 border-amber-800',
          dot: 'bg-amber-400',
        };
      case 'failed':
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
          label: 'Stopped / Failed',
          badge: 'bg-rose-950/80 text-rose-300 border-rose-800',
          dot: 'bg-rose-400',
        };
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
          label: 'Pending',
          badge: 'bg-slate-900 text-slate-400 border-slate-800',
          dot: 'bg-slate-400',
        };
    }
  };

  const completedCount = orderedTasks.filter((t) => t.status === 'completed').length;
  const progressPct = Math.round((completedCount / orderedTasks.length) * 100);

  return (
    <div className="space-y-3">
      {/* Dependency Graph Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-purple-950 border border-purple-800 text-purple-400">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Execution Flow &amp; Dependency Graph
              </span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                {graphLevels.length} {graphLevels.length === 1 ? 'Phase' : 'Phases'} • {orderedTasks.length} {orderedTasks.length === 1 ? 'Task' : 'Tasks'}
              </span>
              {(isMissionExecutingConcurrently || executingTaskId) && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500 font-mono text-[10px] font-bold animate-pulse shadow-[0_0_12px_rgba(34,211,238,0.3)]">
                  <Zap className="w-3 h-3 text-cyan-400 animate-spin" />
                  <span>{isMissionExecutingConcurrently ? 'Parallel Waves Active' : 'Worker Executing'}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Interactive topological execution path from kickoff to final deliverable
            </p>
          </div>
        </div>

        {/* View Switcher: Graph vs List */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              viewMode === 'graph'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Visual Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              viewMode === 'list'
                ? 'bg-purple-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Step List</span>
          </button>
        </div>
      </div>

      {/* Selected Task Highlight Banner (if clicked) */}
      {activeTask && (
        <div className="p-3 rounded-xl bg-slate-950 border border-purple-800/80 shadow-md flex items-start justify-between gap-3 text-xs animate-fadeIn">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                Step {activeTask.stepNumber} Focus
              </span>
              <strong className="text-white font-semibold">{activeTask.title}</strong>
              <span className={`text-[10px] font-mono px-2 py-0.2 rounded border ${getStatusDisplay(activeTask.status).badge}`}>
                {getStatusDisplay(activeTask.status).label}
              </span>
            </div>
            {activeTask.description && (
              <p className="text-[11px] text-slate-300 font-sans">{activeTask.description}</p>
            )}
            <div className="flex items-center gap-3 pt-1 text-[10px] font-mono text-slate-400 flex-wrap">
              <span>Assigned: <strong className="text-slate-200">{getAgentBadge(activeTask.assignedTo).label}</strong></span>
              {activeTask.dependencyDetails.length > 0 ? (
                <span>
                  Prerequisites: <strong className="text-amber-300">{activeTask.dependencyDetails.map(d => d.stepNumber ? `Step ${d.stepNumber}` : d.title).join(', ')}</strong>
                </span>
              ) : (
                <span className="text-emerald-400">Root Node (No prerequisites)</span>
              )}
            </div>

            {/* Active Execution Banner in Focus Panel */}
            {(executingTaskId === activeTask.id || (Boolean(isMissionExecutingConcurrently) && activeTask.status === 'in_progress')) && (
              <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-500/80 flex items-center justify-between gap-2 text-xs text-cyan-200 animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span className="font-semibold">Worker actively processing Step {activeTask.stepNumber} ({getAgentBadge(activeTask.assignedTo).label})</span>
                </div>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-900 border border-cyan-400 text-cyan-200 uppercase">
                  Active
                </span>
              </div>
            )}

            {/* Focus Task Action Controls */}
            {(onDelegateTask || onUpdateTaskStatus || onExecuteWorker || onRequestMergePR) && (
              <div className="flex items-center gap-1.5 pt-2 flex-wrap border-t border-slate-800/80 w-full max-w-full">
                {onDelegateTask && (
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => onDelegateTask(activeTask.id, 'agent-growth')}
                      disabled={delegatingTaskId === activeTask.id || activeTask.status === 'completed'}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                        activeTask.assignedTo === 'agent-growth' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Growth
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelegateTask(activeTask.id, 'agent-development')}
                      disabled={delegatingTaskId === activeTask.id || activeTask.status === 'completed'}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                        activeTask.assignedTo === 'agent-development' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Dev
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelegateTask(activeTask.id, 'agent-quality')}
                      disabled={delegatingTaskId === activeTask.id || activeTask.status === 'completed'}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                        activeTask.assignedTo === 'agent-quality' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      QA
                    </button>
                  </div>
                )}

                {onUpdateTaskStatus && activeTask.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => onUpdateTaskStatus(activeTask.id, activeTask.status === 'pending' ? 'in_progress' : 'completed')}
                    disabled={updatingTaskId === activeTask.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-mono transition-all disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3 text-cyan-400" />
                    <span>{activeTask.status === 'pending' ? 'Start Task' : 'Mark Done'}</span>
                  </button>
                )}

                {onExecuteWorker && activeTask.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => onExecuteWorker(activeTask)}
                    disabled={executingTaskId === activeTask.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[11px] shadow transition-all disabled:opacity-50"
                  >
                    <Zap className={`w-3 h-3 ${executingTaskId === activeTask.id ? 'animate-spin' : ''}`} />
                    <span>{executingTaskId === activeTask.id ? 'Running...' : 'Run Worker'}</span>
                  </button>
                )}

                {onRequestMergePR && activeTask.assignedTo === 'agent-development' && activeTask.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => onRequestMergePR(activeTask)}
                    disabled={Boolean(requestingMergeMissionId)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/30 hover:bg-amber-600 border border-amber-500/60 text-amber-200 hover:text-white font-semibold text-[11px] transition-all disabled:opacity-50"
                  >
                    <Lock className="w-3 h-3 text-amber-300" />
                    <span>Merge PR</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedTaskId(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-900 border border-slate-800 shrink-0"
          >
            Clear Focus
          </button>
        </div>
      )}

      {/* VIEW 1: Visual Dependency Graph (DAG Flowchart) */}
      {viewMode === 'graph' ? (
        <div className="space-y-3">
          {/* Visual Graph Canvas Container */}
          <div className="rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-5 overflow-x-auto shadow-inner">
            <div className="min-w-[620px] flex flex-col gap-6 relative">
              {graphLevels.map((stage, stageIdx) => {
                const isLastStage = stageIdx === graphLevels.length - 1;

                return (
                  <div key={stage.level} className="space-y-2 relative">
                    {/* Stage Header Indicator */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <span>{stage.name}</span>
                      </div>
                      <div className="flex-1 h-px bg-slate-800/80" />
                      <span className="text-[10px] font-mono text-slate-500">
                        {stage.tasks.length} {stage.tasks.length === 1 ? 'Task Node' : 'Task Nodes'}
                      </span>
                    </div>

                    {/* Stage Task Nodes Row (Supports parallel branching) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {stage.tasks.map((task) => {
                        const agentInfo = getAgentBadge(task.assignedTo);
                        const statusInfo = getStatusDisplay(task.status);
                        const isSelected = selectedTaskId === task.id;
                        const isPrereqOfSelected = activeTask?.dependsOnTaskIds?.includes(task.id);
                        const isExecuting = executingTaskId === task.id || (Boolean(isMissionExecutingConcurrently) && task.status === 'in_progress');

                        return (
                          <div
                            key={task.id}
                            id={`dep-graph-node-${task.id}`}
                            onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all relative overflow-hidden group shadow-md ${
                              isExecuting
                                ? 'bg-cyan-950/50 border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.25)]'
                                : isSelected
                                ? 'bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/40 shadow-purple-950/50'
                                : isPrereqOfSelected
                                ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/30'
                                : 'bg-slate-950/90 border-slate-800 hover:border-purple-700 hover:bg-slate-900'
                            }`}
                          >
                            {/* Running scanline animation */}
                            {isExecuting && (
                              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden z-10">
                                <div className="h-full bg-cyan-400 animate-pulse w-full shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                              </div>
                            )}

                            {/* Top Status & Agent Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              {/* Step & Agent Badge */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-purple-300 border border-purple-800/80 shrink-0">
                                  Step {task.stepNumber}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border truncate ${agentInfo.bg}`}>
                                  {agentInfo.icon}
                                  <span className="truncate">{agentInfo.label}</span>
                                </span>
                              </div>

                              {/* Task Status */}
                              {isExecuting ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 bg-cyan-950 text-cyan-300 border-cyan-400 animate-pulse font-bold shadow-sm">
                                  <Zap className="w-3 h-3 text-cyan-400 animate-spin" />
                                  <span>Executing...</span>
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 ${statusInfo.badge}`}>
                                  {statusInfo.icon}
                                  <span>{statusInfo.label}</span>
                                </span>
                              )}
                            </div>

                            {/* Task Title */}
                            <h4 className="font-bold text-slate-100 text-xs mb-1.5 leading-snug line-clamp-2 group-hover:text-white transition-colors">
                              {task.title}
                            </h4>

                            {/* Active execution status pill */}
                            {isExecuting && (
                              <div className="my-2 p-1.5 rounded-lg bg-cyan-950/70 border border-cyan-800/80 flex items-center justify-between gap-1 text-[10px] font-mono text-cyan-200 animate-pulse">
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                                  <span className="truncate">{agentInfo.label} actively synthesizing</span>
                                </span>
                                <span className="text-[9px] text-cyan-400 uppercase font-bold shrink-0">Working</span>
                              </div>
                            )}

                            {/* Description preview */}
                            {task.description && !isExecuting && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed font-sans mb-2.5">
                                {task.description}
                              </p>
                            )}

                            {/* Quick Action Button for In-Progress Tasks */}
                            {onExecuteWorker && task.status === 'in_progress' && (
                              <div className="my-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onExecuteWorker(task);
                                  }}
                                  disabled={isExecuting}
                                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[10px] shadow transition-all disabled:opacity-60"
                                >
                                  <Zap className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
                                  <span>{isExecuting ? 'Worker Running...' : 'Execute Worker'}</span>
                                </button>
                              </div>
                            )}

                            {/* Dependency Trace Footer */}
                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                              <div className="flex items-center gap-1 truncate">
                                {task.dependencyDetails.length === 0 ? (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <Unlock className="w-2.5 h-2.5" />
                                    <span>Root Trigger</span>
                                  </span>
                                ) : (
                                  <span className="text-amber-300/90 flex items-center gap-1 truncate" title={task.dependencyTitles.join(', ')}>
                                    <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                    <span className="truncate">
                                      After {task.dependencyDetails.map(d => d.stepNumber ? `Step ${d.stepNumber}` : d.title.slice(0, 10)).join(', ')}
                                    </span>
                                  </span>
                                )}
                              </div>

                              <span className="text-[9px] text-purple-400 group-hover:underline flex items-center gap-0.5 shrink-0">
                                <span>Inspect</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Flow Arrow Connecting to Next Stage */}
                    {!isLastStage && (
                      <div className="flex items-center justify-center py-2 relative">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 shadow-sm z-10">
                          <span className="text-purple-400 font-bold">Flows to Phase {stageIdx + 2}</span>
                          <ArrowDown className="w-3 h-3 text-purple-400 animate-bounce" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Graph Legend & Status Summary */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-slate-400">
              <span className="font-semibold text-slate-300">Agents Legend:</span>
              <span className="flex items-center gap-1 text-cyan-300">
                <Rocket className="w-3 h-3 text-cyan-400" /> Growth
              </span>
              <span className="flex items-center gap-1 text-blue-300">
                <Code2 className="w-3 h-3 text-blue-400" /> Development
              </span>
              <span className="flex items-center gap-1 text-purple-300">
                <ShieldCheck className="w-3 h-3 text-purple-400" /> Quality Audit
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-slate-400">Execution Yield:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                progressPct === 100
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-900 text-slate-300 border border-slate-800'
              }`}>
                {completedCount}/{orderedTasks.length} Completed ({progressPct}%)
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 2: Step List Sequence Table */
        <div className="space-y-2">
          {orderedTasks.map((task) => {
            const agentInfo = getAgentBadge(task.assignedTo);
            const statusInfo = getStatusDisplay(task.status);
            const isExecuting = executingTaskId === task.id || (Boolean(isMissionExecutingConcurrently) && task.status === 'in_progress');

            return (
              <div
                key={task.id}
                id={`dep-list-row-${task.id}`}
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all shadow-sm ${
                  isExecuting
                    ? 'bg-cyan-950/40 border-cyan-500/80 ring-1 ring-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Left: Task Content */}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-purple-300 border border-purple-800/80 shrink-0">
                      Step {task.stepNumber}
                    </span>
                    <h4 className="font-bold text-slate-100 truncate">{task.title}</h4>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${agentInfo.bg}`}>
                      {agentInfo.icon}
                      <span>{agentInfo.label}</span>
                    </span>
                    {isExecuting ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border font-bold bg-cyan-950 text-cyan-300 border-cyan-400 animate-pulse shadow-sm">
                        <Zap className="w-3 h-3 text-cyan-400 animate-spin" />
                        <span>Worker Running...</span>
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${statusInfo.badge}`}>
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-[11px] text-slate-400 font-sans line-clamp-1">{task.description}</p>
                  )}

                  {/* Dependencies in List Mode */}
                  <div className="pt-0.5 flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    {task.dependencyDetails.length === 0 ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Unlock className="w-2.5 h-2.5" /> Initial Step
                      </span>
                    ) : (
                      <span className="text-amber-300 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                        Depends on: {task.dependencyDetails.map(d => d.stepNumber ? `Step ${d.stepNumber} (${d.status})` : d.title).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Interactive Task Actions if callbacks provided */}
                {(onDelegateTask || onUpdateTaskStatus || onExecuteWorker || onRequestMergePR) && (
                  <div className="flex items-center gap-1.5 max-w-full justify-end flex-wrap pt-1 sm:pt-0">
                    {/* Delegation selector */}
                    {onDelegateTask && (
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDelegateTask(task.id, 'agent-growth'); }}
                          disabled={delegatingTaskId === task.id || task.status === 'completed'}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium transition-all ${
                            task.assignedTo === 'agent-growth'
                              ? 'bg-cyan-600 text-white font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Delegate to Growth Agent"
                        >
                          Growth
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDelegateTask(task.id, 'agent-development'); }}
                          disabled={delegatingTaskId === task.id || task.status === 'completed'}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium transition-all ${
                            task.assignedTo === 'agent-development'
                              ? 'bg-blue-600 text-white font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Delegate to Dev Agent"
                        >
                          Dev
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDelegateTask(task.id, 'agent-quality'); }}
                          disabled={delegatingTaskId === task.id || task.status === 'completed'}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium transition-all ${
                            task.assignedTo === 'agent-quality'
                              ? 'bg-purple-600 text-white font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Delegate to QA Agent"
                        >
                          QA
                        </button>
                      </div>
                    )}

                    {/* Status transition button */}
                    {onUpdateTaskStatus && task.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTaskStatus(task.id, task.status === 'pending' ? 'in_progress' : 'completed');
                        }}
                        disabled={updatingTaskId === task.id}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-mono transition-all disabled:opacity-50"
                        title={task.status === 'pending' ? 'Start Task' : 'Mark as Completed'}
                      >
                        <Zap className="w-2.5 h-2.5 text-cyan-400" />
                        <span>{task.status === 'pending' ? 'Start' : 'Done'}</span>
                      </button>
                    )}

                    {/* Run Worker button */}
                    {onExecuteWorker && task.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onExecuteWorker(task); }}
                        disabled={executingTaskId === task.id}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[10px] shadow transition-all disabled:opacity-50"
                      >
                        <Zap className={`w-2.5 h-2.5 ${executingTaskId === task.id ? 'animate-spin' : ''}`} />
                        <span>{executingTaskId === task.id ? 'Running...' : 'Run'}</span>
                      </button>
                    )}

                    {/* Merge PR button for dev tasks */}
                    {onRequestMergePR && task.assignedTo === 'agent-development' && task.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRequestMergePR(task); }}
                        disabled={Boolean(requestingMergeMissionId)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600 border border-amber-500/60 text-amber-200 hover:text-white font-semibold text-[10px] transition-all disabled:opacity-50"
                        title="Autonomy Gate Merge"
                      >
                        <Lock className="w-2.5 h-2.5 text-amber-300" />
                        <span>Merge PR</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TaskDependencyGraph;
