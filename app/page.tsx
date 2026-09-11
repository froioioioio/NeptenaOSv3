'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Rocket, 
  CheckCircle2, 
  Sparkles, 
  RefreshCw, 
  Send, 
  Layers, 
  ChevronRight, 
  ChevronDown, 
  AlertCircle, 
  Database, 
  Check,
  CheckCircle,
  FileText,
  FileCheck,
  Zap,
  Eye,
  X,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  GitPullRequest,
  GitBranch,
  GitMerge,
  ExternalLink,
  Code2,
  Lock,
  Unlock,
  AlertTriangle,
  Activity,
  Clock,
  ArrowDown,
  ListOrdered,
  TrendingUp,
  BarChart3,
  CircleDot,
  Bot,
  Users,
  GitFork,
  Radio,
  Share2,
  Workflow,
  FolderGit2,
  Archive,
  Ban,
  Coins,
  Presentation,
  Image as ImageIcon,
  Video as VideoIcon,
  Palette,
  Film,
  Download,
  Trash2,
  ArchiveRestore,
  Filter
} from 'lucide-react';
import { getFirebaseAuth, onAuthStateChanged, type User } from '@/lib/firebase';
import AuthGuard from '@/components/AuthGuard';
import UserSessionNav from '@/components/UserSessionNav';
import { MissionCostCounter } from '@/components/MissionCostCounter';
import { TaskDependencyGraph } from '@/components/TaskDependencyGraph';
import { formatUsd, formatPhp } from '@/lib/token-pricing';
import { 
  MissionEntity, 
  TaskEntity, 
  ArtifactEntity, 
  ApprovalEntity, 
  ActivityRecordEntity, 
  ConcurrentMissionExecutionResult,
  AgentDirectResponse
} from '@/schemas/repositories';
import { sortTasksByDependencyOrder, computeDashboardMetrics } from '@/lib/task-dependency';
import { parseJsonResponse } from '@/lib/utils';

interface MissionWithTasks extends MissionEntity {
  tasks?: TaskEntity[];
}

