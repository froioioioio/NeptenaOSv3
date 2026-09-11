'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Bot,
  Zap,
  Activity,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  Database,
  Terminal,
  Cpu,
  Shield,
  Layers,
  Search,
  ExternalLink,
  Code2,
  GitPullRequest,
  Check,
  AlertCircle,
  X,
  Lock,
  BookOpen,
  FileCheck,
  Filter,
  Sparkles,
  ShieldCheck,
  Save,
  RotateCcw,
  Copy,
  Edit3,
  FileCode,
  Sliders,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CheckCheck,
  Archive,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import UserSessionNav from '@/components/UserSessionNav';
import { AgentEntity, WorkerEntity, ToolCallEntity } from '@/schemas/repositories';
import { MODEL_PRICING_TABLE, SUPPORTED_GEMINI_MODELS } from '@/lib/token-pricing';

interface EnrichedWorker extends WorkerEntity {
  taskTitle?: string;
  missionTitle?: string;
  lastToolCall?: ToolCallEntity | null;
}

interface AgentWithTelemetry extends AgentEntity {
  description?: string;
  defaultPrompt?: string;
  workers: EnrichedWorker[];
  lastToolCall?: ToolCallEntity | null;
  activeWorkerCount: number;
  totalWorkerCount: number;
}

export default function AgentsFleetPage() {
  const [agents, setAgents] = useState<AgentWithTelemetry[]>([]);
  const [metrics, setMetrics] = useState<{
    totalAgents: number;
    runningAgents: number;
    totalActiveWorkers: number;
    totalRecordedToolCalls: number;
  }>({
    totalAgents: 0,
    runningAgents: 0,
    totalActiveWorkers: 0,
    totalRecordedToolCalls: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedToolCall, setSelectedToolCall] = useState<ToolCallEntity | null>(null);
  const [filterRole, setFilterRole] = useState<'all' | 'ceo' | 'growth' | 'development' | 'quality'>('all');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  // Agent Concurrency Limit State
  const [updatingLimitId, setUpdatingLimitId] = useState<string | null>(null);
  const [updatingModelTierId, setUpdatingModelTierId] = useState<string | null>(null);

  // Agent Prompt Editing & Customization State
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [promptNotice, setPromptNotice] = useState<{ agentId: string; message: string; type: 'success' | 'error' } | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [promptEditMode, setPromptEditMode] = useState<Record<string, boolean>>({});
  const [saveDropdownOpenId, setSaveDropdownOpenId] = useState<string | null>(null);
  const [resetDropdownOpenId, setResetDropdownOpenId] = useState<string | null>(null);

  // Triggering live tasks
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Spawn Worker with Custom Prompt State
  const [spawnModalAgent, setSpawnModalAgent] = useState<AgentWithTelemetry | null>(null);
  const [customPromptInput, setCustomPromptInput] = useState<string>('');
  const [customMissionTitle, setCustomMissionTitle] = useState<string>('');
  const [customObjective, setCustomObjective] = useState<string>('');
  const [showSystemPromptInModal, setShowSystemPromptInModal] = useState<boolean>(false);
  const [inlineCustomPrompts, setInlineCustomPrompts] = useState<Record<string, string>>({});

  // Workers Section & Card Expand/Collapse State
  const [isWorkersSectionExpanded, setIsWorkersSectionExpanded] = useState<boolean>(true);
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});

  const toggleWorkerExpanded = (workerId: string) => {
    setExpandedWorkers((prev) => {
      const current = prev[workerId] ?? true;
      return { ...prev, [workerId]: !current };
    });
  };

  const toggleAllWorkers = (expand: boolean, workerIds: string[]) => {
    setExpandedWorkers((prev) => {
      const updated = { ...prev };
      workerIds.forEach((id) => {
        updated[id] = expand;
      });
      return updated;
    });
  };

  const fetchAgentsData = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.agents)) {
        setAgents(data.agents);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        if (!selectedAgentId && data.agents.length > 0) {
          setSelectedAgentId(data.agents[0].id);
        }

        // Populate initial edited prompts
        setEditedPrompts((prev) => {
          const updated = { ...prev };
          data.agents.forEach((ag: AgentWithTelemetry) => {
            if (updated[ag.id] === undefined) {
              updated[ag.id] = ag.systemPrompt || ag.prompt || ag.defaultPrompt || '';
            }
          });
          return updated;
        });
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await fetchAgentsData();
      } catch {
        // Fallback silently
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [fetchAgentsData]);

  // Prompt Management Handlers
  const handleSaveAgentPrompt = async (agentId: string, saveAsDefault: boolean = false) => {
    setSavingPromptId(agentId);
    setPromptNotice(null);
    setSaveDropdownOpenId(null);
    try {
      const targetAgent = agents.find((a) => a.id === agentId);
      const promptValue = editedPrompts[agentId] ?? (targetAgent?.systemPrompt || targetAgent?.prompt || '');
      
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          prompt: promptValue,
          systemPrompt: promptValue,
          saveAsDefault,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to persist prompt');
      }

      // Update state locally
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? {
                ...a,
                prompt: promptValue,
                systemPrompt: promptValue,
                ...(saveAsDefault ? { defaultPrompt: promptValue } : {}),
              }
            : a
        )
      );

      setPromptNotice({
        agentId,
        message: saveAsDefault
          ? `Custom prompt saved as NEW DEFAULT baseline for ${targetAgent?.name || agentId}`
          : `Agent prompt successfully saved to Firestore for ${targetAgent?.name || agentId}`,
        type: 'success',
      });
      setPromptEditMode((prev) => ({ ...prev, [agentId]: false }));

      setTimeout(() => setPromptNotice(null), 5000);
    } catch (err: unknown) {
      setPromptNotice({
        agentId,
        message: `Error saving prompt: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setSavingPromptId(null);
    }
  };

  const handleResetAgentPrompt = async (agentId: string, resetToFactory: boolean = false) => {
    setSavingPromptId(agentId);
    setPromptNotice(null);
    setResetDropdownOpenId(null);
    try {
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          resetDefault: !resetToFactory,
          resetCanonical: resetToFactory,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to reset prompt');
      }

      const activeText = data.agent?.prompt || data.agent?.systemPrompt || '';
      const defaultText = data.agent?.defaultPrompt || activeText;

      setEditedPrompts((prev) => ({ ...prev, [agentId]: activeText }));
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? {
                ...a,
                prompt: activeText,
                systemPrompt: activeText,
                defaultPrompt: defaultText,
              }
            : a
        )
      );

      const targetAgent = agents.find((a) => a.id === agentId);
      setPromptNotice({
        agentId,
        message: resetToFactory
          ? `Agent prompt restored to factory canonical default for ${targetAgent?.name || agentId}`
          : `Agent prompt restored to saved default baseline for ${targetAgent?.name || agentId}`,
        type: 'success',
      });
      setPromptEditMode((prev) => ({ ...prev, [agentId]: false }));

      setTimeout(() => setPromptNotice(null), 5000);
    } catch (err: unknown) {
      setPromptNotice({
        agentId,
        message: `Error resetting prompt: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setSavingPromptId(null);
    }
  };

  const handleUpdateWorkerLimit = async (agentId: string, newLimit: number) => {
    const clamped = Math.max(1, Math.min(20, newLimit));
    setUpdatingLimitId(agentId);
    try {
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, maxConcurrentWorkers: clamped }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update limit');
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, maxConcurrentWorkers: clamped } : a))
      );
      setPromptNotice({
        agentId,
        message: `Max concurrent worker limit set to ${clamped} for ${agentId}.`,
        type: 'success',
      });
      setTimeout(() => setPromptNotice(null), 4000);
    } catch (err: unknown) {
      setPromptNotice({
        agentId,
        message: `Failed to update worker limit: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setUpdatingLimitId(null);
    }
  };

  const handleUpdateModelTier = async (agentId: string, modelTier: string) => {
    setUpdatingModelTierId(agentId);
    try {
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, modelTier }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update model tier');
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, modelTier: data.agent?.modelTier || modelTier } : a))
      );
      setPromptNotice({
        agentId,
        message: `Model tier set to ${modelTier} for ${agentId}.`,
        type: 'success',
      });
      setTimeout(() => setPromptNotice(null), 4000);
    } catch (err: unknown) {
      setPromptNotice({
        agentId,
        message: `Failed to update model tier: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setUpdatingModelTierId(null);
    }
  };

  const handleCopyAgentPrompt = async (promptText: string, agentId: string) => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPromptId(agentId);
      setTimeout(() => setCopiedPromptId(null), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Role-specific Prompt Directive Suggestions
  const PROMPT_SUGGESTIONS: Record<string, { label: string; prompt: string }[]> = {
    growth: [
      {
        label: 'Competitor Intelligence',
        prompt: 'Perform deep competitive research on autonomous AI agent platforms, analyzing their pricing models, unique features, and distribution channels.',
      },
      {
        label: 'GTM & Launch Strategy',
        prompt: 'Draft an actionable Go-To-Market and viral distribution playbook targeting Next.js and AI engineers on Product Hunt, Hacker News, and X.',
      },
      {
        label: 'Value Proposition Blueprint',
        prompt: 'Refine product messaging and high-conversion positioning copy emphasizing autonomous black-box QA, real-time code generation, and multi-agent coordination.',
      },
      {
        label: 'SEO & Content Keywords',
        prompt: 'Analyze search volume and high-intent long-tail keywords for AI coding agents and autonomous developer workspaces.',
      },
    ],
    development: [
      {
        label: 'Modular API Endpoint',
        prompt: 'Scaffold a production-grade Next.js App Router API route with Zod request validation, rate limiting, and robust structured error responses.',
      },
      {
        label: 'Auth & Session Guard',
        prompt: 'Implement a secure authentication middleware guard with role-based access control (RBAC) and session renewal.',
      },
      {
        label: 'Optimistic State Store',
        prompt: 'Build a type-safe client-side state store supporting optimistic mutations, rollback on failure, and telemetry logging.',
      },
      {
        label: 'Integration Test Suite',
        prompt: 'Write an end-to-end integration test harness testing concurrent worker execution, concurrency limits, and artifact persistence.',
      },
    ],
    quality: [
      {
        label: 'Black-Box Security Audit',
        prompt: 'Conduct a thorough black-box security audit checking for SQL/NoSQL injection, prompt injection vulnerabilities, unsanitized user inputs, and RBAC bypasses.',
      },
      {
        label: 'PRD Goal Fidelity',
        prompt: 'Audit the deliverable strictly against founder requirements, checking for scope adherence, missing edge-case handling, and API contract compliance.',
      },
      {
        label: 'Resiliency & Error Handling',
        prompt: 'Evaluate failure scenarios, network disconnects, timeout handlers, and graceful degradation across all specialist components.',
      },
      {
        label: 'Code Craftsmanship & Style',
        prompt: 'Review codebase for type soundness, dead code elimination, memory leaks, and adherence to production architectural conventions.',
      },
    ],
    ceo: [
      {
        label: 'Strategic Roadmap',
        prompt: 'Formulate a 3-phase strategic development roadmap balancing developer tool feature velocity with enterprise security and monetization.',
      },
      {
        label: 'Cross-Agent Release Sprint',
        prompt: 'Orchestrate a unified cross-functional initiative delegating research to Growth, implementation to Dev, and verification to Quality.',
      },
    ],
  };

  // Unified spawn worker with custom prompt and metadata support
  const handleSpawnWorker = async (
    agent: AgentWithTelemetry,
    customPrompt?: string,
    meta?: { missionTitle?: string; objective?: string; taskInstruction?: string }
  ) => {
    setTriggeringAgent(agent.id);
    setActionNotice(null);

    const promptToSend = customPrompt?.trim() || undefined;
    const bodyPayload = {
      customPrompt: promptToSend,
      taskInstruction: promptToSend,
      missionTitle: meta?.missionTitle?.trim() || undefined,
      objective: meta?.objective?.trim() || undefined,
    };

    let endpoint = '/api/agents/growth/execute';
    if (agent.role === 'development') {
      endpoint = '/api/agents/development/execute';
    } else if (agent.role === 'quality') {
      endpoint = '/api/agents/quality/execute';
    } else if (agent.role === 'ceo') {
      endpoint = '/api/agents/ceo/execute';
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Worker execution failed');
      }

      if (agent.role === 'quality') {
        const score = data.result?.qaOutput?.qualityScore ? `${Math.round(data.result.qaOutput.qualityScore * 100)}%` : 'Approved';
        setActionNotice(`🛡️ ${agent.name} executed QA audit with custom directives (Score: ${score}, Verdict: ${data.result?.qaOutput?.verdict || 'APPROVED'})`);
      } else if (agent.role === 'development') {
        setActionNotice(`🚀 ${agent.name} worker spawned & generated code with custom directives in project workspace`);
      } else if (agent.role === 'growth') {
        setActionNotice(`📈 ${agent.name} worker spawned & completed research report with custom directives`);
      } else {
        setActionNotice(`⚡ ${agent.name} worker spawned & orchestrated initiative with custom prompt`);
      }

      // Clear modal and inline prompt buffer on success
      setSpawnModalAgent(null);
      setCustomPromptInput('');
      setCustomMissionTitle('');
      setCustomObjective('');
      if (agent.id) {
        setInlineCustomPrompts((prev) => ({ ...prev, [agent.id]: '' }));
      }

      await fetchAgentsData(true);
    } catch (err: unknown) {
      setActionNotice(`❌ Worker execution failed on ${agent.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTriggeringAgent(null);
    }
  };

  // Trigger live worker execution on the agent
  const handleTriggerGrowthWorker = async () => {
    const growthAgent = agents.find((a) => a.role === 'growth') || agents[0];
    if (growthAgent) {
      await handleSpawnWorker(growthAgent, inlineCustomPrompts[growthAgent.id]);
    }
  };

  const handleTriggerDevWorker = async () => {
    const devAgent = agents.find((a) => a.role === 'development') || agents[0];
    if (devAgent) {
      await handleSpawnWorker(devAgent, inlineCustomPrompts[devAgent.id]);
    }
  };

  const handleTriggerQualityWorker = async () => {
    const qaAgent = agents.find((a) => a.role === 'quality') || agents[0];
    if (qaAgent) {
      await handleSpawnWorker(qaAgent, inlineCustomPrompts[qaAgent.id]);
    }
  };

  const getAgentStatusBadge = (status: AgentEntity['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            running
          </span>
        );
      case 'idle':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-900 text-slate-300 border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            idle
          </span>
        );
      case 'standby':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950 text-blue-300 border border-blue-800">
            <Cpu className="w-3 h-3 text-blue-400" />
            standby
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950 text-amber-300 border border-amber-800">
            paused
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  const getWorkerStatusBadge = (status: WorkerEntity['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            RUNNING
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <Check className="w-2.5 h-2.5 text-emerald-400" />
            COMPLETED
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">
            <X className="w-2.5 h-2.5 text-rose-400" />
            FAILED
          </span>
        );
      case 'terminated':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800">
            TERMINATED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  const getToolStatusBadge = (status: ToolCallEntity['status']) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <Check className="w-2.5 h-2.5 text-emerald-400" />
            SUCCESS
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-spin" />
            EXECUTING
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">
            <X className="w-2.5 h-2.5 text-rose-400" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  const filteredAgents = agents.filter(a => {
    if (filterRole === 'all') return true;
    return a.role === filterRole;
  });

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || (filteredAgents.length > 0 ? filteredAgents[0] : null);

  const filteredWorkers = selectedAgent
    ? selectedAgent.workers.filter(w => {
        if (workerStatusFilter === 'all') return true;
        return w.status === workerStatusFilter;
      })
    : [];

  return (
    <AuthGuard
      fallbackTitle="Agents & Worker Fleet Chamber"
      fallbackDescription="Autonomous fleet management, live telemetry logs, and tool call audit inspection require authenticated Founder credentials."
    >
      <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200 pb-16">
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 sm:px-6 py-2 transition-all">
          <div className="max-w-7xl mx-auto flex flex-col divide-y divide-slate-800/80">
            {/* Top row */}
            <div className="flex items-center justify-between gap-2 py-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Link
                  href="/"
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all shrink-0"
                  title="Return to Mission Control"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md text-white font-bold text-xs sm:text-sm shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h1 className="text-xs sm:text-sm md:text-base font-semibold tracking-tight text-white truncate">Agents &amp; Worker Fleet</h1>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="hidden sm:inline">Live Telemetry</span>
                      <span className="sm:hidden">Live</span>
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">Real-time status, ephemeral workers, and tool call audit trails</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="refresh-agents-btn"
                  onClick={() => fetchAgentsData(true)}
                  disabled={refreshing || loading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
                  title="Refresh live Agent & Worker state"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
                </button>

                <UserSessionNav />
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-2">
              <Link
                href="/"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Missions</span>
              </Link>

              <Link
                href="/missions/archive"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Central Mission Archive"
              >
                <Archive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Archive</span>
              </Link>

              <Link
                href="/agents"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 text-cyan-200 border border-cyan-800 shrink-0 shadow-sm leading-none"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="hidden sm:inline">Agents &amp; Fleet</span>
                <span className="sm:hidden">Fleet</span>
              </Link>

              <Link
                href="/knowledge"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Knowledge</span>
                <span className="sm:hidden">Docs</span>
              </Link>

              <Link
                href="/artifacts"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
              >
                <FileCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Artifacts</span>
                <span className="sm:hidden">Review</span>
              </Link>
            </div>
          </div>
        </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Fleet KPI Metric Cards */}
        <section id="fleet-kpi-metrics" className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Registered Agents</span>
              <Bot className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-mono">{metrics.totalAgents}</span>
              <span className="text-[11px] text-emerald-400 font-medium">({metrics.runningAgents} Active)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Active Workers</span>
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-300 font-mono">{metrics.totalActiveWorkers}</span>
              <span className="text-[11px] text-slate-400">in flight</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Recorded Tool Calls</span>
              <Terminal className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-300 font-mono">{metrics.totalRecordedToolCalls}</span>
              <span className="text-[11px] text-slate-400">executed</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Persistence Engine</span>
              <Database className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-amber-300 font-mono">Firestore</span>
              <span className="text-[10px] text-emerald-400 font-mono">Synced</span>
            </div>
          </div>
        </section>

        {/* Action Notice */}
        {actionNotice && (
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 flex items-center justify-between gap-3 shadow-md animate-fadeIn">
            <span>{actionNotice}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main 2-Column Layout: Agent Fleet Directory (Left) & Selected Agent / Worker Details (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Agent Fleet Cards (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Agent Fleet ({filteredAgents.length})
                </h2>
              </div>

              {/* Role filter */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterRole('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    filterRole === 'all' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole('growth')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    filterRole === 'growth' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Growth
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole('development')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    filterRole === 'development' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Dev
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole('quality')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    filterRole === 'quality' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  QA
                </button>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading Agent Fleet from Firestore...</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
                No agents found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAgents.map((agent) => {
                  const isSelected = selectedAgent?.id === agent.id;
                  return (
                    <div
                      key={agent.id}
                      id={`agent-card-${agent.id}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all shadow-sm ${
                        isSelected
                          ? 'border-cyan-500 bg-slate-900 ring-1 ring-cyan-500/30'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-white tracking-tight">{agent.name}</h3>
                            {getAgentStatusBadge(agent.status)}
                          </div>
                          <span className="text-[11px] font-mono text-cyan-400 block">ID: {agent.id}</span>
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 uppercase">
                            {agent.role}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono">
                            <span className="text-emerald-400 font-semibold">{agent.activeWorkerCount}</span> / {agent.maxConcurrentWorkers || 5} max workers
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                        {agent.description}
                      </p>

                      {/* Capabilities chips */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-2.5 border-t border-slate-800/80">
                        {agent.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>

                      {/* Prompt Status Indicator & Quick Edit / Spawn Buttons on Card */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                        <div className="flex items-center gap-1.5 text-slate-400 truncate max-w-[130px]">
                          <Terminal className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate">
                            {agent.prompt ? `${agent.prompt.slice(0, 24)}...` : 'Canonical'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgentId(agent.id);
                              setPromptEditMode((prev) => ({ ...prev, [agent.id]: true }));
                            }}
                            className="text-[10px] text-slate-400 hover:text-cyan-300 hover:underline flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800"
                            title="Edit system prompt"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgentId(agent.id);
                              setSpawnModalAgent(agent);
                              setCustomPromptInput(inlineCustomPrompts[agent.id] || '');
                            }}
                            className="text-[10px] font-bold text-cyan-300 hover:text-cyan-100 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 transition-all shadow-sm"
                            title="Spawn worker with custom prompt"
                          >
                            <Zap className="w-2.5 h-2.5 text-cyan-400" />
                            <span>Spawn</span>
                          </button>
                        </div>
                      </div>

                      {/* Last Tool Call info on card */}
                      {agent.lastToolCall && (
                        <div className="mt-2.5 p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300">
                          <div className="flex items-center gap-1.5 truncate">
                            <Terminal className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="text-slate-400">Last Tool:</span>
                            <strong className="text-cyan-300 truncate">{agent.lastToolCall.toolName}</strong>
                          </div>
                          <span className="shrink-0 text-[10px]">
                            {getToolStatusBadge(agent.lastToolCall.status)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Agent Deep Dive & Workers Stream (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {selectedAgent ? (
              <div className="space-y-4">
                {/* Agent Detail Banner */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-white">{selectedAgent.name}</h2>
                        {getAgentStatusBadge(selectedAgent.status)}
                      </div>
                      <p className="text-xs text-slate-300">{selectedAgent.description}</p>
                    </div>

                    {/* Quick Trigger Worker Buttons */}
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        id="open-spawn-modal-btn"
                        onClick={() => {
                          setSpawnModalAgent(selectedAgent);
                          setCustomPromptInput(inlineCustomPrompts[selectedAgent.id] || '');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-md active:scale-95 transition-all ${
                          selectedAgent.role === 'growth'
                            ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500'
                            : selectedAgent.role === 'development'
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                            : selectedAgent.role === 'quality'
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
                            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Spawn Worker with Custom Prompt</span>
                      </button>

                      {/* Fast Trigger Button */}
                      <button
                        type="button"
                        id="fast-spawn-btn"
                        onClick={() => handleSpawnWorker(selectedAgent, inlineCustomPrompts[selectedAgent.id])}
                        disabled={triggeringAgent === selectedAgent.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all disabled:opacity-50"
                        title="Spawn instantly using current prompt configuration"
                      >
                        {triggeringAgent === selectedAgent.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        )}
                        <span>Quick Run</span>
                      </button>
                    </div>
                  </div>

                  {/* Agent Technical Metadata */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800 text-xs font-mono">
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 relative">
                      <span className="text-slate-500 block text-[10px] mb-1">MODEL TIER</span>
                      {updatingModelTierId === selectedAgent.id ? (
                        <div className="flex items-center gap-2 text-cyan-400 h-[22px]">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating...</span>
                        </div>
                      ) : (
                        <div className="relative group">
                          <select
                            value={selectedAgent.modelTier || 'gemini-3.7-flash'}
                            onChange={(e) => handleUpdateModelTier(selectedAgent.id, e.target.value)}
                            className="appearance-none w-full bg-slate-900 border border-slate-700 text-cyan-300 font-semibold text-xs rounded py-1 pl-2 pr-6 hover:border-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer transition-colors"
                          >
                            {SUPPORTED_GEMINI_MODELS.map((m) => (
                              <option key={m} value={m}>
                                {MODEL_PRICING_TABLE[m]?.displayName || m} {MODEL_PRICING_TABLE[m]?.category === 'pro' ? '(Pro)' : '(Flash)'}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-cyan-400 transition-colors" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px]">ACTIVE WORKERS</span>
                      <span className="text-emerald-400 font-semibold">{selectedAgent.activeWorkerCount} running</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px]">TOTAL EXECUTIONS</span>
                      <span className="text-indigo-300 font-semibold">{selectedAgent.totalWorkerCount} workers</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px]">MAX CONCURRENCY</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-cyan-400 font-bold">{selectedAgent.maxConcurrentWorkers || 5} limit</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={updatingLimitId === selectedAgent.id || (selectedAgent.maxConcurrentWorkers || 5) <= 1}
                            onClick={() => handleUpdateWorkerLimit(selectedAgent.id, (selectedAgent.maxConcurrentWorkers || 5) - 1)}
                            className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center disabled:opacity-30 transition-all text-xs"
                            title="Decrease concurrent worker limit"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            disabled={updatingLimitId === selectedAgent.id || (selectedAgent.maxConcurrentWorkers || 5) >= 20}
                            onClick={() => handleUpdateWorkerLimit(selectedAgent.id, (selectedAgent.maxConcurrentWorkers || 5) + 1)}
                            className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center disabled:opacity-30 transition-all text-xs"
                            title="Increase concurrent worker limit"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agent System Prompt Management Panel */}
                <div id="agent-prompt-manager" className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                        <Terminal className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                            Agent System Prompt
                          </h3>
                          {(() => {
                            const currentVal = editedPrompts[selectedAgent.id] ?? (selectedAgent.systemPrompt || selectedAgent.prompt || '');
                            const defaultVal = selectedAgent.defaultPrompt || '';
                            const isDraftModified = defaultVal ? currentVal !== defaultVal : false;
                            
                            return (
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                isDraftModified 
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-700' 
                                  : defaultVal 
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}>
                                {isDraftModified ? 'Modified from Default' : 'Default Active'}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Active operational persona, directives, and constraints applied to this agent&apos;s workers &amp; tool calls.
                        </p>
                      </div>
                    </div>

                    {/* Quick Switch Fleet Agent Tabs */}
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                      {agents.map((ag) => (
                        <button
                          key={ag.id}
                          type="button"
                          onClick={() => setSelectedAgentId(ag.id)}
                          className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                            selectedAgent.id === ag.id
                              ? 'bg-cyan-600 text-white font-bold shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {ag.role === 'ceo' ? 'CEO' : ag.role === 'growth' ? 'Growth' : ag.role === 'development' ? 'Dev' : ag.role === 'quality' ? 'QA' : ag.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Notification for Prompt Actions */}
                  {promptNotice && promptNotice.agentId === selectedAgent.id && (
                    <div className={`p-3 rounded-lg text-xs font-mono flex items-center justify-between gap-2 border animate-fadeIn ${
                      promptNotice.type === 'success'
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-800 text-rose-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {promptNotice.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{promptNotice.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPromptNotice(null)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Prompt Editor / Viewer Body */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                      <div className="flex items-center gap-3">
                        <span>
                          Target: <strong className="text-cyan-300">{selectedAgent.name}</strong> ({selectedAgent.id})
                        </span>
                        <span className="text-slate-600">|</span>
                        <span>
                          Chars: <strong className="text-slate-200">{(editedPrompts[selectedAgent.id] ?? (selectedAgent.systemPrompt || selectedAgent.prompt || '')).length}</strong>
                        </span>
                        <span className="text-slate-600">|</span>
                        <span>
                          Lines: <strong className="text-slate-200">{(editedPrompts[selectedAgent.id] ?? (selectedAgent.systemPrompt || selectedAgent.prompt || '')).split('\n').length}</strong>
                        </span>
                      </div>

                      {/* View / Edit Mode Toggle */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPromptEditMode((prev) => ({ ...prev, [selectedAgent.id]: !prev[selectedAgent.id] }))}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border transition-all ${
                            promptEditMode[selectedAgent.id]
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{promptEditMode[selectedAgent.id] ? 'Editing Mode' : 'Edit Prompt'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Textarea or Monospace View */}
                    {promptEditMode[selectedAgent.id] ? (
                      <div className="space-y-2">
                        <textarea
                          id={`agent-prompt-input-${selectedAgent.id}`}
                          value={editedPrompts[selectedAgent.id] ?? (selectedAgent.systemPrompt || selectedAgent.prompt || '')}
                          onChange={(e) =>
                            setEditedPrompts((prev) => ({
                              ...prev,
                              [selectedAgent.id]: e.target.value,
                            }))
                          }
                          rows={9}
                          placeholder={`Enter custom system prompt for ${selectedAgent.name}...`}
                          className="w-full rounded-xl bg-slate-950 border border-cyan-600/50 p-3.5 font-mono text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent leading-relaxed transition-all shadow-inner"
                        />
                        <p className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                          <span>Changes are applied immediately to new tasks &amp; tool runs upon saving.</span>
                          <span>Formatting: Plaintext / Markdown directives</span>
                        </p>
                      </div>
                    ) : (
                      <div className="relative group rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap shadow-inner select-text">
                        {editedPrompts[selectedAgent.id] || selectedAgent.systemPrompt || selectedAgent.prompt || (
                          <span className="text-slate-500 italic">No prompt defined for this agent. Click &quot;Edit Prompt&quot; to configure.</span>
                        )}
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-2">
                        {/* Copy Prompt Button */}
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyAgentPrompt(
                              editedPrompts[selectedAgent.id] ?? (selectedAgent.systemPrompt || selectedAgent.prompt || ''),
                              selectedAgent.id
                            )
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all active:scale-95"
                        >
                          {copiedPromptId === selectedAgent.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300 font-mono text-[11px]">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-mono text-[11px]">Copy Prompt</span>
                            </>
                          )}
                        </button>

                        {/* Reset to Default Split Button */}
                        <div className="relative inline-flex items-stretch rounded-lg shadow-sm">
                          <button
                            type="button"
                            id={`reset-prompt-btn-${selectedAgent.id}`}
                            onClick={() => handleResetAgentPrompt(selectedAgent.id, false)}
                            disabled={savingPromptId === selectedAgent.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 border-r-slate-700 transition-all active:scale-95 disabled:opacity-50"
                            title="Reset prompt back to the saved default baseline"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${savingPromptId === selectedAgent.id ? 'animate-spin' : ''}`} />
                            <span className="font-mono text-[11px]">Reset Default</span>
                          </button>

                          <button
                            type="button"
                            id={`reset-prompt-dropdown-trigger-${selectedAgent.id}`}
                            onClick={() =>
                              setResetDropdownOpenId(resetDropdownOpenId === selectedAgent.id ? null : selectedAgent.id)
                            }
                            disabled={savingPromptId === selectedAgent.id}
                            className="flex items-center justify-center px-1.5 py-1.5 rounded-r-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 border-l-0 transition-all disabled:opacity-50"
                            title="Reset options"
                          >
                            <ChevronDown
                              className={`w-3 h-3 transition-transform duration-200 ${
                                resetDropdownOpenId === selectedAgent.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {/* Reset Options Dropdown */}
                          {resetDropdownOpenId === selectedAgent.id && (
                            <>
                              <div
                                className="fixed inset-0 z-20"
                                onClick={() => setResetDropdownOpenId(null)}
                              />
                              <div
                                id={`reset-prompt-dropdown-menu-${selectedAgent.id}`}
                                className="absolute left-0 bottom-full mb-2 w-72 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-1.5 z-30 font-sans animate-fadeIn"
                              >
                                <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                                  <span>Reset Baseline Options</span>
                                  <span className="text-cyan-400">{selectedAgent.name}</span>
                                </div>

                                <div className="p-1 space-y-1">
                                  {/* Reset to Saved Default */}
                                  <button
                                    type="button"
                                    id={`reset-saved-default-option-${selectedAgent.id}`}
                                    onClick={() => handleResetAgentPrompt(selectedAgent.id, false)}
                                    className="w-full flex items-start gap-2.5 p-2 text-left rounded-lg hover:bg-slate-800/90 text-slate-200 transition-all group"
                                  >
                                    <RotateCcw className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-semibold text-slate-100 group-hover:text-cyan-300">
                                        Reset to Saved Default
                                      </div>
                                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                        Restores active prompt to your configured custom default baseline.
                                      </div>
                                    </div>
                                  </button>

                                  {/* Reset to Factory Canonical */}
                                  <button
                                    type="button"
                                    id={`reset-factory-canonical-option-${selectedAgent.id}`}
                                    onClick={() => handleResetAgentPrompt(selectedAgent.id, true)}
                                    className="w-full flex items-start gap-2.5 p-2 text-left rounded-lg hover:bg-rose-950/40 text-slate-200 border border-transparent hover:border-rose-900/50 transition-all group"
                                  >
                                    <RotateCcw className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-semibold text-rose-300 group-hover:text-rose-200">
                                        Reset to Factory Canonical
                                      </div>
                                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                        Hard reset back to the hardcoded system factory prompt.
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Save Prompt Button */}
                      <div className="flex items-center gap-2">
                        {promptEditMode[selectedAgent.id] && (
                          <button
                            type="button"
                            onClick={() => {
                              // Revert local edit buffer to current agent stored prompt
                              setEditedPrompts((prev) => ({
                                ...prev,
                                [selectedAgent.id]: selectedAgent.systemPrompt || selectedAgent.prompt || '',
                              }));
                              setPromptEditMode((prev) => ({ ...prev, [selectedAgent.id]: false }));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 transition-all"
                          >
                            Cancel
                          </button>
                        )}

                        {/* Split Save Button with Dropdown for Save as Default */}
                        <div className="relative inline-flex items-stretch rounded-lg shadow-md">
                          <button
                            type="button"
                            id={`save-prompt-btn-${selectedAgent.id}`}
                            onClick={() => handleSaveAgentPrompt(selectedAgent.id, false)}
                            disabled={savingPromptId === selectedAgent.id}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-l-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white active:scale-95 transition-all disabled:opacity-50 border-r border-cyan-700/60"
                          >
                            {savingPromptId === selectedAgent.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5" />
                                <span>Save Prompt</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            id={`save-prompt-dropdown-trigger-${selectedAgent.id}`}
                            onClick={() =>
                              setSaveDropdownOpenId(saveDropdownOpenId === selectedAgent.id ? null : selectedAgent.id)
                            }
                            disabled={savingPromptId === selectedAgent.id}
                            className="flex items-center justify-center px-2 py-1.5 rounded-r-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-all disabled:opacity-50 hover:bg-blue-500"
                            title="More save options"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                saveDropdownOpenId === selectedAgent.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {/* Dropdown Options Menu */}
                          {saveDropdownOpenId === selectedAgent.id && (
                            <>
                              {/* Invisible backdrop to dismiss on outside click */}
                              <div
                                className="fixed inset-0 z-20"
                                onClick={() => setSaveDropdownOpenId(null)}
                              />
                              <div
                                id={`save-prompt-dropdown-menu-${selectedAgent.id}`}
                                className="absolute right-0 bottom-full mb-2 w-72 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-1.5 z-30 font-sans animate-fadeIn"
                              >
                                <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                                  <span>Prompt Persistence Options</span>
                                  <span className="text-cyan-400">{selectedAgent.name}</span>
                                </div>

                                <div className="p-1 space-y-1">
                                  {/* Standard Save */}
                                  <button
                                    type="button"
                                    id={`save-active-option-${selectedAgent.id}`}
                                    onClick={() => handleSaveAgentPrompt(selectedAgent.id, false)}
                                    className="w-full flex items-start gap-2.5 p-2 text-left rounded-lg hover:bg-slate-800/90 text-slate-200 transition-all group"
                                  >
                                    <Save className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-semibold text-slate-100 group-hover:text-cyan-300">
                                        Save Active Prompt
                                      </div>
                                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                        Persist edited prompt for active tasks &amp; worker executions.
                                      </div>
                                    </div>
                                  </button>

                                  {/* Save as New Default */}
                                  <button
                                    type="button"
                                    id={`save-as-default-option-${selectedAgent.id}`}
                                    onClick={() => handleSaveAgentPrompt(selectedAgent.id, true)}
                                    className="w-full flex items-start gap-2.5 p-2 text-left rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/60 text-cyan-200 transition-all group"
                                  >
                                    <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-semibold text-cyan-300 group-hover:text-cyan-100 flex items-center gap-1.5">
                                        <span>Save as New Default</span>
                                        <span className="text-[9px] bg-cyan-900 text-cyan-200 px-1.5 py-0.2 rounded font-mono font-normal">
                                          Default
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                        Sets the currently written textbox prompt as the new default baseline for this agent.
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Workers List Section */}
                <div id="current-workers-section" className="rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm overflow-hidden transition-all">
                  {/* Section Header with Expand / Collapse Controls */}
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 bg-slate-950/40">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        id="toggle-workers-section-btn"
                        onClick={() => setIsWorkersSectionExpanded(!isWorkersSectionExpanded)}
                        className="flex items-center gap-2 text-left group focus:outline-none"
                        title={isWorkersSectionExpanded ? 'Collapse Current Workers section' : 'Expand Current Workers section'}
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400 group-hover:bg-emerald-900 transition-colors">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider group-hover:text-cyan-300 transition-colors">
                              Current Workers ({filteredWorkers.length})
                            </h3>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-200 ${
                                isWorkersSectionExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Telemetry, active task assignments, and tool execution logs
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {/* Bulk Expand / Collapse All Cards Toggle */}
                      {isWorkersSectionExpanded && filteredWorkers.length > 0 && (
                        <div className="flex items-center gap-1 bg-slate-950 border border-slate-850 rounded-lg p-0.5">
                          <button
                            type="button"
                            id="expand-all-workers-btn"
                            onClick={() => toggleAllWorkers(true, filteredWorkers.map((w) => w.id))}
                            className="px-2 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-cyan-300 hover:bg-slate-900 transition-all flex items-center gap-1"
                            title="Expand all worker detail cards"
                          >
                            <ChevronsUpDown className="w-3 h-3 text-cyan-400" />
                            <span>Expand All</span>
                          </button>
                          <span className="text-slate-700">|</span>
                          <button
                            type="button"
                            id="collapse-all-workers-btn"
                            onClick={() => toggleAllWorkers(false, filteredWorkers.map((w) => w.id))}
                            className="px-2 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all"
                            title="Collapse all worker detail cards"
                          >
                            Collapse All
                          </button>
                        </div>
                      )}

                      {/* Worker status filter */}
                      <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setWorkerStatusFilter('all')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                            workerStatusFilter === 'all' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          All ({selectedAgent.workers?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkerStatusFilter('running')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                            workerStatusFilter === 'running' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Running
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkerStatusFilter('completed')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                            workerStatusFilter === 'completed' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Completed
                        </button>
                      </div>

                      {/* Section Toggle Pill */}
                      <button
                        type="button"
                        onClick={() => setIsWorkersSectionExpanded(!isWorkersSectionExpanded)}
                        className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-white transition-all flex items-center gap-1"
                      >
                        {isWorkersSectionExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3 text-slate-400" />
                            <span>Hide</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 text-cyan-400" />
                            <span>Show</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Section Content Area */}
                  {isWorkersSectionExpanded ? (
                    <div className="p-5 space-y-3">
                      {filteredWorkers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center space-y-2">
                          <Sparkles className="w-6 h-6 text-slate-600 mx-auto" />
                          <p className="text-sm font-medium text-slate-300">No workers recorded yet for this filter</p>
                          <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            Click &quot;Spawn Worker&quot; above or run missions to trigger live worker telemetry in Firestore.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredWorkers.map((worker) => {
                            const isExpanded = expandedWorkers[worker.id] ?? true;

                            return (
                              <div
                                key={worker.id}
                                id={`worker-item-${worker.id}`}
                                className={`rounded-xl bg-slate-950/90 border transition-all ${
                                  isExpanded
                                    ? 'border-slate-800 shadow-md p-4 space-y-3'
                                    : 'border-slate-850 hover:border-slate-700/80 p-3 shadow-sm'
                                }`}
                              >
                                {/* Worker Header / Toggle Bar */}
                                <div
                                  onClick={() => toggleWorkerExpanded(worker.id)}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none group"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                                        Worker: {worker.id}
                                      </span>
                                      {getWorkerStatusBadge(worker.status)}
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                                        Role: {worker.role}
                                      </span>
                                    </div>

                                    <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap">
                                      <span>
                                        Task: <strong className="text-cyan-300">{worker.taskTitle}</strong>
                                      </span>
                                      <span className="text-slate-500">•</span>
                                      <span className="text-slate-400">{worker.missionTitle}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 shrink-0">
                                    <span>
                                      Spawned: {worker.spawnedAt ? new Date(worker.spawnedAt).toLocaleTimeString() : 'Recent'}
                                    </span>
                                    <button
                                      type="button"
                                      id={`toggle-worker-${worker.id}-btn`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleWorkerExpanded(worker.id);
                                      }}
                                      className="p-1 rounded-md bg-slate-900 border border-slate-800 hover:border-cyan-700 text-slate-400 hover:text-cyan-300 transition-all flex items-center gap-1"
                                      title={isExpanded ? 'Collapse worker details' : 'Expand worker details'}
                                    >
                                      <span className="text-[10px] hidden sm:inline">
                                        {isExpanded ? 'Collapse' : 'Expand'}
                                      </span>
                                      <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                          isExpanded ? 'rotate-180 text-cyan-400' : 'text-slate-400'
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Worker Details Body */}
                                {isExpanded && (
                                  <div className="pt-2 border-t border-slate-900 space-y-3 animate-fadeIn">
                                    {/* Result Summary */}
                                    {worker.resultSummary && (
                                      <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans">
                                        <strong className="text-emerald-400 font-mono text-[11px] block mb-0.5">
                                          Execution Summary:
                                        </strong>
                                        {worker.resultSummary}
                                      </div>
                                    )}

                                    {/* Last Tool Call Inspection Box */}
                                    {worker.lastToolCall ? (
                                      <div className="p-3 rounded-lg bg-slate-900/90 border border-indigo-900/50 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                                            <span className="text-xs font-mono font-semibold text-indigo-200">
                                              Last Tool Call: {worker.lastToolCall.toolName}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {getToolStatusBadge(worker.lastToolCall.status)}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedToolCall(worker.lastToolCall || null);
                                              }}
                                              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono underline"
                                            >
                                              View Payload
                                            </button>
                                          </div>
                                        </div>

                                        {/* Input Preview */}
                                        <div className="text-[11px] font-mono bg-slate-950 p-2 rounded border border-slate-800/80 text-slate-300 overflow-x-auto">
                                          <span className="text-slate-500 block text-[10px]">INPUT ARGUMENTS:</span>
                                          <code>{JSON.stringify(worker.lastToolCall.input, null, 2)}</code>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] font-mono text-slate-500 italic p-2 rounded bg-slate-900/30 border border-slate-800/40">
                                        No tool call logged for this worker session.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Collapsed Section Preview Banner */
                    <div
                      onClick={() => setIsWorkersSectionExpanded(true)}
                      className="p-4 bg-slate-950/60 hover:bg-slate-950 cursor-pointer transition-colors flex items-center justify-between text-xs font-mono text-slate-400 border-t border-slate-900"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300">
                          {filteredWorkers.length} worker{filteredWorkers.length === 1 ? '' : 's'} registered ({selectedAgent.activeWorkerCount} active).
                        </span>
                        <span className="text-slate-500">Click to expand details and tool call logs.</span>
                      </div>
                      <span className="text-cyan-400 hover:text-cyan-300 underline text-[11px]">
                        Expand Section
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-12 text-center text-slate-400">
                Select an agent from the left directory to inspect active workers and tool call history.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tool Call Payload Modal */}
      {selectedToolCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-mono font-bold text-white">
                  Tool Call Details: {selectedToolCall.toolName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedToolCall(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">TOOL CALL ID</span>
                  <span className="text-cyan-300">{selectedToolCall.id}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">STATUS</span>
                  <span>{getToolStatusBadge(selectedToolCall.status)}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block mb-1">INPUT PARAMETERS:</span>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 overflow-x-auto text-[11px] leading-relaxed">
                  {JSON.stringify(selectedToolCall.input, null, 2)}
                </pre>
              </div>

              {selectedToolCall.output && (
                <div>
                  <span className="text-slate-400 text-[11px] block mb-1">OUTPUT RESULT:</span>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300 overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(selectedToolCall.output, null, 2)}
                  </pre>
                </div>
              )}

              {selectedToolCall.error && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300">
                  <span className="font-bold block mb-0.5">ERROR:</span>
                  {selectedToolCall.error}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedToolCall(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spawn Specialist Worker with Custom Prompt Modal Dialog */}
      {spawnModalAgent && (
        <div id="spawn-worker-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  spawnModalAgent.role === 'growth'
                    ? 'bg-cyan-950/80 border-cyan-700 text-cyan-400'
                    : spawnModalAgent.role === 'development'
                    ? 'bg-blue-950/80 border-blue-700 text-blue-400'
                    : spawnModalAgent.role === 'quality'
                    ? 'bg-purple-950/80 border-purple-700 text-purple-400'
                    : 'bg-amber-950/80 border-amber-700 text-amber-400'
                }`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Spawn {spawnModalAgent.name} Worker
                    </h3>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {spawnModalAgent.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Inject custom directives on top of the active system prompt for this worker run.
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="close-spawn-modal-btn"
                onClick={() => setSpawnModalAgent(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Agent Quick Switch Tabs */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Target Specialist Agent:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {agents.map((ag) => {
                    const isSelected = ag.id === spawnModalAgent.id;
                    return (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={() => {
                          setSpawnModalAgent(ag);
                          setCustomPromptInput(inlineCustomPrompts[ag.id] || '');
                        }}
                        className={`p-2.5 rounded-xl text-left border transition-all ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-600 shadow-md ring-1 ring-cyan-500'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-xs ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                            {ag.name}
                          </span>
                          <span className="text-[9px] font-mono uppercase text-slate-500">{ag.role}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          {ag.activeWorkerCount} active / {ag.maxConcurrentWorkers || 5} max
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Baseline System Prompt Collapsible Accordion */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      Active System Prompt Baseline
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSystemPromptInModal(!showSystemPromptInModal)}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                  >
                    <span>{showSystemPromptInModal ? 'Hide Baseline' : 'View Baseline'}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showSystemPromptInModal ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showSystemPromptInModal && (
                  <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto bg-slate-900/60 p-2.5 rounded-lg">
                    {spawnModalAgent.systemPrompt || spawnModalAgent.prompt || spawnModalAgent.defaultPrompt || 'Canonical system prompt'}
                  </div>
                )}
              </div>

              {/* Template Suggestions */}
              {PROMPT_SUGGESTIONS[spawnModalAgent.role] && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Quick Template Directives (Click to Load):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PROMPT_SUGGESTIONS[spawnModalAgent.role].map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCustomPromptInput(sug.prompt)}
                        className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-cyan-950/80 border border-slate-800 hover:border-cyan-700 text-slate-300 hover:text-cyan-200 transition-all text-left flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span>{sug.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Prompt Input Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="modal-custom-prompt-input" className="text-xs font-bold text-slate-200">
                    Custom Prompt / Directives <span className="text-cyan-400 font-normal">(Injected on top of System Prompt)</span>:
                  </label>
                  {customPromptInput && (
                    <button
                      type="button"
                      onClick={() => setCustomPromptInput('')}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-200 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <textarea
                  id="modal-custom-prompt-input"
                  rows={4}
                  value={customPromptInput}
                  onChange={(e) => setCustomPromptInput(e.target.value)}
                  placeholder={`Specify custom goals, search queries, code architectural constraints, QA acceptance criteria, or target features for this ephemeral worker run...`}
                  className="w-full rounded-xl bg-slate-950 border border-cyan-800/80 p-3.5 font-mono text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent leading-relaxed shadow-inner"
                />
                <p className="text-[10px] text-slate-500 font-mono">
                  This custom prompt will be appended to the active agent persona when the worker executes its tool calls.
                </p>
              </div>

              {/* Optional Custom Mission Metadata */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="modal-mission-title-input" className="text-[11px] font-mono text-slate-400 block mb-1">
                      Custom Mission Title (Optional):
                    </label>
                    <input
                      id="modal-mission-title-input"
                      type="text"
                      value={customMissionTitle}
                      onChange={(e) => setCustomMissionTitle(e.target.value)}
                      placeholder={`e.g. ${spawnModalAgent.name} Targeted Sprint`}
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-objective-input" className="text-[11px] font-mono text-slate-400 block mb-1">
                      Custom High-Level Objective (Optional):
                    </label>
                    <input
                      id="modal-objective-input"
                      type="text"
                      value={customObjective}
                      onChange={(e) => setCustomObjective(e.target.value)}
                      placeholder={`e.g. Execute research and deliverable`}
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSpawnModalAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                id="modal-confirm-spawn-btn"
                onClick={() =>
                  handleSpawnWorker(spawnModalAgent, customPromptInput, {
                    missionTitle: customMissionTitle,
                    objective: customObjective,
                  })
                }
                disabled={triggeringAgent === spawnModalAgent.id}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xl active:scale-95 transition-all disabled:opacity-50 ${
                  spawnModalAgent.role === 'growth'
                    ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500'
                    : spawnModalAgent.role === 'development'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                    : spawnModalAgent.role === 'quality'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                }`}
              >
                {triggeringAgent === spawnModalAgent.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Spawning {spawnModalAgent.name} Worker...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>
                      {customPromptInput.trim()
                        ? `Spawn ${spawnModalAgent.name} with Custom Prompt`
                        : `Spawn ${spawnModalAgent.name} Worker`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  </AuthGuard>
  );
}