export default function MissionControlScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [missions, setMissions] = useState<MissionWithTasks[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactEntity[]>([]);
  const [approvals, setApprovals] = useState<ApprovalEntity[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalEntity[]>([]);
  const [missionFilter, setMissionFilter] = useState<'active' | 'all' | 'queued' | 'completed'>('active');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [evaluatingArtifactId, setEvaluatingArtifactId] = useState<string | null>(null);
  const [generatingCodeArtifactId, setGeneratingCodeArtifactId] = useState<string | null>(null);
  const [generatingDeliverable, setGeneratingDeliverable] = useState<{
    artifactId: string;
    type: 'code' | 'document' | 'presentation' | 'image' | 'video';
  } | null>(null);
  const [activeDeliverableMenuArtifactId, setActiveDeliverableMenuArtifactId] = useState<string | null>(null);
  const [creatingPrMissionId, setCreatingPrMissionId] = useState<string | null>(null);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [requestingMergeMissionId, setRequestingMergeMissionId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactEntity | null>(null);
  
  // Archive & Cancel Mission State
  const [archivingMissionId, setArchivingMissionId] = useState<string | null>(null);
  const [completingMissionId, setCompletingMissionId] = useState<string | null>(null);
  const [missionToArchive, setMissionToArchive] = useState<MissionWithTasks | null>(null);
  const [cancellingMission, setCancellingMission] = useState<MissionWithTasks | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [cancellingSubmitting, setCancellingSubmitting] = useState(false);
  const [totalArchivedCount, setTotalArchivedCount] = useState(0);
  const [archiveNotice, setArchiveNotice] = useState<{
    missionTitle: string;
    type: 'archived' | 'cancelled';
    cancellationReason?: string;
  } | null>(null);

  // Deliverables / Artifacts Management State
  const [artifactFilter, setArtifactFilter] = useState<'active' | 'approved' | 'pending' | 'all' | 'archived'>('active');
  const [approvingArtifactId, setApprovingArtifactId] = useState<string | null>(null);
  const [closingArtifactId, setClosingArtifactId] = useState<string | null>(null);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [cleaningOrphanedArtifacts, setCleaningOrphanedArtifacts] = useState(false);
  const [closingAllArtifacts, setClosingAllArtifacts] = useState(false);
  const [closeAllModalOpen, setCloseAllModalOpen] = useState(false);
  const [deleteArtifactTarget, setDeleteArtifactTarget] = useState<{ id: string; title: string } | null>(null);
  const [artifactActionNotice, setArtifactActionNotice] = useState<string | null>(null);

  // Missions Consolidation State
  const [consolidatingMissions, setConsolidatingMissions] = useState(false);
  const [missionActionNotice, setMissionActionNotice] = useState<string | null>(null);

  // Section Collapse/Expand State (default expanded so open missions and archive controls are directly visible)
  const [artifactsExpanded, setArtifactsExpanded] = useState(true);
  const [missionsExpanded, setMissionsExpanded] = useState(true);
  const [activityStreamExpanded, setActivityStreamExpanded] = useState(true);

  const [missionPrNotice, setMissionPrNotice] = useState<{
    missionId: string;
    missionTitle: string;
    prNumber: number;
    prUrl: string;
    branchName: string;
    bundledFiles: string[];
  } | null>(null);

  const [compoundedNotice, setCompoundedNotice] = useState<{
    docId: string;
    docTitle: string;
    domain: string;
    score: number;
    filePath: string;
    missionTitle: string;
  } | null>(null);
  
  // Form State
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [formError, setFormError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<{
    missionTitle: string;
    delegatedTaskTitle: string;
    assignedAgent: string;
    taskStatus: string;
    taskId?: string;
    missionId?: string;
  } | null>(null);

  // Direct Agent Request Modal State (for interactive testing on live missions)
  const [directReqModalOpen, setDirectReqModalOpen] = useState(false);
  const [directReqTargetMission, setDirectReqTargetMission] = useState<MissionWithTasks | null>(null);
  const [directReqTargetTask, setDirectReqTargetTask] = useState<TaskEntity | null>(null);
  const [directReqAgentId, setDirectReqAgentId] = useState<'agent-growth' | 'agent-development' | 'agent-quality'>('agent-growth');
  const [directReqType, setDirectReqType] = useState<'re_prioritize' | 'ask_agent_output' | 'flag_blocker'>('re_prioritize');
  const [directReqReason, setDirectReqReason] = useState('');
  const [directReqNewPriority, setDirectReqNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('critical');
  const [directReqTargetAgent, setDirectReqTargetAgent] = useState<'agent-growth' | 'agent-development' | 'agent-quality'>('agent-growth');
  const [directReqSeverity, setDirectReqSeverity] = useState<'blocking' | 'warning'>('blocking');
  const [directReqSubmitting, setDirectReqSubmitting] = useState(false);
  const [directReqResponse, setDirectReqResponse] = useState<AgentDirectResponse | null>(null);

  // Concurrent Execution State for Individual Missions
  const [executingMissionConcurrentlyId, setExecutingMissionConcurrentlyId] = useState<string | null>(null);
  const [liveExecutionResult, setLiveExecutionResult] = useState<ConcurrentMissionExecutionResult | null>(null);

  // Activity Records Feed
  const [activities, setActivities] = useState<ActivityRecordEntity[]>([]);

  // Auth observer
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch missions, artifacts, approvals, and activities
  const fetchData = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);

    try {
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      };

      const [missionsData, artifactsData, approvalsData, activitiesData] = await Promise.all([
        safeFetch('/api/missions'),
        safeFetch('/api/artifacts?includeArchived=true'),
        safeFetch('/api/approvals'),
        safeFetch('/api/agents/requests?limit=30'),
      ]);

      if (missionsData?.success && Array.isArray(missionsData.missions)) {
        setMissions(missionsData.missions);
        if (typeof missionsData.totalArchivedCount === 'number') {
          setTotalArchivedCount(missionsData.totalArchivedCount);
        }
        if (missionsData.consolidationReport?.duplicateMissionsRemoved > 0) {
          setMissionActionNotice(missionsData.consolidationReport.message);
        }
      }
      if (artifactsData?.success && Array.isArray(artifactsData.artifacts)) {
        setArtifacts(artifactsData.artifacts);
      }
      if (approvalsData?.success && Array.isArray(approvalsData.approvals)) {
        setApprovals(approvalsData.approvals);
        setPendingApprovals(
          approvalsData.pending || approvalsData.approvals.filter((a: ApprovalEntity) => a.status === 'pending')
        );
      }
      if (activitiesData?.success && Array.isArray(activitiesData.activities)) {
        setActivities(activitiesData.activities);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await fetchData();
      } catch {
        // Fallback silently
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();

    const handleFocus = () => {
      if (!ignore) fetchData(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !ignore) {
        fetchData(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = setInterval(() => {
      if (!ignore && document.visibilityState === 'visible') {
        fetchData(true);
      }
    }, 10000);

    return () => {
      ignore = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [fetchData]);

  // Handle Form Submit
  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !objective.trim()) {
      setFormError('Please provide both a Title and an Objective.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    setCreatedNotice(null);

    try {
      const founderUid = user?.uid || 'founder_active_session';

      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          objective: objective.trim(),
          priority,
          founderUid,
          // Removed human-assigned agent and hardcoded taskTitles.
          // The CEO orchestrator will dynamically construct the execution graph.
        }),
      });

      const data = await parseJsonResponse(res);
      const result = data.result;

      if (result) {
        setCreatedNotice({
          missionTitle: result.mission?.title || title,
          delegatedTaskTitle: result.delegatedTask?.title || 'CEO Decomposition & Delegation',
          assignedAgent: 'CEO Executive Orchestrator',
          taskStatus: result.delegatedTask?.status || 'in_progress',
          taskId: result.delegatedTask?.id,
          missionId: result.mission?.id,
        });
      }

      // Reset form
      setTitle('');
      setObjective('');
      
      // Refresh data
      await fetchData(true);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An error occurred while creating the mission.');
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger Quality Specialist Agent on a delegated task or artifact
  const handleExecuteQualityWorker = async (taskId: string, targetArtifactId?: string) => {
    setExecutingTaskId(taskId);
    try {
      const res = await fetch('/api/agents/quality/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, targetArtifactId }),
      });

      const data = await parseJsonResponse(res);

      if (data.result?.artifact) {
        setSelectedArtifact(data.result.artifact);
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`QA execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecutingTaskId(null);
    }
  };

  // Trigger Growth Agent on a delegated task
  const handleExecuteGrowthWorker = async (taskId: string) => {
    setExecutingTaskId(taskId);
    try {
      const res = await fetch('/api/agents/growth/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      const data = await parseJsonResponse(res);

      if (data.result?.artifact) {
        setSelectedArtifact(data.result.artifact);
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecutingTaskId(null);
    }
  };

  // Trigger Development Agent on a delegated task
  const handleExecuteDevWorker = async (taskId: string, prdArtifactId?: string) => {
    setExecutingTaskId(taskId);
    try {
      const res = await fetch('/api/agents/development/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, prdArtifactId }),
      });

      const data = await parseJsonResponse(res);

      if (data.result?.artifact) {
        setSelectedArtifact(data.result.artifact);
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecutingTaskId(null);
    }
  };

  // Quick Action: Generate Multi-Modal Deliverable (Code, Document, Presentation, Image, Video) into Mission Project Workspace
  const handleGenerateDeliverableFromArtifact = async (
    artifactId: string,
    type: 'code' | 'document' | 'presentation' | 'image' | 'video'
  ) => {
    setGeneratingDeliverable({ artifactId, type });
    setActiveDeliverableMenuArtifactId(null);
    try {
      const artifact = artifacts.find(a => a.id === artifactId);
      const parentMission = missions.find(m => m.id === artifact?.missionId);
      const typeLabelMap: Record<string, string> = {
        code: 'Source Code & Architecture',
        document: 'Executive Document & Whitepaper',
        presentation: 'Pitch Deck & Presentation',
        image: 'Visual Asset & SVG Graphic',
        video: 'Video Storyboard & Production Script',
      };
      const label = typeLabelMap[type] || 'Production Deliverable';
      const missionTitle = parentMission?.title || (artifact?.title ? `${label}: ${artifact.title}` : `${label} Generation`);
      const missionObjective = parentMission?.objective || `Generate production ${type} deliverable aligned with ${artifact?.title || 'mission requirements'}`;

      const res = await fetch('/api/agents/development/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdArtifactId: artifactId,
          deliverableType: type,
          missionTitle,
          objective: missionObjective,
        }),
      });

      const data = await parseJsonResponse(res);

      if (data.result?.artifact) {
        setSelectedArtifact(data.result.artifact);
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Deliverable generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeneratingDeliverable(null);
    }
  };

  // Legacy alias for code generation
  const handleGenerateCodeFromArtifact = async (artifactId: string) => {
    return handleGenerateDeliverableFromArtifact(artifactId, 'code');
  };

  // Mission-Level Pull Request Action: Bundles all project files into a single PR
  const handleCreateMissionPR = async (missionId: string) => {
    setCreatingPrMissionId(missionId);
    setMissionPrNotice(null);
    try {
      const res = await fetch('/api/missions/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
      });

      const data = await parseJsonResponse(res);

      const mission = missions.find(m => m.id === missionId);
      if (data.pr) {
        setMissionPrNotice({
          missionId,
          missionTitle: mission?.title || 'Mission Deliverables',
          prNumber: data.pr.prNumber,
          prUrl: data.pr.prUrl,
          branchName: data.pr.branchName,
          bundledFiles: data.pr.bundledFiles || [],
        });
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Mission PR creation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreatingPrMissionId(null);
    }
  };

  // Trigger Pass 2: LLM Evaluation & Knowledge Compounding on an Artifact
  const handleEvaluateAndCompound = async (artifactId: string) => {
    setEvaluatingArtifactId(artifactId);
    setCompoundedNotice(null);
    try {
      const res = await fetch('/api/missions/evaluate-artifact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId }),
      });

      const data = await parseJsonResponse(res);

      const result = data.result;
      if (result?.knowledgeDocument) {
        setCompoundedNotice({
          docId: result.knowledgeDocument.id,
          docTitle: result.knowledgeDocument.title,
          domain: result.knowledgeDocument.domain,
          score: result.evaluation?.score || 0.9,
          filePath: result.knowledgeDocument.filePath || `/company/${result.knowledgeDocument.domain}/${result.knowledgeDocument.id}.md`,
          missionTitle: result.mission?.title || 'Referenced Mission',
        });
      }

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEvaluatingArtifactId(null);
    }
  };

  // Resolve Pending Approval (Founder Decision: Approve / Reject)
  const handleResolveApproval = async (approvalId: string, decision: 'approved' | 'rejected', note?: string) => {
    setResolvingApprovalId(approvalId);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });

      const data = await parseJsonResponse(res);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Approval resolution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResolvingApprovalId(null);
    }
  };

  // Delegate a specific Task by Type (Growth Agent vs Development Agent vs Quality Agent)
  const handleDelegateTask = async (taskId: string, targetAgent: 'agent-growth' | 'agent-development' | 'agent-quality') => {
    setDelegatingTaskId(taskId);
    try {
      const res = await fetch('/api/tasks/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, assignedAgent: targetAgent }),
      });

      const data = await parseJsonResponse(res);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDelegatingTaskId(null);
    }
  };

  // Trigger Production PR Merge (which triggers the Approval Gate if not already approved)
  const handleRequestMergePR = async (missionId: string, prNumber: number, branchName: string, taskId?: string) => {
    setRequestingMergeMissionId(missionId);
    try {
      const res = await fetch('/api/agents/development/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId, prNumber, branchName, taskId }),
      });

      const data = await parseJsonResponse(res);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Merge request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRequestingMergeMissionId(null);
    }
  };

  // Direct Task Status Transition (Pending -> In Progress -> Completed / Blocked)
  const handleUpdateTaskStatus = async (taskId: string, newStatus: TaskEntity['status']) => {
    setUpdatingTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await parseJsonResponse(res);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Task status update failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Open Human Check Archive Modal
  const handleOpenArchiveModal = (mission: MissionWithTasks) => {
    setMissionToArchive(mission);
  };

  // Confirm Archive Mission (Cascades to all associated deliverables)
  const handleConfirmArchiveMission = async () => {
    if (!missionToArchive) return;
    const missionId = missionToArchive.id;
    const missionTitle = missionToArchive.title;
    setArchivingMissionId(missionId);
    setArchiveNotice(null);
    try {
      const res = await fetch('/api/missions/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId, action: 'archive' }),
      });

      const data = await parseJsonResponse(res);

      setArchiveNotice({
        missionTitle,
        type: 'archived',
      });
      setMissionToArchive(null);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Archive failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setArchivingMissionId(null);
    }
  };

  // One-tap approve an individual Deliverable / Artifact from Mission Control
  const handleApproveArtifact = async (artifactId: string, artifactTitle: string) => {
    setApprovingArtifactId(artifactId);
    setArtifactActionNotice(null);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          id: artifactId,
          status: 'approved',
          approvedBy: 'Founder / CEO (Mission Control)',
        }),
      });

      const data = await parseJsonResponse(res);

      setArtifacts((prev) =>
        prev.map((a) => (a.id === artifactId ? {
          ...a,
          status: 'approved',
          approvedAt: Date.now(),
          approvedBy: 'Founder / CEO (Mission Control)',
          projectFilePath: data.projectFilePath || a.projectFilePath,
          projectFolder: data.projectFolder || a.projectFolder,
        } : a))
      );

      if (selectedArtifact?.id === artifactId) {
        setSelectedArtifact((prev) => prev ? {
          ...prev,
          status: 'approved',
          approvedAt: Date.now(),
          approvedBy: 'Founder / CEO (Mission Control)',
          projectFilePath: data.projectFilePath || prev.projectFilePath,
          projectFolder: data.projectFolder || prev.projectFolder,
        } : null);
      }

      setArtifactActionNotice(
        `Approved Deliverable: "${artifactTitle}"${data.projectFilePath ? ` • Stored in [${data.projectFilePath}]` : ''}`
      );
      await fetchData(true);
    } catch (err: unknown) {
      alert(`Approval failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApprovingArtifactId(null);
    }
  };

  // Close or Re-open an individual Deliverable / Artifact
  const handleCloseArtifact = async (artifactId: string, artifactTitle: string, isReopen = false) => {
    setClosingArtifactId(artifactId);
    setArtifactActionNotice(null);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isReopen ? 'unarchive' : 'close',
          id: artifactId,
        }),
      });

      const data = await parseJsonResponse(res);

      setArtifactActionNotice(
        isReopen
          ? `Deliverable '${artifactTitle}' re-opened and returned to active list.`
          : `Deliverable '${artifactTitle}' closed and removed from active board.`
      );

      // If this artifact was currently opened in the inspector, update or close it
      if (selectedArtifact?.id === artifactId) {
        if (!isReopen) {
          setSelectedArtifact(null);
        } else if (data.artifact) {
          setSelectedArtifact(data.artifact);
        }
      }

      await fetchData(true);
    } catch (err: unknown) {
      setArtifactActionNotice(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClosingArtifactId(null);
    }
  };

  // Delete an individual Deliverable / Artifact permanently
  const handleConfirmDeleteArtifact = async () => {
    if (!deleteArtifactTarget) return;
    const { id: artifactId, title: artifactTitle } = deleteArtifactTarget;
    setDeletingArtifactId(artifactId);
    try {
      const res = await fetch(`/api/artifacts?id=${encodeURIComponent(artifactId)}`, {
        method: 'DELETE',
      });
      await parseJsonResponse(res);

      setArtifactActionNotice(`Deliverable '${artifactTitle}' was permanently deleted.`);
      if (selectedArtifact?.id === artifactId) {
        setSelectedArtifact(null);
      }
      setDeleteArtifactTarget(null);
      await fetchData(true);
    } catch (err: unknown) {
      setArtifactActionNotice(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingArtifactId(null);
    }
  };

  // Clean up all orphaned / inactive deliverables (parent mission is archived/cancelled/missing)
  const handleCleanupOrphanedArtifacts = async () => {
    setCleaningOrphanedArtifacts(true);
    setArtifactActionNotice(null);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup_orphaned' }),
      });
      const data = await parseJsonResponse(res);
      setArtifactActionNotice(
        data.cleanedCount > 0
          ? `Cleaned up and archived ${data.cleanedCount} deliverable(s) from inactive/archived missions.`
          : 'No orphaned deliverables found. All active deliverables belong to current missions.'
      );
      await fetchData(true);
    } catch (err: unknown) {
      setArtifactActionNotice(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCleaningOrphanedArtifacts(false);
    }
  };

  // Open Batch Close All Open Deliverables Modal
  const handleCloseAllArtifacts = () => {
    const activeCount = artifacts.filter(a => a.status !== 'archived').length;
    if (activeCount === 0) {
      setArtifactActionNotice('There are no active deliverables to close. All deliverables are already archived.');
      return;
    }
    setCloseAllModalOpen(true);
  };

  // Confirm Batch Close All Open Deliverables
  const handleConfirmCloseAllArtifacts = async () => {
    const activeArtifacts = artifacts.filter(a => a.status !== 'archived');
    const activeCount = activeArtifacts.length;
    if (activeCount === 0) {
      setCloseAllModalOpen(false);
      setArtifactActionNotice('All deliverables are already closed and archived.');
      return;
    }

    setClosingAllArtifacts(true);
    setArtifactActionNotice(null);
    try {
      const activeIds = activeArtifacts.map(a => a.id).filter(Boolean);
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_all',
          ids: activeIds,
        }),
      });
      const data = await parseJsonResponse(res);

      // Optimistically update local state immediately so UI updates instantly
      setArtifacts(prev =>
        prev.map(a => (a.status !== 'archived' ? { ...a, status: 'archived', updatedAt: Date.now() } : a))
      );
      if (selectedArtifact && selectedArtifact.status !== 'archived') {
        setSelectedArtifact(prev => prev ? { ...prev, status: 'archived', updatedAt: Date.now() } : null);
      }

      setArtifactActionNotice(data.message || `Closed and archived ${data.closedCount ?? activeCount} deliverables.`);
      setCloseAllModalOpen(false);
      await fetchData(true);
    } catch (err: unknown) {
      console.error('Batch close deliverables error:', err);
      // Fallback local update to keep UI responsive
      setArtifacts(prev =>
        prev.map(a => (a.status !== 'archived' ? { ...a, status: 'archived', updatedAt: Date.now() } : a))
      );
      if (selectedArtifact && selectedArtifact.status !== 'archived') {
        setSelectedArtifact(prev => prev ? { ...prev, status: 'archived', updatedAt: Date.now() } : null);
      }
      setCloseAllModalOpen(false);
      setArtifactActionNotice(`Closed all active deliverables (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setClosingAllArtifacts(false);
    }
  };

  // Open Cancel Mission Modal
  const handleOpenCancelModal = (mission: MissionWithTasks) => {
    setCancellingMission(mission);
    setCancelReasonInput('');
  };

  // Confirm Cancellation (Sends directly to archive and cascades to deliverables)
  const handleConfirmCancelMission = async () => {
    if (!cancellingMission) return;
    setCancellingSubmitting(true);
    setArchiveNotice(null);
    try {
      const res = await fetch('/api/missions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: cancellingMission.id,
          reason: cancelReasonInput.trim() || 'Cancelled by Founder',
        }),
      });

      const data = await parseJsonResponse(res);

      setArchiveNotice({
        missionTitle: cancellingMission.title,
        type: 'cancelled',
        cancellationReason: cancelReasonInput.trim() || 'Cancelled by Founder',
      });
      setCancellingMission(null);

      await fetchData(true);
    } catch (err: unknown) {
      alert(`Mission cancellation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCancellingSubmitting(false);
    }
  };

  // Mark Mission as Completed
  const handleCompleteMission = async (missionId: string) => {
    setCompletingMissionId(missionId);
    try {
      const res = await fetch('/api/missions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
      });
      const data = await parseJsonResponse(res);
      if (data.message) {
        setArtifactActionNotice(data.message);
      }
      await fetchData(true);
    } catch (err: unknown) {
      alert(`Marking mission completed failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCompletingMissionId(null);
    }
  };

  // Auto-consolidate and cleanup duplicate missions (identical title and objective/scope)
  const handleConsolidateDuplicateMissions = async () => {
    setConsolidatingMissions(true);
    setMissionActionNotice(null);
    try {
      const res = await fetch('/api/missions/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ founderUid }),
      });
      const data = await parseJsonResponse(res);
      const rep = data.report;
      setMissionActionNotice(rep?.message || 'Duplicate missions consolidated successfully.');
      await fetchData(true);
    } catch (err: unknown) {
      alert(`Consolidation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConsolidatingMissions(false);
    }
  };

  // Execute an existing mission with parallel concurrent waves
  const handleExecuteMissionConcurrently = async (missionId: string) => {
    setExecutingMissionConcurrentlyId(missionId);
    setLiveExecutionResult(null);
    try {
      const res = await fetch('/api/missions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
      });
      const data = await parseJsonResponse(res);
      setLiveExecutionResult(data.result);
      await fetchData(true);
    } catch (err: unknown) {
      alert(`Concurrent execution error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecutingMissionConcurrentlyId(null);
    }
  };

  // Open Direct Agent Request Modal for a mission or task
  const handleOpenDirectRequestModal = (mission: MissionWithTasks, task?: TaskEntity) => {
    setDirectReqTargetMission(mission);
    setDirectReqTargetTask(task || null);
    setDirectReqAgentId(task?.assignedTo === 'agent-development' ? 'agent-development' : 'agent-growth');
    setDirectReqType('re_prioritize');
    setDirectReqReason('');
    setDirectReqNewPriority('critical');
    setDirectReqSeverity('blocking');
    setDirectReqTargetAgent(task?.assignedTo === 'agent-development' ? 'agent-growth' : 'agent-development');
    setDirectReqResponse(null);
    setDirectReqModalOpen(true);
  };

  // Submit Direct Agent Request to Mission Control
  const handleSubmitDirectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directReqTargetMission) return;

    setDirectReqSubmitting(true);
    setDirectReqResponse(null);

    try {
      const payload: Record<string, unknown> = {};
      if (directReqType === 're_prioritize') {
        payload.newPriority = directReqNewPriority;
        payload.priorityReason = directReqReason || 'High urgency blocker detected by autonomous worker';
        if (directReqTargetTask) payload.targetTaskId = directReqTargetTask.id;
      } else if (directReqType === 'ask_agent_output') {
        payload.targetAgentId = directReqTargetAgent;
        payload.query = directReqReason || 'Latest intelligence artifacts and research summaries';
      } else if (directReqType === 'flag_blocker') {
        payload.blockerReason = directReqReason || 'Third-party API rate limit or missing configuration key';
        payload.severity = directReqSeverity;
        payload.suggestedRemedy = 'Elevate to founder or request credentials';
      }

      const res = await fetch('/api/agents/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: directReqTargetMission.id,
          agentId: directReqAgentId,
          taskId: directReqTargetTask?.id,
          requestType: directReqType,
          payload,
        }),
      });

      const data = await parseJsonResponse(res);

      setDirectReqResponse(data.response);
      await fetchData(true);
    } catch (err: unknown) {
      alert(`Direct agent request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDirectReqSubmitting(false);
    }
  };

  const getStatusBadge = (status: MissionEntity['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            active
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            completed
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            queued
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
            failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  const getTaskStatusBadge = (status: TaskEntity['status']) => {
    switch (status) {
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            in_progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <Check className="w-3 h-3 text-emerald-400" /> completed
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
            <Lock className="w-3 h-3 text-amber-400" /> blocked (gate)
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">
            <X className="w-3 h-3 text-rose-400" /> failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  return (
    <AuthGuard
      fallbackTitle="Neptena-OS Mission Control"
      fallbackDescription="Autonomous dual-agent orchestration, GitHub integration, and company knowledge compounding are locked. Please authenticate with your Founder account."
    >
      <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200 pb-16 w-full max-w-full overflow-x-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 sm:px-6 py-2 transition-all">
          <div className="max-w-6xl mx-auto flex flex-col divide-y divide-slate-800/80">
            {/* Top Bar: Brand, Actions, User Session */}
            <div className="flex items-center justify-between gap-2 py-2">
              {/* Brand / Logo */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20 text-white font-bold text-xs sm:text-sm shrink-0">
                  N
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-white truncate">Neptena-OS</h1>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-950 text-cyan-300 border border-cyan-800 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="hidden sm:inline">Live Autonomous Ops</span>
                      <span className="sm:hidden">Live</span>
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">
                    Mission Control • Growth (Search) &amp; Dev (PRD → PR)
                  </p>
                </div>
              </div>

              {/* Action Buttons & User Profile */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="refresh-missions-btn"
                  onClick={() => fetchData(true)}
                  disabled={refreshing || loading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
                  title="Refresh live missions and artifacts"
                  aria-label="Refresh Data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline text-[11px]">Sync</span>
                </button>

                <UserSessionNav />
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-2">
              <Link
                href="/"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 text-cyan-200 border border-cyan-800 shrink-0 shadow-sm leading-none"
                title="Mission Control Dashboard"
              >
                <Rocket className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Missions</span>
              </Link>

              <Link
                href="/missions/archive"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Central Mission Archive (Completed, Cancelled, Historical)"
              >
                <Archive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Archive</span>
                {totalArchivedCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-purple-950 text-purple-300 border border-purple-800 rounded-full text-[10px] font-mono">
                    {totalArchivedCount}
                  </span>
                )}
              </Link>

              <Link
                href="/agents"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Agents & Worker Fleet Directory"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="hidden sm:inline">Agents &amp; Fleet</span>
                <span className="sm:hidden">Fleet</span>
              </Link>

              <Link
                href="/knowledge"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Company Knowledge Base (/company)"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Knowledge</span>
                <span className="sm:hidden">Docs</span>
              </Link>

              <Link
                href="/artifacts"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Artifacts & Knowledge Approvals"
              >
                <FileCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Artifacts</span>
                <span className="sm:hidden">Review</span>
              </Link>
            </div>
          </div>
        </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 space-y-5 sm:space-y-6 w-full">
        {/* Archive/Cancel Notification Banner */}
        {archiveNotice && (
          <div
            id="archive-notice-banner"
            className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-fadeIn ${
              archiveNotice.type === 'cancelled'
                ? 'border-rose-700/80 bg-rose-950/40 text-rose-200'
                : 'border-purple-700/80 bg-purple-950/40 text-purple-200'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  archiveNotice.type === 'cancelled'
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : 'bg-purple-950 text-purple-400 border border-purple-800'
                }`}
              >
                {archiveNotice.type === 'cancelled' ? (
                  <Ban className="w-5 h-5" />
                ) : (
                  <Archive className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    {archiveNotice.type === 'cancelled' ? 'Mission Cancelled & Archived' : 'Mission Moved to Central Archive'}
                  </h3>
                </div>
                <p className="text-xs opacity-90">
                  Mission &quot;<strong className="text-white">{archiveNotice.missionTitle}</strong>&quot;{' '}
                  {archiveNotice.type === 'cancelled'
                    ? `was cancelled (${archiveNotice.cancellationReason || 'Founder request'}) and routed directly to the Central Archive.`
                    : 'has been archived and preserved with all deliverable snapshots.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <Link
                href="/missions/archive"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>View in Central Archive</span>
              </Link>
              <button
                onClick={() => setArchiveNotice(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active Founder Approval Prompts Banner */}
        {pendingApprovals.length > 0 && (
          <div
            id="pending-approvals-card"
            className="rounded-2xl border-2 border-amber-500 bg-amber-950/30 p-5 space-y-4 shadow-xl shadow-amber-950/40 animate-fadeIn"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white tracking-wide">FOUNDER APPROVAL REQUIRED</h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                      {pendingApprovals.length} PENDING
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 font-sans">
                    Autonomy Gate: Merge Production PR requires explicit Founder authorization.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Production Merge Locked</span>
              </div>
            </div>

            <div className="space-y-3">
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  id={`approval-item-${approval.id}`}
                  className="rounded-xl bg-slate-950/90 border border-amber-600/60 p-4 space-y-3 shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700">
                          {approval.actionType}
                        </span>
                        <h3 className="text-xs sm:text-sm font-semibold text-white">
                          {approval.description}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Requested by: <code className="text-cyan-300">{approval.requestedByAgent}</code> • Mission: <code className="text-slate-300">{approval.missionId}</code>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        id={`reject-btn-${approval.id}`}
                        onClick={() => handleResolveApproval(approval.id, 'rejected', 'Rejected by Founder')}
                        disabled={resolvingApprovalId === approval.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-rose-950 hover:text-rose-300 border border-slate-700 hover:border-rose-700 text-slate-300 transition-all disabled:opacity-50"
                      >
                        Reject
                      </button>

                      <button
                        id={`approve-btn-${approval.id}`}
                        onClick={() => handleResolveApproval(approval.id, 'approved', 'Authorized by Founder in Mission Control')}
                        disabled={resolvingApprovalId === approval.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-50"
                      >
                        <ShieldCheck className={`w-4 h-4 ${resolvingApprovalId === approval.id ? 'animate-spin' : ''}`} />
                        <span>{resolvingApprovalId === approval.id ? 'Merging...' : 'Approve & Merge to Production'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Metadata info */}
                  {approval.metadata && (
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 text-slate-300">
                      <div>
                        Target: <span className="text-amber-300">{(approval.metadata.branchName as string) || 'feat/...'}</span> ➔ <span className="text-emerald-400 font-bold">main (Production)</span>
                      </div>
                      {typeof approval.metadata.prUrl === 'string' && (
                        <a
                          href={approval.metadata.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
                        >
                          <span>Inspect PR {typeof approval.metadata.prNumber === 'number' ? `#${approval.metadata.prNumber}` : ''} on GitHub</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Execution Concurrency Report */}
        {liveExecutionResult && (
          <div className="rounded-xl border border-cyan-700 bg-cyan-950/40 p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Mission Concurrent Execution Finished: &ldquo;{liveExecutionResult.missionTitle}&rdquo; ({liveExecutionResult.totalDurationMs}ms)</span>
              </div>
              <button
                onClick={() => setLiveExecutionResult(null)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
              <div>Waves: <strong className="text-cyan-400">{liveExecutionResult.wavesExecuted}</strong></div>
              <div>Tasks Completed: <strong className="text-emerald-400">{liveExecutionResult.completedTasksCount} / {liveExecutionResult.totalTasks}</strong></div>
              <div>Max Concurrent Tasks: <strong className="text-purple-400">{liveExecutionResult.maxConcurrentTasksRan}</strong></div>
              <div>Final Status: <strong className="text-emerald-400 uppercase">{liveExecutionResult.status}</strong></div>
            </div>
          </div>
        )}

        {/* Compounded Knowledge Banner Notice */}
        {compoundedNotice && (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/50 p-4 space-y-2 transition-all animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Pass 2 Quality Gate Passed: Knowledge Compounded to /company</span>
              </div>
              <button
                onClick={() => setCompoundedNotice(null)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div>
                <h4 className="text-xs font-bold text-white">{compoundedNotice.docTitle}</h4>
                <p className="text-[11px] text-slate-400 font-mono">
                  Path: <span className="text-cyan-300">{compoundedNotice.filePath}</span> • Score: {Math.round(compoundedNotice.score * 100)}% • Mission: {compoundedNotice.missionTitle}
                </p>
              </div>
              <Link
                href="/knowledge"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1 self-start sm:self-auto"
              >
                <span>Inspect in Knowledge Base</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Live Notification after Mission Creation */}
        {createdNotice && (
          <div className="rounded-xl border border-cyan-800/80 bg-slate-900 p-4 space-y-3 transition-all animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Mission Created &amp; Lead Task Delegated to {createdNotice.assignedAgent}</span>
              </div>
              {createdNotice.taskId && (
                <button
                  onClick={() => {
                    if (createdNotice.assignedAgent.includes('CEO') || createdNotice.assignedAgent.includes('Orchestrator')) {
                      if (createdNotice.missionId) {
                        handleExecuteMissionConcurrently(createdNotice.missionId);
                      }
                    } else if (createdNotice.assignedAgent.includes('Development') || createdNotice.assignedAgent.includes('Dev')) {
                      handleExecuteDevWorker(createdNotice.taskId!);
                    } else if (createdNotice.assignedAgent.includes('Quality') || createdNotice.assignedAgent.includes('QA')) {
                      handleExecuteQualityWorker(createdNotice.taskId!);
                    } else {
                      handleExecuteGrowthWorker(createdNotice.taskId!);
                    }
                  }}
                  disabled={executingTaskId === createdNotice.taskId || executingMissionConcurrentlyId === createdNotice.missionId}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${(executingTaskId === createdNotice.taskId || executingMissionConcurrentlyId === createdNotice.missionId) ? 'animate-spin' : ''}`} />
                  <span>{(executingTaskId === createdNotice.taskId || executingMissionConcurrentlyId === createdNotice.missionId) ? 'Worker Executing...' : 'Execute Worker'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
              <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Mission</span>
                <span className="text-slate-200 font-medium truncate block">{createdNotice.missionTitle}</span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Assigned Agent</span>
                <span className="text-cyan-300 font-mono font-medium">{createdNotice.assignedAgent}</span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Delegated Task</span>
                <span className="text-cyan-300 font-mono font-semibold uppercase">{createdNotice.taskStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Form: Create Mission */}
        <section id="create-mission-card" className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Deploy New Mission</h2>
              <p className="text-xs text-slate-400">Decompose goal into tasks and delegate to Growth or Development Agent</p>
            </div>
          </div>

          <form onSubmit={handleCreateMission} className="space-y-4">
            {formError && (
              <div className="rounded-lg bg-rose-950/80 border border-rose-800 p-3 text-xs text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label htmlFor="mission-title-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mission Title
              </label>
              <input
                id="mission-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Build webhook notification system or Research developer OS competitors"
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="mission-objective-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Objective &amp; Scope
              </label>
              <textarea
                id="mission-objective-input"
                rows={2}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Specify the deliverable (PRD to scaffold, research questions, or feature interfaces)..."
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Priority Level:</label>
                <div className="flex items-center gap-1">
                  {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 px-2.5 py-2 rounded-lg text-xs font-mono capitalize transition-all ${
                        priority === p
                           ? 'bg-cyan-600 text-white font-semibold'
                          : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                id="submit-mission-btn"
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white shadow-lg shadow-cyan-600/25 transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Decomposing &amp; Delegating...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Create &amp; Delegate Mission</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Section: Executive Multi-Model Token Compute & LLM Cost */}
        {(() => {
          const totalCostUsd = missions.reduce((sum, m) => sum + (m.costUsd || 0), 0);
          const totalCostPhp = missions.reduce((sum, m) => sum + (m.costPhp || 0), 0);
          const totalTokens = missions.reduce((sum, m) => sum + (m.totalTokens || ((m.totalTokensInput || 0) + (m.totalTokensOutput || 0))), 0);
          const totalInputTokens = missions.reduce((sum, m) => sum + (m.totalTokensInput || 0), 0);
          const totalOutputTokens = missions.reduce((sum, m) => sum + (m.totalTokensOutput || 0), 0);

          // Calculate Pro vs Flash tier breakdowns
          let proCalls = 0;
          let proCostUsd = 0;
          let flashCalls = 0;
          let flashCostUsd = 0;

          missions.forEach((m) => {
            if (m.modelUsageBreakdown) {
              Object.values(m.modelUsageBreakdown).forEach((b) => {
                if (b.pricingTier === 'pro') {
                  proCalls += b.callsCount || 1;
                  proCostUsd += b.costUsd || 0;
                } else {
                  flashCalls += b.callsCount || 1;
                  flashCostUsd += b.costUsd || 0;
                }
              });
            } else if (m.costUsd) {
              // Fallback
              flashCostUsd += m.costUsd;
              flashCalls += 1;
            }
          });

          return (
            <section id="token-compute-section" className="space-y-3">
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/90 to-cyan-950/40 border border-purple-900/60 shadow-xl backdrop-blur space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-950 border border-purple-800 text-purple-400 shrink-0 mt-0.5 sm:mt-0 shadow-sm">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                          Executive Multi-Model Token Compute &amp; Cost
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/90 text-purple-300 border border-purple-700/80 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          Pro: Gemini 3.1 Pro Preview
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 font-semibold flex items-center gap-1">
                          <Zap className="w-3 h-3 text-cyan-400" />
                          Flash: Gemini 3.7 Flash
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-sans">
                        Real-time compute telemetry across CEO strategic decomposition (Pro) and specialist tool execution, code scaffolding, and QA audits (Flash).
                      </p>
                    </div>
                  </div>

                  {/* Cumulative Cost Badges */}
                  <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800 shrink-0 self-start lg:self-auto font-mono">
                    <div className="text-right">
                      <div className="text-base sm:text-lg font-bold text-emerald-400 leading-tight">
                        {formatUsd(totalCostUsd)} <span className="text-xs text-slate-400 font-normal">USD</span>
                      </div>
                      <div className="text-xs font-semibold text-teal-300 leading-tight">
                        {formatPhp(totalCostPhp)} <span className="text-[10px] text-slate-500 font-normal">PHP</span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-800" />
                    <div className="text-left text-xs text-slate-300">
                      <div className="font-bold text-white">⚡ {totalTokens.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500 font-sans">1 USD ≈ 58.50 PHP</div>
                    </div>
                  </div>
                </div>

                {/* Sub-Metrics: Input/Output & Tier Distributions */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Prompt (Input)</span>
                    <div className="text-sm font-bold text-slate-200 font-mono">
                      {totalInputTokens.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">tokens</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Candidate (Output)</span>
                    <div className="text-sm font-bold text-cyan-300 font-mono">
                      {totalOutputTokens.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">tokens</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-900/40 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-purple-300 uppercase font-mono">Pro Tier Spend</span>
                      <span className="text-[10px] text-purple-400 font-mono">{proCalls} calls</span>
                    </div>
                    <div className="text-sm font-bold text-purple-200 font-mono">
                      {formatUsd(proCostUsd)} <span className="text-[10px] text-purple-400 font-normal">({formatPhp(proCostUsd * 58.5)})</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-900/40 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-cyan-300 uppercase font-mono">Flash Tier Spend</span>
                      <span className="text-[10px] text-cyan-400 font-mono">{flashCalls} calls</span>
                    </div>
                    <div className="text-sm font-bold text-cyan-200 font-mono">
                      {formatUsd(flashCostUsd)} <span className="text-[10px] text-cyan-400 font-normal">({formatPhp(flashCostUsd * 58.5)})</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Section: Generated Artifacts & Quick Actions */}
        <section id="artifacts-section" className="space-y-4">
          {/* Executive Artifacts Summary Widget */}
          {(() => {
            const totalArtifacts = artifacts.length;
            const docsCount = artifacts.filter(a => a.type === 'document' || a.type === 'prd' || a.type === 'spec' || a.type === 'research_report').length;
            const codeCount = artifacts.filter(a => a.type === 'code' || a.type === 'architecture').length;
            const mediaCount = artifacts.filter(a => a.type === 'presentation' || a.type === 'image' || a.type === 'video').length;
            const otherCount = totalArtifacts - (docsCount + codeCount + mediaCount);

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Total Deliverables</span>
                    <Layers className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white font-mono">{totalArtifacts}</span>
                    <span className="text-[11px] text-slate-400">artifacts</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Documents &amp; PRDs</span>
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-emerald-300 font-mono">{docsCount}</span>
                    <span className="text-[11px] text-slate-400">/docs</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Code Modules</span>
                    <Code2 className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-blue-300 font-mono">{codeCount}</span>
                    <span className="text-[11px] text-slate-400">/src</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Decks &amp; Multi-Media</span>
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-purple-300 font-mono">{mediaCount}</span>
                    <span className="text-[11px] text-slate-400">/slides, /assets, /media</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section Bar: Title, Filters & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <button
              id="toggle-artifacts-collapse-btn"
              type="button"
              onClick={() => setArtifactsExpanded(prev => !prev)}
              className="flex items-center gap-2 group hover:opacity-90 transition-all text-left"
              title={artifactsExpanded ? 'Collapse Generated Artifacts section' : 'Expand Generated Artifacts section'}
            >
              <div className="p-1 rounded-md bg-emerald-950/60 border border-emerald-800 text-emerald-400 group-hover:border-emerald-700 transition-colors">
                {artifactsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Mission Deliverables &amp; Artifacts ({artifacts.filter(a => a.status !== 'archived').length} Open)
                </h2>
              </div>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Tabs */}
              <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setArtifactFilter('active')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    artifactFilter === 'active'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Active ({artifacts.filter(a => a.status !== 'archived').length})
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactFilter('approved')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    artifactFilter === 'approved'
                      ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Completed / Approved ({artifacts.filter(a => a.status === 'approved' || a.status === 'completed').length})
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactFilter('pending')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    artifactFilter === 'pending'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Pending ({artifacts.filter(a => a.status !== 'approved' && a.status !== 'completed' && a.status !== 'archived').length})
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactFilter('all')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    artifactFilter === 'all'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({artifacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactFilter('archived')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    artifactFilter === 'archived'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Archived ({artifacts.filter(a => a.status === 'archived').length})
                </button>
              </div>

              {/* Clean Up Inactive Deliverables Button */}
              <button
                type="button"
                id="cleanup-orphaned-deliverables-btn"
                onClick={handleCleanupOrphanedArtifacts}
                disabled={cleaningOrphanedArtifacts}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-950/70 hover:bg-purple-900 border border-purple-800 text-purple-200 hover:text-white transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                title="Archive all deliverables belonging to cancelled or archived missions"
              >
                <Archive className={`w-3 h-3 ${cleaningOrphanedArtifacts ? 'animate-spin' : 'text-purple-400'}`} />
                <span>{cleaningOrphanedArtifacts ? 'Cleaning...' : 'Clean Inactive'}</span>
              </button>

              {/* Batch Close All Open Deliverables Button */}
              {artifacts.filter(a => a.status !== 'archived').length > 0 && (
                <button
                  type="button"
                  id="close-all-deliverables-btn"
                  onClick={handleCloseAllArtifacts}
                  disabled={closingAllArtifacts}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Close and archive all currently open deliverables"
                >
                  <Ban className={`w-3 h-3 ${closingAllArtifacts ? 'animate-spin' : 'text-rose-400'}`} />
                  <span>{closingAllArtifacts ? 'Closing All...' : 'Close All Open'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setArtifactsExpanded(prev => !prev)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1"
              >
                <span>{artifactsExpanded ? 'Collapse' : 'Expand'}</span>
                {artifactsExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Action Notice */}
          {artifactActionNotice && (
            <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-800/80 text-emerald-300 text-xs flex items-center justify-between shadow-sm animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{artifactActionNotice}</span>
              </div>
              <button
                onClick={() => setArtifactActionNotice(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {artifactsExpanded && (() => {
            const filteredArtifacts = artifacts.filter(art => {
              if (artifactFilter === 'active') return art.status !== 'archived';
              if (artifactFilter === 'approved') return art.status === 'approved' || art.status === 'completed';
              if (artifactFilter === 'pending') return art.status !== 'approved' && art.status !== 'completed' && art.status !== 'archived';
              if (artifactFilter === 'archived') return art.status === 'archived';
              return true;
            });

            if (filteredArtifacts.length === 0) {
              return (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-400">
                  {artifactFilter === 'active'
                    ? 'No active open deliverables. All completed deliverables have been archived or closed.'
                    : artifactFilter === 'approved'
                    ? 'No approved or completed deliverables yet. Review and approve pending deliverables or complete missions to add them here.'
                    : artifactFilter === 'pending'
                    ? 'No deliverables pending review. All active deliverables have been approved or completed.'
                    : artifactFilter === 'archived'
                    ? 'No archived deliverables.'
                    : 'No artifacts generated yet. Delegate a mission to produce deliverables.'}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredArtifacts.map((art) => {
                  const isMenuOpen = activeDeliverableMenuArtifactId === art.id;
                  const isGenerating = generatingDeliverable?.artifactId === art.id;
                  const isClosing = closingArtifactId === art.id;
                  const isDeleting = deletingArtifactId === art.id;
                  const isApproving = approvingArtifactId === art.id;
                  const isCompleted = art.status === 'completed';
                  const isApproved = art.status === 'approved' || art.status === 'completed';
                  const isPending = art.status !== 'approved' && art.status !== 'completed' && art.status !== 'archived';
                  const isArchived = art.status === 'archived';
                  
                  // Determine badge styling based on artifact type
                  const typeStyles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
                    code: { bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-800', icon: <Code2 className="w-3 h-3" /> },
                    document: { bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-800', icon: <FileText className="w-3 h-3" /> },
                    presentation: { bg: 'bg-purple-950', text: 'text-purple-300', border: 'border-purple-800', icon: <Presentation className="w-3 h-3" /> },
                    image: { bg: 'bg-cyan-950', text: 'text-cyan-300', border: 'border-cyan-800', icon: <ImageIcon className="w-3 h-3" /> },
                    video: { bg: 'bg-rose-950', text: 'text-rose-300', border: 'border-rose-800', icon: <VideoIcon className="w-3 h-3" /> },
                    research_report: { bg: 'bg-indigo-950', text: 'text-indigo-300', border: 'border-indigo-800', icon: <Sparkles className="w-3 h-3" /> },
                  };
                  const currentStyle = typeStyles[art.type] || { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700', icon: <FileCheck className="w-3 h-3" /> };

                  return (
                    <div
                      key={art.id}
                      className={`p-4 rounded-xl border relative transition-all ${
                        selectedArtifact?.id === art.id
                          ? 'bg-slate-900 border-cyan-500 shadow-md ring-1 ring-cyan-500/20'
                          : isCompleted
                          ? 'bg-slate-900/90 border-emerald-800/80 hover:border-emerald-600'
                          : isApproved
                          ? 'bg-slate-900/80 border-teal-900/60 hover:border-teal-700/80'
                          : isArchived
                          ? 'bg-slate-950/60 border-slate-800/60 opacity-75'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="text-xs font-semibold text-white truncate">{art.title}</h3>
                          {isCompleted && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Completed</span>
                            </span>
                          )}
                          {!isCompleted && art.status === 'approved' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-950 text-teal-300 border border-teal-700 shadow-sm shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-teal-400" />
                              <span>Approved</span>
                            </span>
                          )}
                          {isPending && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              <span>Pending Approval</span>
                            </span>
                          )}
                          {isArchived && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-950 text-purple-300 border border-purple-800 shrink-0">
                              Archived
                            </span>
                          )}
                        </div>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 ${currentStyle.bg} ${currentStyle.text} ${currentStyle.border}`}>
                          {currentStyle.icon}
                          <span>{art.type}</span>
                        </span>
                      </div>

                      {art.projectFilePath && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 mb-2 truncate">
                          <span className="text-slate-500">Path:</span>
                          <span className="truncate">{art.projectFilePath}</span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed font-sans mb-3">
                        {art.content.slice(0, 150)}...
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedArtifact(art)}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>

                          {/* Quick Close / Re-open Button */}
                          <button
                            id={`close-artifact-btn-${art.id}`}
                            onClick={() => handleCloseArtifact(art.id, art.title, isArchived)}
                            disabled={isClosing}
                            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium border transition-colors ${
                              isArchived
                                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-900/60'
                            }`}
                            title={isArchived ? 'Re-open this deliverable' : 'Close and archive this deliverable'}
                          >
                            {isArchived ? (
                              <>
                                <ArchiveRestore className={`w-3 h-3 ${isClosing ? 'animate-spin' : ''}`} />
                                <span>{isClosing ? 'Restoring...' : 'Re-open'}</span>
                              </>
                            ) : (
                              <>
                                <Archive className={`w-3 h-3 ${isClosing ? 'animate-spin' : ''}`} />
                                <span>{isClosing ? 'Closing...' : 'Close'}</span>
                              </>
                            )}
                          </button>

                          {/* Quick Delete Button */}
                          <button
                            id={`delete-artifact-btn-${art.id}`}
                            onClick={() => setDeleteArtifactTarget({ id: art.id, title: art.title })}
                            disabled={isDeleting}
                            className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                            title="Permanently delete deliverable"
                          >
                            <Trash2 className={`w-3 h-3 ${isDeleting ? 'animate-spin' : ''}`} />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 relative">
                          {/* If Pending Approval: Show 1-Tap Approve Button */}
                          {isPending && (
                            <button
                              id={`approve-deliverable-btn-${art.id}`}
                              onClick={() => handleApproveArtifact(art.id, art.title)}
                              disabled={isApproving}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm transition-all disabled:opacity-50"
                              title="Approve deliverable and sync canonical state to Firestore"
                            >
                              <CheckCircle2 className={`w-3 h-3 ${isApproving ? 'animate-spin' : ''}`} />
                              <span>{isApproving ? 'Approving...' : 'Approve'}</span>
                            </button>
                          )}

                          {/* If Approved Deliverable: Show Download direct file button if available */}
                          {isApproved && (
                            <a
                              href={`/api/projects/file?${art.projectFilePath ? `path=${encodeURIComponent(art.projectFilePath)}&` : ''}id=${encodeURIComponent(art.id)}&download=true`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-all shadow-sm"
                              title="Download deliverable file (.docx, .pptx, .svg, .html, .ts)"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download</span>
                            </a>
                          )}

                          {/* Multi-Type Deliverable Generator / Variant Export Dropdown */}
                          <div className="relative">
                            <button
                              id={`generate-deliverable-btn-${art.id}`}
                              onClick={() => setActiveDeliverableMenuArtifactId(isMenuOpen ? null : art.id)}
                              disabled={isGenerating}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 shadow-sm transition-all disabled:opacity-50 ${
                                isApproved
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                  : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white'
                              }`}
                              title={isApproved ? "Generate additional variants / file formats" : "Generate multi-modal deliverable (Code, Document, Slides, Visuals, Video Script)"}
                            >
                              <Sparkles className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                              <span>{isGenerating ? `Generating (${generatingDeliverable?.type})...` : (isApproved ? 'Export / Variant' : 'Generate Deliverable')}</span>
                              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                            </button>

                            {/* Dropdown Menu for 5 deliverable types */}
                            {isMenuOpen && (
                              <div className="absolute right-0 bottom-full mb-1 z-30 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 space-y-1 animate-fadeIn">
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                  {isApproved ? 'Export / Variant Formats' : 'Select Deliverable Target'}
                                </div>
                                <button
                                  onClick={() => handleGenerateDeliverableFromArtifact(art.id, 'code')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-slate-200 hover:bg-blue-950/80 hover:text-blue-300 transition-colors"
                                >
                                  <Code2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <div>
                                    <div className="font-semibold leading-none">TypeScript Source Module</div>
                                    <div className="text-[10px] text-slate-400 font-mono">/src/*.ts &amp; .md (Code &amp; Spec)</div>
                                  </div>
                                </button>

                                <button
                                  onClick={() => handleGenerateDeliverableFromArtifact(art.id, 'document')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-slate-200 hover:bg-emerald-950/80 hover:text-emerald-300 transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <div>
                                    <div className="font-semibold leading-none">Word Document (.docx)</div>
                                    <div className="text-[10px] text-slate-400 font-mono">/docs/*.docx &amp; .md (MS Word &amp; PRD)</div>
                                  </div>
                                </button>

                                <button
                                  onClick={() => handleGenerateDeliverableFromArtifact(art.id, 'presentation')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-slate-200 hover:bg-purple-950/80 hover:text-purple-300 transition-colors"
                                >
                                  <Presentation className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                  <div>
                                    <div className="font-semibold leading-none">PowerPoint Deck (.pptx)</div>
                                    <div className="text-[10px] text-slate-400 font-mono">/slides/*.pptx &amp; .md (Slide Deck)</div>
                                  </div>
                                </button>

                                <button
                                  onClick={() => handleGenerateDeliverableFromArtifact(art.id, 'image')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-slate-200 hover:bg-cyan-950/80 hover:text-cyan-300 transition-colors"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <div>
                                    <div className="font-semibold leading-none">Vector Visual Asset (.svg)</div>
                                    <div className="text-[10px] text-slate-400 font-mono">/assets/*.svg &amp; .md (Vector Graphic)</div>
                                  </div>
                                </button>

                                <button
                                  onClick={() => handleGenerateDeliverableFromArtifact(art.id, 'video')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-slate-200 hover:bg-rose-950/80 hover:text-rose-300 transition-colors"
                                >
                                  <VideoIcon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                  <div>
                                    <div className="font-semibold leading-none">Interactive Video (.html)</div>
                                    <div className="text-[10px] text-slate-400 font-mono">/media/*.html &amp; .md (Player &amp; Script)</div>
                                  </div>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Pass 2 LLM Usability Check */}
                          <button
                            id={`evaluate-btn-${art.id}`}
                            onClick={() => handleEvaluateAndCompound(art.id)}
                            disabled={evaluatingArtifactId === art.id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white shadow-sm transition-all disabled:opacity-50"
                            title="Run Pass 2: LLM usability check and write draft doc referencing the mission"
                          >
                            <Cpu className={`w-3 h-3 ${evaluatingArtifactId === art.id ? 'animate-spin' : ''}`} />
                            <span>{evaluatingArtifactId === art.id ? 'Evaluating...' : 'LLM Check'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* Modal / Inspector for Selected Artifact */}
        {selectedArtifact && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-cyan-800 bg-slate-900 shadow-2xl overflow-hidden animate-fadeIn">
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg border ${
                    selectedArtifact.type === 'code'
                      ? 'bg-blue-950 border-blue-800 text-blue-400'
                      : selectedArtifact.type === 'presentation'
                      ? 'bg-purple-950 border-purple-800 text-purple-400'
                      : selectedArtifact.type === 'image'
                      ? 'bg-cyan-950 border-cyan-800 text-cyan-400'
                      : selectedArtifact.type === 'video'
                      ? 'bg-rose-950 border-rose-800 text-rose-400'
                      : 'bg-emerald-950 border-emerald-800 text-emerald-400'
                  }`}>
                    {selectedArtifact.type === 'code' ? (
                      <Code2 className="w-4 h-4" />
                    ) : selectedArtifact.type === 'presentation' ? (
                      <Presentation className="w-4 h-4" />
                    ) : selectedArtifact.type === 'image' ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : selectedArtifact.type === 'video' ? (
                      <VideoIcon className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{selectedArtifact.title}</h3>
                      {selectedArtifact.status === 'completed' ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Completed</span>
                        </span>
                      ) : selectedArtifact.status === 'approved' ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-950 text-teal-300 border border-teal-700 shadow-sm shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-teal-400" />
                          <span>Approved</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span>Pending Approval</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-slate-400">
                      Artifact ID: {selectedArtifact.id} • Type: {selectedArtifact.type} • Version: {selectedArtifact.version}
                      {selectedArtifact.approvedBy && ` • ${selectedArtifact.approvedBy}`}
                      {selectedArtifact.projectFilePath && ` • Path: ${selectedArtifact.projectFilePath}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedArtifact.status !== 'approved' && selectedArtifact.status !== 'completed' && selectedArtifact.status !== 'archived' && (
                    <button
                      onClick={() => handleApproveArtifact(selectedArtifact.id, selectedArtifact.title)}
                      disabled={approvingArtifactId === selectedArtifact.id}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-50"
                      title="Approve deliverable and store canonically in Firestore & filesystem"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${approvingArtifactId === selectedArtifact.id ? 'animate-spin' : ''}`} />
                      <span>{approvingArtifactId === selectedArtifact.id ? 'Approving...' : 'Approve Deliverable'}</span>
                    </button>
                  )}
                  <a
                    href={`/api/projects/file?${selectedArtifact.projectFilePath ? `path=${encodeURIComponent(selectedArtifact.projectFilePath)}&` : ''}id=${encodeURIComponent(selectedArtifact.id)}&download=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white shadow transition-all"
                    title="Download the deliverable file (.docx, .pptx, .svg, .html, .ts)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Deliverable</span>
                  </a>
                  <button
                    onClick={() => setSelectedArtifact(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Artifact Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-200 leading-relaxed font-sans">
                {selectedArtifact.projectFilePath && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-2 truncate">
                      <FolderGit2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-[11px] font-mono text-slate-300 truncate">
                        {selectedArtifact.projectFilePath}
                      </span>
                    </div>
                    <a
                      href={`/api/projects/file?path=${encodeURIComponent(selectedArtifact.projectFilePath)}&id=${encodeURIComponent(selectedArtifact.id)}&download=false`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline shrink-0 ml-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Raw Stream</span>
                    </a>
                  </div>
                )}

                <div className="prose prose-invert max-w-none bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans text-xs">
                  {selectedArtifact.content}
                </div>
              </div>

              {/* Footer with Multi-Modal Deliverable Toolbar */}
              <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-400 mr-1 hidden sm:inline">
                    {selectedArtifact.status === 'approved' ? 'Export Formats:' : 'Generate:'}
                  </span>
                  
                  {/* Code Button */}
                  <button
                    onClick={() => handleGenerateDeliverableFromArtifact(selectedArtifact.id, 'code')}
                    disabled={generatingDeliverable?.artifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-700 shadow-sm transition-all disabled:opacity-50"
                    title="Generate TypeScript code module into /src"
                  >
                    <Code2 className={`w-3 h-3 ${generatingDeliverable?.artifactId === selectedArtifact.id && generatingDeliverable?.type === 'code' ? 'animate-spin' : ''}`} />
                    <span>Code (/src)</span>
                  </button>

                  {/* Document Button */}
                  <button
                    onClick={() => handleGenerateDeliverableFromArtifact(selectedArtifact.id, 'document')}
                    disabled={generatingDeliverable?.artifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 shadow-sm transition-all disabled:opacity-50"
                    title="Generate executive document / PRD into /docs"
                  >
                    <FileText className={`w-3 h-3 ${generatingDeliverable?.artifactId === selectedArtifact.id && generatingDeliverable?.type === 'document' ? 'animate-spin' : ''}`} />
                    <span>Doc (/docs)</span>
                  </button>

                  {/* Presentation Button */}
                  <button
                    onClick={() => handleGenerateDeliverableFromArtifact(selectedArtifact.id, 'presentation')}
                    disabled={generatingDeliverable?.artifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 shadow-sm transition-all disabled:opacity-50"
                    title="Generate pitch deck and slides into /slides"
                  >
                    <Presentation className={`w-3 h-3 ${generatingDeliverable?.artifactId === selectedArtifact.id && generatingDeliverable?.type === 'presentation' ? 'animate-spin' : ''}`} />
                    <span>Slides (/slides)</span>
                  </button>

                  {/* Visual Asset Button */}
                  <button
                    onClick={() => handleGenerateDeliverableFromArtifact(selectedArtifact.id, 'image')}
                    disabled={generatingDeliverable?.artifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700 shadow-sm transition-all disabled:opacity-50"
                    title="Generate visual assets and vector SVG into /assets"
                  >
                    <ImageIcon className={`w-3 h-3 ${generatingDeliverable?.artifactId === selectedArtifact.id && generatingDeliverable?.type === 'image' ? 'animate-spin' : ''}`} />
                    <span>Visual (/assets)</span>
                  </button>

                  {/* Video Script Button */}
                  <button
                    onClick={() => handleGenerateDeliverableFromArtifact(selectedArtifact.id, 'video')}
                    disabled={generatingDeliverable?.artifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700 shadow-sm transition-all disabled:opacity-50"
                    title="Generate video storyboard & script into /media"
                  >
                    <VideoIcon className={`w-3 h-3 ${generatingDeliverable?.artifactId === selectedArtifact.id && generatingDeliverable?.type === 'video' ? 'animate-spin' : ''}`} />
                    <span>Video (/media)</span>
                  </button>

                  {/* Compound to Knowledge */}
                  <button
                    onClick={() => handleEvaluateAndCompound(selectedArtifact.id)}
                    disabled={evaluatingArtifactId === selectedArtifact.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 shadow-sm transition-all disabled:opacity-50"
                  >
                    <Cpu className={`w-3 h-3 ${evaluatingArtifactId === selectedArtifact.id ? 'animate-spin' : ''}`} />
                    <span>Compound (§8)</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCloseArtifact(selectedArtifact.id, selectedArtifact.title, selectedArtifact.status === 'archived')}
                    disabled={closingArtifactId === selectedArtifact.id}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selectedArtifact.status === 'archived'
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-300 hover:bg-emerald-900'
                        : 'bg-slate-900 border-rose-900/60 text-rose-300 hover:bg-rose-950/60'
                    }`}
                  >
                    {selectedArtifact.status === 'archived' ? (
                      <>
                        <ArchiveRestore className={`w-3.5 h-3.5 ${closingArtifactId === selectedArtifact.id ? 'animate-spin' : ''}`} />
                        <span>{closingArtifactId === selectedArtifact.id ? 'Restoring...' : 'Re-open Deliverable'}</span>
                      </>
                    ) : (
                      <>
                        <Archive className={`w-3.5 h-3.5 ${closingArtifactId === selectedArtifact.id ? 'animate-spin' : ''}`} />
                        <span>{closingArtifactId === selectedArtifact.id ? 'Closing...' : 'Close Deliverable'}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setDeleteArtifactTarget({ id: selectedArtifact.id, title: selectedArtifact.title })}
                    disabled={deletingArtifactId === selectedArtifact.id}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800 transition-all"
                    title="Permanently delete deliverable"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${deletingArtifactId === selectedArtifact.id ? 'animate-spin' : ''}`} />
                  </button>

                  <button
                    onClick={() => setSelectedArtifact(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard: Active Missions & Dependency-Ordered Tasks */}
        <section id="missions-dashboard-section" className="space-y-4">
          {/* Executive Dashboard Metrics Header */}
          {(() => {
            const metrics = computeDashboardMetrics(missions);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium">Active Missions</span>
                      <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white font-mono">{metrics.activeMissions}</span>
                      <span className="text-[11px] text-slate-400">of {metrics.totalMissions} total</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium">Tasks In Progress</span>
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-cyan-300 font-mono">{metrics.inProgressTasks}</span>
                      <span className="text-[11px] text-slate-400">of {metrics.totalTasks} tasks</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium">Completed Tasks</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-emerald-400 font-mono">{metrics.completedTasks}</span>
                      <span className="text-[11px] text-emerald-400 font-semibold font-mono">{metrics.completionPercentage}%</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium">Gated / Blocked</span>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-amber-300 font-mono">{metrics.blockedTasks}</span>
                      <span className="text-[11px] text-slate-400">waiting</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mission Pull Request Banner Notice */}
          {missionPrNotice && (
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800 shadow-md flex items-start justify-between gap-3 animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-900/60 border border-blue-700 text-blue-400 shrink-0 mt-0.5">
                  <GitPullRequest className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Mission Pull Request Opened on GitHub</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900 text-blue-200 font-semibold">
                      PR #{missionPrNotice.prNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Bundled all project deliverables for <strong className="text-white">&quot;{missionPrNotice.missionTitle}&quot;</strong> on branch <code className="text-cyan-300 font-mono">{missionPrNotice.branchName}</code>.
                  </p>
                  {missionPrNotice.bundledFiles && missionPrNotice.bundledFiles.length > 0 && (
                    <div className="pt-1 flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-slate-400">
                      <span className="text-slate-500">Bundled files:</span>
                      {missionPrNotice.bundledFiles.map((file, idx) => (
                        <span key={idx} className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300 text-[10px]">
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 flex items-center gap-2">
                    <a
                      href={missionPrNotice.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View Pull Request on GitHub</span>
                    </a>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMissionPrNotice(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Section Bar: Title, Filter Tabs, Collapse/Expand & Real Data Indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <button
              id="toggle-missions-collapse-btn"
              type="button"
              onClick={() => setMissionsExpanded(prev => !prev)}
              className="flex items-center gap-2 text-left group hover:opacity-90 transition-all"
              title={missionsExpanded ? 'Collapse Missions & Dependency Task Pipeline' : 'Expand Missions & Dependency Task Pipeline'}
            >
              <div className="p-1 rounded-md bg-cyan-950/60 border border-cyan-800 text-cyan-400 group-hover:border-cyan-700 transition-colors">
                {missionsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Missions &amp; Dependency Task Pipeline ({missions.length})
                </h2>
              </div>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Pills (visible when expanded) */}
              {missionsExpanded && (
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setMissionFilter('active')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      missionFilter === 'active'
                        ? 'bg-emerald-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Active ({missions.filter(m => m.status === 'active').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMissionFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      missionFilter === 'all'
                        ? 'bg-cyan-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({missions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMissionFilter('queued')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      missionFilter === 'queued'
                        ? 'bg-amber-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Queued ({missions.filter(m => m.status === 'queued' || m.status === 'draft').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMissionFilter('completed')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      missionFilter === 'completed'
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Completed ({missions.filter(m => m.status === 'completed').length})
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono text-[11px]">Live Firestore</span>
              </div>

              <Link
                href="/missions/archive"
                id="missions-section-archive-link"
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-950/60 border border-purple-800/80 text-purple-300 hover:bg-purple-900 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                title="View Central Mission Archive and unarchive / restore missions"
              >
                <Archive className="w-3.5 h-3.5 text-purple-400" />
                <span>Archive{totalArchivedCount > 0 ? ` (${totalArchivedCount})` : ''}</span>
              </Link>

              <button
                id="consolidate-duplicates-btn"
                type="button"
                onClick={handleConsolidateDuplicateMissions}
                disabled={consolidatingMissions || loading}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 hover:bg-cyan-900 hover:text-white hover:border-cyan-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Orchestrator Agent auto-consolidation of duplicate missions with identical Title, Objective & Scope"
              >
                <GitMerge className={`w-3.5 h-3.5 ${consolidatingMissions ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                <span>{consolidatingMissions ? 'Consolidating...' : 'Auto-Consolidate'}</span>
              </button>

              <button
                type="button"
                onClick={() => setMissionsExpanded(prev => !prev)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1"
              >
                <span>{missionsExpanded ? 'Collapse' : 'Expand'}</span>
                {missionsExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Mission Action / Consolidation Notice Banner */}
          {missionActionNotice && (
            <div className="rounded-xl border border-cyan-800/80 bg-cyan-950/40 p-3 flex items-center justify-between text-xs text-cyan-200 shadow-sm animate-fadeIn">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{missionActionNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setMissionActionNotice(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {missionsExpanded && (
            loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Fetching real missions and dependency tasks from Firestore...</p>
            </div>
          ) : (() => {
            const filteredMissions = missions.filter(m => {
              if (missionFilter === 'active') return m.status === 'active';
              if (missionFilter === 'queued') return m.status === 'queued' || m.status === 'draft';
              if (missionFilter === 'completed') return m.status === 'completed';
              return true;
            });

            if (filteredMissions.length === 0) {
              return (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-300">
                    No missions found for filter &quot;{missionFilter}&quot;
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Create a new mission above or switch filters to view your complete pipeline.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {filteredMissions.map((mission) => {
                  const tasks = mission.tasks || [];
                  const orderedTasks = sortTasksByDependencyOrder(tasks);
                  const completedCount = tasks.filter(t => t.status === 'completed').length;
                  const totalCount = tasks.length;
                  const percentDone = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                  const isMissionRunning = executingMissionConcurrentlyId === mission.id || (Boolean(executingTaskId) && tasks.some(t => t.id === executingTaskId));
                  const runningTask = tasks.find(t => t.id === executingTaskId);

                  return (
                    <div
                      key={mission.id}
                      id={`mission-card-${mission.id}`}
                      className={`rounded-xl border p-4 sm:p-5 space-y-3.5 transition-all shadow-sm ${
                        isMissionRunning
                          ? 'border-cyan-500/80 bg-slate-900/90 ring-1 ring-cyan-500/30 shadow-[0_0_25px_rgba(34,211,238,0.15)]'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      {/* Active Worker Execution Banner */}
                      {isMissionRunning && (
                        <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-500/80 flex items-center justify-between gap-3 text-xs text-cyan-200 animate-pulse shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                          <div className="flex items-center gap-2 min-w-0">
                            <Zap className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                            <span className="font-semibold truncate">
                              {executingMissionConcurrentlyId === mission.id
                                ? 'CEO Orchestrator running parallel dependency waves...'
                                : `Worker active on Step ${runningTask?.stepNumber || ''}: "${runningTask?.title || 'Processing task'}"`}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-900 border border-cyan-400 text-cyan-200 uppercase shrink-0">
                            Worker Active
                          </span>
                        </div>
                      )}
                      {/* Mission Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-white tracking-tight">{mission.title}</h3>
                            {mission.type === 'side_quest' && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-950/60 border border-violet-800 text-violet-300 uppercase font-semibold">
                                SIDE QUEST
                              </span>
                            )}
                            {getStatusBadge(mission.status)}
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 uppercase font-semibold">
                              {mission.priority}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                              ID: {mission.id.slice(0, 8)}
                            </span>
                            {mission.projectFolder && (
                              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800 px-2 py-0.5 rounded flex items-center gap-1">
                                <FolderGit2 className="w-2.5 h-2.5" />
                                <span>projects/{mission.projectFolder}/</span>
                              </span>
                            )}
                            {mission.prNumber && (
                              <a
                                href={mission.prUrl || `https://github.com/froilandzngarcia/neptena-os/pull/${mission.prNumber}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-mono text-purple-300 bg-purple-950/60 border border-purple-800 hover:bg-purple-900 px-2 py-0.5 rounded flex items-center gap-1 transition-all"
                                title="View consolidated Mission Pull Request on GitHub"
                              >
                                <GitPullRequest className="w-2.5 h-2.5" />
                                <span>PR #{mission.prNumber} ({mission.prStatus || 'open'})</span>
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
                            {mission.objective}
                          </p>

                          {/* Token & LLM Cost Counter Badge */}
                          <div className="pt-1">
                            <MissionCostCounter
                              costUsd={mission.costUsd}
                              costPhp={mission.costPhp}
                              totalTokensInput={mission.totalTokensInput}
                              totalTokensOutput={mission.totalTokensOutput}
                              totalTokens={mission.totalTokens}
                              llmCallsCount={mission.llmCallsCount}
                              modelsUsed={mission.modelsUsed}
                              modelUsageBreakdown={mission.modelUsageBreakdown}
                              compact={true}
                            />
                          </div>
                        </div>

                        <div className="shrink-0 flex sm:flex-col sm:items-end justify-between gap-2 text-[11px] text-slate-400">
                          <div className="flex items-center gap-2">
                            <span>Lead Agent: <strong className="text-cyan-300 font-mono">CEO Orchestrator</strong></span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {mission.createdAt ? new Date(mission.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              id={`create-mission-pr-btn-${mission.id}`}
                              onClick={() => handleCreateMissionPR(mission.id)}
                              disabled={creatingPrMissionId === mission.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600/30 hover:bg-blue-600 border border-blue-500/60 text-blue-200 hover:text-white transition-all disabled:opacity-40"
                              title="Bundle all deliverables into a consolidated GitHub Pull Request"
                            >
                              <GitPullRequest className={`w-3 h-3 ${creatingPrMissionId === mission.id ? 'animate-spin text-blue-300' : ''}`} />
                              <span>{creatingPrMissionId === mission.id ? 'Creating PR...' : mission.prNumber ? `Update PR #${mission.prNumber}` : 'Create Mission PR'}</span>
                            </button>

                            <button
                              id={`execute-concurrently-btn-${mission.id}`}
                              onClick={() => handleExecuteMissionConcurrently(mission.id)}
                              disabled={executingMissionConcurrentlyId === mission.id || mission.status === 'completed'}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-600/30 hover:bg-purple-600 border border-purple-500/60 text-purple-200 hover:text-white transition-all disabled:opacity-40"
                              title="Execute all tasks in parallel dependency waves"
                            >
                              <GitFork className={`w-3 h-3 ${executingMissionConcurrentlyId === mission.id ? 'animate-spin text-purple-300' : ''}`} />
                              <span>{executingMissionConcurrentlyId === mission.id ? 'Executing Waves...' : 'Run Parallel Waves'}</span>
                            </button>

                            <button
                              id={`direct-req-btn-${mission.id}`}
                              onClick={() => handleOpenDirectRequestModal(mission)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/60 text-emerald-200 hover:text-white transition-all"
                              title="Send synchronous agent request to Mission Control (Re-prioritize, Ask Output, Flag Blocker)"
                            >
                              <Radio className="w-3 h-3 text-emerald-300" />
                              <span>Agent Request</span>
                            </button>

                            <button
                              id={`archive-mission-btn-${mission.id}`}
                              onClick={() => handleOpenArchiveModal(mission)}
                              disabled={archivingMissionId === mission.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-950/70 hover:bg-purple-900 border border-purple-800/80 text-purple-300 hover:text-white transition-all disabled:opacity-40"
                              title="Move this mission and its associated deliverables to the central archive"
                            >
                              <Archive className={`w-3 h-3 ${archivingMissionId === mission.id ? 'animate-spin text-purple-300' : 'text-purple-400'}`} />
                              <span>{archivingMissionId === mission.id ? 'Archiving...' : 'Archive'}</span>
                            </button>

                            {mission.status !== 'completed' && mission.status !== 'cancelled' && (
                              <>
                                <button
                                  id={`complete-mission-btn-${mission.id}`}
                                  onClick={() => handleCompleteMission(mission.id)}
                                  disabled={completingMissionId === mission.id}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 hover:text-white transition-all disabled:opacity-40"
                                  title="Mark this mission as fully completed"
                                >
                                  <CheckCircle className={`w-3 h-3 ${completingMissionId === mission.id ? 'animate-spin' : 'text-emerald-400'}`} />
                                  <span>{completingMissionId === mission.id ? 'Completing...' : 'Complete'}</span>
                                </button>
                                <button
                                  id={`cancel-mission-btn-${mission.id}`}
                                  onClick={() => handleOpenCancelModal(mission)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 hover:text-white transition-all"
                                  title="Cancel this mission and route directly to archive"
                                >
                                  <Ban className="w-3 h-3 text-rose-400" />
                                  <span>Cancel</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar & Summary */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Execution Progress ({completedCount}/{totalCount} Steps)</span>
                          </span>
                          <span className="text-emerald-400 font-semibold">{percentDone}% Complete</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${percentDone}%` }}
                          />
                        </div>
                      </div>

                      {/* Dependency Graph & Task Execution Flow */}
                      {orderedTasks.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80">
                          <TaskDependencyGraph
                            tasks={mission.tasks || []}
                            missionStatus={mission.status}
                            missionTitle={mission.title}
                            missionId={mission.id}
                            defaultView="graph"
                            isMissionExecutingConcurrently={executingMissionConcurrentlyId === mission.id}
                            onDelegateTask={handleDelegateTask}
                            onUpdateTaskStatus={handleUpdateTaskStatus}
                            onExecuteWorker={(task) => {
                              if (task.assignedTo === 'agent-development' || task.assignedTo.includes('dev')) {
                                handleExecuteDevWorker(task.id);
                              } else if (task.assignedTo === 'agent-quality' || task.assignedTo.includes('quality') || task.assignedTo.includes('qa')) {
                                handleExecuteQualityWorker(task.id);
                              } else if (task.assignedTo === 'agent-ceo' || task.assignedTo.includes('ceo')) {
                                handleExecuteMissionConcurrently(mission.id);
                              } else {
                                handleExecuteGrowthWorker(task.id);
                              }
                            }}
                            onRequestMergePR={(task) => {
                              handleRequestMergePR(mission.id, 1, `feat/mission-${mission.id.slice(0, 8)}`, task.id);
                            }}
                            delegatingTaskId={delegatingTaskId}
                            updatingTaskId={updatingTaskId}
                            executingTaskId={executingTaskId}
                            requestingMergeMissionId={requestingMergeMissionId}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
        </section>

        {/* Activity Stream Section (Direct Agent Requests & Decisions Audit) */}
        <section id="activity-stream-section" className="space-y-4 pt-4 border-t border-slate-800/80">
          {/* Executive Activity Stream Summary Widget */}
          {(() => {
            const totalActivities = activities.length;
            const directRequests = activities.filter(a => 
              a.action?.includes('request') || 
              a.action?.includes('re_prioritize') || 
              a.action?.includes('ask_agent_output') || 
              a.action?.includes('flag_blocker')
            ).length;
            const autonomousSteps = totalActivities - directRequests;
            const autonomousPct = totalActivities > 0 ? Math.round((autonomousSteps / totalActivities) * 100) : 100;
            const uniqueAgents = new Set(activities.map(a => a.agentId).filter(Boolean)).size;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Logged Activities</span>
                    <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white font-mono">{totalActivities}</span>
                    <span className="text-[11px] text-slate-400">total events</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Direct Requests</span>
                    <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-cyan-300 font-mono">{directRequests}</span>
                    <span className="text-[11px] text-slate-400">of {totalActivities} total</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Autonomous Steps</span>
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-emerald-400 font-mono">{autonomousSteps}</span>
                    <span className="text-[11px] text-emerald-400 font-semibold font-mono">{autonomousPct}%</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium">Active Agents</span>
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-amber-300 font-mono">{uniqueAgents}</span>
                    <span className="text-[11px] text-slate-400">participating</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section Bar: Title, Action Count & Collapse/Expand Button */}
          <div className="flex items-center justify-between pt-1">
            <button
              id="toggle-activity-stream-collapse-btn"
              type="button"
              onClick={() => setActivityStreamExpanded(prev => !prev)}
              className="flex items-center gap-2 group hover:opacity-90 transition-all text-left"
              title={activityStreamExpanded ? 'Collapse Activity Stream section' : 'Expand Activity Stream section'}
            >
              <div className="p-1 rounded-md bg-cyan-950/60 border border-cyan-800 text-cyan-400 group-hover:border-cyan-700 transition-colors">
                {activityStreamExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
                  Mission Control Activity Stream &amp; Direct Requests Log
                </h2>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                {activities.length} Recorded Action{activities.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setActivityStreamExpanded(prev => !prev)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1"
              >
                <span>{activityStreamExpanded ? 'Collapse' : 'Expand'}</span>
                {activityStreamExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          </div>

          {activityStreamExpanded && (
            activities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-400">
                No activity logs recorded yet. Use &ldquo;Direct Requests&rdquo; test or trigger an Agent Request on any mission.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 divide-y divide-slate-800/60 overflow-hidden max-h-96 overflow-y-auto">
                {activities.map((act) => (
                  <div key={act.id} className="p-3.5 hover:bg-slate-900/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {act.action}
                        </span>
                        <span className="font-semibold text-white">{act.details?.reason as string || act.details?.title as string || 'Autonomous Action'}</span>
                        {typeof act.details?.status === 'string' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {act.details.status}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Agent: <span className="text-cyan-300">{act.agentId}</span> • Mission: <span className="text-slate-300">{act.missionId?.slice(0, 8) || 'Global'}</span>
                        {act.taskId && ` • Task: ${act.taskId.slice(0, 8)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-[10px] font-mono text-slate-400 self-end sm:self-auto">
                      {act.createdAt ? new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Recent'}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>

      {/* Global Execution Status Overlay */}
      {(() => {
        const getOverlayStatus = () => {
          let activeTaskName = '';
          if (executingTaskId) {
            for (const m of missions) {
              const t = m.tasks?.find(t => t.id === executingTaskId);
              if (t) {
                activeTaskName = `"${t.title}"`;
                break;
              }
            }
          }

          if (executingMissionConcurrentlyId) return { title: 'Executing Parallel Waves', description: 'The CEO Orchestrator is running multiple tasks concurrently.' };
          if (executingTaskId) return { title: 'Worker Executing', description: `The agent is currently processing ${activeTaskName || 'the task'}.` };
          if (generatingDeliverable) return { title: 'Generating Deliverable', description: `Creating ${generatingDeliverable.type} deliverable for the task.` };
          if (delegatingTaskId) return { title: 'Delegating Task', description: 'Assigning the task to the most appropriate specialist agent.' };
          if (evaluatingArtifactId) return { title: 'Evaluating Quality', description: 'The QA agent is reviewing the artifact against requirements.' };
          if (creatingPrMissionId) return { title: 'Creating Pull Request', description: 'Structuring code changes into a pull request.' };
          if (requestingMergeMissionId) return { title: 'Merging PR', description: 'Attempting to merge the pull request into the main branch.' };
          if (resolvingApprovalId) return { title: 'Resolving Approval', description: 'Processing human feedback and updating the task.' };
          if (consolidatingMissions) return { title: 'Consolidating Missions', description: 'Cleaning up and merging duplicate missions.' };
          if (cleaningOrphanedArtifacts) return { title: 'Cleaning Artifacts', description: 'Removing unassociated or orphaned deliverables.' };
          if (approvingArtifactId) return { title: 'Approving Deliverable', description: 'Finalizing the artifact and marking it approved.' };
          if (closingArtifactId || closingAllArtifacts) return { title: 'Closing Deliverable', description: 'Archiving the selected deliverable(s).' };
          if (deletingArtifactId) return { title: 'Deleting Deliverable', description: 'Permanently removing the deliverable.' };
          if (archivingMissionId) return { title: 'Archiving Mission', description: 'Archiving the mission and all associated tasks.' };
          if (completingMissionId) return { title: 'Completing Mission', description: 'Finalizing the mission as successful.' };
          if (cancellingSubmitting) return { title: 'Cancelling Mission', description: 'Halting the mission and cleaning up tasks.' };
          if (directReqSubmitting) return { title: 'Agent Request Processing', description: 'Communicating directly with the assigned agent.' };
          return null;
        };

        const status = getOverlayStatus();
        if (!status) return null;

        return (
          <div className="fixed bottom-6 right-6 z-[100] animate-fadeIn pointer-events-none">
            <div className="bg-slate-900 border border-cyan-800/80 rounded-2xl shadow-[0_0_40px_-10px_rgba(34,211,238,0.2)] p-4 flex items-center gap-4 max-w-sm pointer-events-auto">
              <div className="relative flex items-center justify-center w-10 h-10 bg-cyan-950 rounded-xl border border-cyan-800/50 shrink-0">
                <Zap className="w-5 h-5 text-cyan-400 animate-spin" />
              </div>
              <div className="space-y-1 pr-2">
                <h3 className="text-sm font-bold text-white leading-tight">{status.title}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-tight">
                  {status.description}
                </p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2 overflow-hidden">
                  <div className="bg-cyan-500 h-1 rounded-full animate-pulse w-full shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Direct Agent Request Modal */}
      {directReqModalOpen && directReqTargetMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-emerald-950/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-400">Direct Agent Request to Mission Control</h3>
                  <p className="text-[11px] text-slate-400">Send instructions or feedback to the assigned agent</p>
                </div>
              </div>
              <button
                onClick={() => setDirectReqModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitDirectRequest} className="p-5 space-y-4 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">
                  Target Mission: <strong className="text-white">{directReqTargetMission.title}</strong> ({directReqTargetMission.id.slice(0, 8)})
                </div>
                {directReqTargetTask && (
                  <div className="text-slate-400 font-mono text-[11px]">
                    Target Task: <strong className="text-cyan-300">{directReqTargetTask.title}</strong>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Originating Agent</label>
                  <select
                    value={directReqAgentId}
                    onChange={(e) => setDirectReqAgentId(e.target.value as 'agent-growth' | 'agent-development' | 'agent-quality')}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="agent-growth">agent-growth (Growth)</option>
                    <option value="agent-development">agent-development (Dev)</option>
                    <option value="agent-quality">agent-quality (Quality QA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Request Type</label>
                  <select
                    value={directReqType}
                    onChange={(e) => setDirectReqType(e.target.value as 're_prioritize' | 'ask_agent_output' | 'flag_blocker')}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="re_prioritize">re_prioritize (Urgency Change)</option>
                    <option value="ask_agent_output">ask_agent_output (Ask peer output)</option>
                    <option value="flag_blocker">flag_blocker (Blocker / Risk)</option>
                  </select>
                </div>
              </div>

              {directReqType === 're_prioritize' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Requested Priority Level</label>
                  <select
                    value={directReqNewPriority}
                    onChange={(e) => setDirectReqNewPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical (Immediate Elevation)</option>
                  </select>
                </div>
              )}

              {directReqType === 'ask_agent_output' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Peer Agent</label>
                  <select
                    value={directReqTargetAgent}
                    onChange={(e) => setDirectReqTargetAgent(e.target.value as 'agent-growth' | 'agent-development' | 'agent-quality')}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="agent-growth">agent-growth (Market &amp; Search docs)</option>
                    <option value="agent-development">agent-development (Code &amp; PR artifacts)</option>
                    <option value="agent-quality">agent-quality (QA Audits &amp; Verification)</option>
                  </select>
                </div>
              )}

              {directReqType === 'flag_blocker' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Blocker Severity</label>
                  <select
                    value={directReqSeverity}
                    onChange={(e) => setDirectReqSeverity(e.target.value as 'blocking' | 'warning')}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="blocking">blocking (Halts execution)</option>
                    <option value="warning">warning (Advisory)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason / Context Payload</label>
                <textarea
                  rows={3}
                  value={directReqReason}
                  onChange={(e) => setDirectReqReason(e.target.value)}
                  placeholder={
                    directReqType === 're_prioritize'
                      ? 'Why does this mission/task require immediate re-prioritization?'
                      : directReqType === 'ask_agent_output'
                      ? 'What artifact/topic query are you requesting from the peer agent?'
                      : 'Describe the blocking condition or missing prerequisite...'
                  }
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Synchronous Response Preview */}
              {directReqResponse && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-emerald-300 font-bold">
                    <span>Synchronous Response from Mission Control:</span>
                    <span className={directReqResponse.success ? 'text-emerald-400' : 'text-rose-400'}>
                      {directReqResponse.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  <p className="text-slate-300">{directReqResponse.actionTaken || directReqResponse.message}</p>
                  {directReqResponse.activityId && (
                    <div className="text-[10px] text-slate-400">
                      Logged Activity Record: <code>{directReqResponse.activityId}</code>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDirectReqModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={directReqSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${directReqSubmitting ? 'animate-spin' : ''}`} />
                  <span>{directReqSubmitting ? 'Transmitting Request...' : 'Send Request &amp; Receive Response'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Human Check Archive Mission Confirmation Modal */}
      {missionToArchive && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-purple-950/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-950 text-purple-300 border border-purple-800 shrink-0">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Human Check: Archive Mission &amp; Deliverables</h3>
                  <p className="text-xs text-slate-400">Cascading archive removes mission and associated deliverables from active board</p>
                </div>
              </div>

              <button
                onClick={() => setMissionToArchive(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Mission to be archived:</span>
                <h4 className="text-sm font-bold text-white">{missionToArchive.title}</h4>
                <p className="text-xs text-slate-400 font-sans line-clamp-2">{missionToArchive.objective}</p>
                <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span>ID: {missionToArchive.id.slice(0, 8)}</span>
                  <span>•</span>
                  <span>Tasks: {missionToArchive.tasks?.length || 0}</span>
                  <span>•</span>
                  <span>Status: {missionToArchive.status}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/60 text-purple-200/90 text-xs space-y-1.5">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  Cascading Archive Confirmation Checklist:
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-purple-200/80 font-sans">
                  <li>Mission will be moved to the <strong>Central Mission Archive</strong>.</li>
                  <li><strong>All associated deliverables &amp; artifacts</strong> for this mission will be automatically archived and removed from the active Mission Control screen.</li>
                  <li>Active agents assigned to this mission will be freed and returned to idle.</li>
                  <li>You can unarchive / restore the mission anytime from the Archive view.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setMissionToArchive(null)}
                  disabled={archivingMissionId === missionToArchive.id}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
                >
                  Keep Mission Active
                </button>
                <button
                  type="button"
                  id="confirm-archive-mission-btn"
                  onClick={handleConfirmArchiveMission}
                  disabled={archivingMissionId === missionToArchive.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  <Archive className={`w-3.5 h-3.5 ${archivingMissionId === missionToArchive.id ? 'animate-spin' : ''}`} />
                  <span>{archivingMissionId === missionToArchive.id ? 'Archiving...' : 'Confirm Archive & Clean Deliverables'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Mission Confirmation Modal */}
      {cancellingMission && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-rose-950/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-950 text-rose-400 border border-rose-800 shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Human Check: Cancel Mission &amp; Archive</h3>
                  <p className="text-xs text-slate-400">Cancelled missions and their deliverables are stopped and removed from active board</p>
                </div>
              </div>

              <button
                onClick={() => setCancellingMission(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Mission to be cancelled:</span>
                <h4 className="text-sm font-bold text-white">{cancellingMission.title}</h4>
                <p className="text-xs text-slate-400 font-sans line-clamp-2">{cancellingMission.objective}</p>
                <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span>ID: {cancellingMission.id.slice(0, 8)}</span>
                  <span>•</span>
                  <span>Tasks: {cancellingMission.tasks?.length || 0}</span>
                  <span>•</span>
                  <span>Status: {cancellingMission.status}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200/90 text-xs space-y-1">
                <span className="font-semibold text-amber-300">Automated Cancellation Pipeline:</span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/80 font-sans">
                  <li>Mission status will be updated to <code>cancelled</code> and moved to archive</li>
                  <li><strong>Associated deliverables and artifacts will also be archived/cancelled and removed from the active Mission Control board</strong></li>
                  <li>Any running or pending tasks will be halted and marked stopped</li>
                  <li>Assigned agents will be safely released to idle state</li>
                </ul>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Cancellation Reason (Optional note for archive records):
                </label>
                <textarea
                  rows={3}
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  placeholder="e.g. Pivoting product priority to mobile app, or superseded by Mission #4..."
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancellingMission(null)}
                  disabled={cancellingSubmitting}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
                >
                  Keep Mission Active
                </button>
                <button
                  type="button"
                  id="confirm-cancel-mission-btn"
                  onClick={handleConfirmCancelMission}
                  disabled={cancellingSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  <Ban className={`w-3.5 h-3.5 ${cancellingSubmitting ? 'animate-spin' : ''}`} />
                  <span>{cancellingSubmitting ? 'Cancelling & Archiving...' : 'Confirm Cancellation'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Close All Open Deliverables Confirmation Modal */}
      {closeAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-rose-950/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-950 text-rose-300 border border-rose-800 shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Human Check: Close All Open Deliverables</h3>
                  <p className="text-xs text-slate-400">Batch archive all currently active deliverables</p>
                </div>
              </div>

              <button
                onClick={() => setCloseAllModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Deliverables to close:</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-mono font-bold text-xs">
                    {artifacts.filter(a => a.status !== 'archived').length} active
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to close and archive all open deliverables? They will be removed from the active deliverables view.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/60 text-purple-200/90 text-xs space-y-1">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5 text-purple-400" />
                  Deliverable Archive Behavior:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-purple-200/80 font-sans">
                  <li>Deliverables will transition to <code>archived</code> status.</li>
                  <li>No files or code artifacts are deleted from your storage.</li>
                  <li>You can review or re-open individual deliverables anytime under the <strong>Archived</strong> filter tab.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCloseAllModalOpen(false)}
                  disabled={closingAllArtifacts}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
                >
                  Keep Deliverables Active
                </button>
                <button
                  type="button"
                  id="confirm-close-all-deliverables-modal-btn"
                  onClick={handleConfirmCloseAllArtifacts}
                  disabled={closingAllArtifacts || artifacts.filter(a => a.status !== 'archived').length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban className={`w-3.5 h-3.5 ${closingAllArtifacts ? 'animate-spin' : ''}`} />
                  <span>{closingAllArtifacts ? 'Closing All Deliverables...' : `Confirm Close All (${artifacts.filter(a => a.status !== 'archived').length})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Deliverable Confirmation Modal */}
      {deleteArtifactTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-rose-950/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-950 text-rose-300 border border-rose-800 shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Delete Deliverable</h3>
                  <p className="text-xs text-slate-400">Permanent deletion of deliverable entity</p>
                </div>
              </div>

              <button
                onClick={() => setDeleteArtifactTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">Deliverable:</span>
                <h4 className="text-sm font-bold text-white">{deleteArtifactTarget.title}</h4>
                <span className="text-[11px] font-mono text-slate-500 block">ID: {deleteArtifactTarget.id}</span>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs">
                Are you sure you want to permanently delete this deliverable? This action cannot be undone.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeleteArtifactTarget(null)}
                  disabled={deletingArtifactId === deleteArtifactTarget.id}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-deliverable-modal-btn"
                  onClick={handleConfirmDeleteArtifact}
                  disabled={deletingArtifactId === deleteArtifactTarget.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${deletingArtifactId === deleteArtifactTarget.id ? 'animate-spin' : ''}`} />
                  <span>{deletingArtifactId === deleteArtifactTarget.id ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  </AuthGuard>
  );
}
