'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  GitPullRequest,
  ExternalLink,
  FolderGit2,
  Check,
  ChevronDown,
  ChevronUp,
  FileCode,
  Shield,
  Layers,
  Sparkles,
  Rocket,
  Bot,
  BookOpen,
  FileCheck,
  Ban,
  Calendar,
  Eye,
  X,
  FileText,
  Activity,
  CheckCheck,
  Coins,
  Workflow
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import UserSessionNav from '@/components/UserSessionNav';
import { MissionCostCounter } from '@/components/MissionCostCounter';
import { TaskDependencyGraph } from '@/components/TaskDependencyGraph';
import { MissionEntity, TaskEntity } from '@/schemas/repositories';

interface EnrichedArchivedMission extends MissionEntity {
  tasks: TaskEntity[];
  artifactsCount?: number;
}

export default function MissionArchivePage() {
  const [archivedMissions, setArchivedMissions] = useState<EnrichedArchivedMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled' | 'active' | 'failed'>('all');
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null);
  const [inspectingMission, setInspectingMission] = useState<EnrichedArchivedMission | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchArchivedMissions = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/missions/archive');
      const data = await res.json();
      if (data.success && Array.isArray(data.missions)) {
        setArchivedMissions(data.missions);
      }
    } catch (err: unknown) {
      console.error('Failed to load archived missions:', err);
      showToast('error', 'Failed to load archived missions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchArchivedMissions();
  }, [fetchArchivedMissions]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const handleUnarchive = async (missionId: string, missionTitle: string) => {
    setActionInProgressId(missionId);
    try {
      const res = await fetch('/api/missions/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId, action: 'unarchive' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to unarchive mission');
      }

      showToast('success', `"${missionTitle}" restored to active Mission Control.`);
      if (inspectingMission?.id === missionId) {
        setInspectingMission(null);
      }
      await fetchArchivedMissions();
    } catch (err: unknown) {
      showToast('error', `Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Status counts for quick stats pill cards
  const stats = {
    total: archivedMissions.length,
    completed: archivedMissions.filter((m) => m.status === 'completed').length,
    cancelled: archivedMissions.filter((m) => m.status === 'cancelled').length,
    active: archivedMissions.filter((m) => m.status === 'active' || m.status === 'queued' || m.status === 'draft').length,
    failed: archivedMissions.filter((m) => m.status === 'failed').length,
  };

  // Filtered missions
  const filteredMissions = archivedMissions.filter((mission) => {
    // Status Filter
    if (statusFilter === 'completed' && mission.status !== 'completed') return false;
    if (statusFilter === 'cancelled' && mission.status !== 'cancelled') return false;
    if (statusFilter === 'active' && mission.status !== 'active' && mission.status !== 'queued' && mission.status !== 'draft') return false;
    if (statusFilter === 'failed' && mission.status !== 'failed') return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = mission.title?.toLowerCase().includes(q);
      const matchObjective = mission.objective?.toLowerCase().includes(q);
      const matchId = mission.id?.toLowerCase().includes(q);
      const matchProject = mission.projectFolder?.toLowerCase().includes(q);
      const matchReason = mission.cancellationReason?.toLowerCase().includes(q);
      const matchTask = mission.tasks?.some((t) => t.title?.toLowerCase().includes(q));
      return matchTitle || matchObjective || matchId || matchProject || matchReason || matchTask;
    }

    return true;
  });

  const getStatusBadge = (status: MissionEntity['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800">
            <Ban className="w-3 h-3 text-rose-400" />
            cancelled
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            ongoing / active
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            <Clock className="w-3 h-3 text-amber-400" />
            queued
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
            <XCircle className="w-3 h-3 text-rose-400" />
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
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <Check className="w-2.5 h-2.5 text-emerald-400" /> completed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" /> in_progress
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">
            <X className="w-2.5 h-2.5 text-rose-400" /> stopped/failed
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-950 text-amber-300 border border-amber-800">
            blocked
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

  return (
    <AuthGuard
      fallbackTitle="Neptena-OS Mission Archive"
      fallbackDescription="Historical records, archived missions, and preserved deliverable states are protected. Please authenticate with your Founder account."
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
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-950 text-purple-300 border border-purple-800 whitespace-nowrap">
                      <Archive className="w-2.5 h-2.5 text-purple-400" />
                      <span>Mission Archive</span>
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">
                    Central archive of completed, cancelled, and preserved missions
                  </p>
                </div>
              </div>

              {/* Action Buttons & User Profile */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="refresh-archive-btn"
                  onClick={() => fetchArchivedMissions(true)}
                  disabled={refreshing || loading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
                  title="Sync archived missions"
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
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
                title="Active Missions Dashboard"
              >
                <Rocket className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Missions</span>
              </Link>

              <Link
                href="/missions/archive"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-950/80 text-purple-200 border border-purple-800 shrink-0 shadow-sm leading-none"
                title="Central Mission Archive"
              >
                <Archive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Archive</span>
                {archivedMissions.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-purple-900 text-purple-200 rounded-full text-[10px]">
                    {archivedMissions.length}
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

        {/* Toast Alert */}
        {toastMessage && (
          <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3">
            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                  : toastMessage.type === 'error'
                  ? 'bg-rose-950/70 border-rose-700 text-rose-200'
                  : 'bg-cyan-950/70 border-cyan-700 text-cyan-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {toastMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{toastMessage.text}</span>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-5 space-y-6">
          {/* Breadcrumb & Intro Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Link href="/" className="hover:text-cyan-400 flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3 h-3" />
                  <span>Mission Control</span>
                </Link>
                <span>/</span>
                <span className="text-purple-400 font-semibold">Archive</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Archive className="w-5 h-5 text-purple-400" />
                <span>Central Mission Archive</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Historical index of archived missions with complete deliverable states, cancellation logs, and one-click restoration to active duty.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white transition-all shadow-sm shrink-0 self-start sm:self-auto"
            >
              <Rocket className="w-3.5 h-3.5 text-cyan-400" />
              <span>Back to Active Board</span>
            </Link>
          </div>

          {/* Status Breakdown Metric Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'all'
                  ? 'bg-purple-950/60 border-purple-600 shadow-md shadow-purple-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider">All Archived</span>
                <Archive className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-white">{stats.total}</div>
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'completed'
                  ? 'bg-emerald-950/60 border-emerald-600 shadow-md shadow-emerald-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Completed</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300">{stats.completed}</div>
            </button>

            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'cancelled'
                  ? 'bg-rose-950/60 border-rose-600 shadow-md shadow-rose-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-rose-400">Cancelled</span>
                <Ban className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-bold text-rose-300">{stats.cancelled}</div>
            </button>

            <button
              onClick={() => setStatusFilter('active')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'active'
                  ? 'bg-cyan-950/60 border-cyan-600 shadow-md shadow-cyan-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-400">Ongoing/Active</span>
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-xl font-bold text-cyan-300">{stats.active}</div>
            </button>

            <button
              onClick={() => setStatusFilter('failed')}
              className={`p-3 rounded-xl border text-left col-span-2 sm:col-span-1 transition-all ${
                statusFilter === 'failed'
                  ? 'bg-rose-950/60 border-rose-600 shadow-md shadow-rose-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-rose-400">Failed</span>
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-bold text-rose-300">{stats.failed}</div>
            </button>
          </div>

          {/* Archived Cumulative Multi-Model Cost Summary Banner */}
          {(() => {
            const totalArchivedUsd = archivedMissions.reduce((acc, m) => acc + (m.costUsd || 0), 0);
            const totalArchivedPhp = archivedMissions.reduce((acc, m) => acc + (m.costPhp || 0), 0);
            const totalArchivedTokens = archivedMissions.reduce((acc, m) => acc + (m.totalTokens || ((m.totalTokensInput || 0) + (m.totalTokensOutput || 0))), 0);
            return (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900/80 to-emerald-950/40 border border-purple-800/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-950 border border-purple-700 text-purple-400">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white uppercase tracking-wide text-[11px]">Archived Multi-Model Token Consumption</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                        Pro + Flash Tier
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Cumulative LLM compute investment across all {archivedMissions.length} archived deliverables (CEO Pro strategic models + Specialist Flash/Pro engines).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono self-end sm:self-auto">
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-300">
                      ${totalArchivedUsd.toFixed(4)} <span className="text-xs text-slate-400 font-normal">USD</span>
                    </div>
                    <div className="text-xs font-semibold text-teal-300">
                      ₱{totalArchivedPhp.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">PHP</span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-800 hidden sm:block" />
                  <div className="text-[11px] text-slate-400 hidden sm:block">
                    <div>⚡ {totalArchivedTokens.toLocaleString()} tokens</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Search Bar & Filter Tabs Controls */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Search Box */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by mission title, objective, ID, project folder, or cancellation reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Dropdown or Quick Badges */}
              <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto w-full sm:w-auto">
                <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                  <Filter className="w-3 h-3" /> Filter:
                </span>
                {(['all', 'completed', 'cancelled', 'active', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all shrink-0 ${
                      statusFilter === st
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {st === 'active' ? 'ongoing' : st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Missions List */}
          {loading ? (
            <div className="p-12 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading mission archive records from persistent storage...</p>
            </div>
          ) : filteredMissions.length === 0 ? (
            <div className="p-12 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-950/60 border border-purple-800 flex items-center justify-center text-purple-400 mx-auto">
                <Archive className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-semibold text-white">No archived missions found</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No archived missions match your current search or status filters. Try clearing your filters.'
                    : 'You have not archived or cancelled any missions yet. Completed or ongoing missions can be moved to the archive from the Mission Control board anytime.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                {searchQuery || statusFilter !== 'all' ? (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Go to Mission Control</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  Showing <strong className="text-slate-200">{filteredMissions.length}</strong> archived {filteredMissions.length === 1 ? 'mission' : 'missions'}
                </span>
              </div>

              <div className="space-y-3">
                {filteredMissions.map((mission) => {
                  const isExpanded = expandedMissionId === mission.id;
                  const completedTasks = mission.tasks.filter((t) => t.status === 'completed').length;
                  const totalTasks = mission.tasks.length;
                  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                  return (
                    <div
                      key={mission.id}
                      id={`archived-mission-card-${mission.id}`}
                      className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4 hover:border-slate-700 transition-all shadow-sm"
                    >
                      {/* Top Header / Metadata */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-bold text-white truncate">
                              {mission.title}
                            </h3>
                            {mission.type === 'side_quest' && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-950/60 border border-violet-800 text-violet-300 uppercase font-semibold">
                                SIDE QUEST
                              </span>
                            )}
                            {getStatusBadge(mission.status)}
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              ID: {mission.id.slice(0, 8)}
                            </span>
                            {mission.priority && (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                                {mission.priority} priority
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-2">
                            {mission.objective}
                          </p>

                          {/* Cancellation Banner / Reason */}
                          {mission.status === 'cancelled' && (
                            <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/80 flex items-start gap-2 text-xs text-rose-200">
                              <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5 min-w-0">
                                <span className="font-semibold text-rose-300">Cancellation Reason:</span>
                                <p className="text-rose-200/90 text-[11px] font-sans">
                                  {mission.cancellationReason || 'Cancelled by Founder'}
                                </p>
                                {mission.cancelledAt && (
                                  <span className="text-[10px] font-mono text-rose-400 block pt-0.5">
                                    Cancelled on {new Date(mission.cancelledAt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Project folder & PR badges */}
                          <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px] font-mono text-slate-400">
                            {mission.projectFolder && (
                              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-800 px-2 py-0.5 rounded flex items-center gap-1">
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
                              >
                                <GitPullRequest className="w-2.5 h-2.5" />
                                <span>PR #{mission.prNumber}</span>
                              </a>
                            )}
                            {mission.archivedAt && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Archive className="w-2.5 h-2.5 text-purple-400" />
                                <span>Archived {new Date(mission.archivedAt).toLocaleDateString()}</span>
                              </span>
                            )}
                          </div>

                          {/* Token & LLM Cost Counter */}
                          <div className="pt-1.5">
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

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                          <button
                            onClick={() => setInspectingMission(mission)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors"
                            title="Inspect complete mission deliverables and task records"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>Inspect</span>
                          </button>

                          <button
                            id={`unarchive-btn-${mission.id}`}
                            onClick={() => handleUnarchive(mission.id, mission.title)}
                            disabled={actionInProgressId === mission.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 active:scale-95 text-white transition-all shadow disabled:opacity-50"
                            title="Restore this mission to active Mission Control board"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${actionInProgressId === mission.id ? 'animate-spin' : ''}`} />
                            <span>{actionInProgressId === mission.id ? 'Restoring...' : 'Restore to Active'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar & Tasks Accordion Trigger */}
                      <div className="border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex-1 max-w-xs bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className={`h-full transition-all duration-500 ${
                                mission.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : mission.status === 'cancelled'
                                  ? 'bg-rose-500'
                                  : 'bg-cyan-500'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {completedTasks}/{totalTasks} tasks ({progressPct}%)
                          </span>
                        </div>

                        {totalTasks > 0 && (
                          <button
                            onClick={() => setExpandedMissionId(isExpanded ? null : mission.id)}
                            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors self-start sm:self-auto bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800/60 px-2.5 py-1 rounded-lg"
                          >
                            <Workflow className="w-3.5 h-3.5 text-purple-400" />
                            <span>{isExpanded ? 'Hide Dependency Graph' : `View Dependency Graph (${totalTasks})`}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Visual Dependency Graph & Tasks Accordion */}
                      {isExpanded && totalTasks > 0 && (
                        <div className="pt-3 border-t border-slate-800/80 animate-fadeIn">
                          <TaskDependencyGraph
                            tasks={mission.tasks}
                            missionStatus={mission.status}
                            missionTitle={mission.title}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Full Mission Inspection Slide-over / Modal */}
        {inspectingMission && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-purple-950 text-purple-400 border border-purple-800 shrink-0">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white truncate">{inspectingMission.title}</h3>
                    {inspectingMission.type === 'side_quest' && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-950/60 border border-violet-800 text-violet-300 uppercase font-semibold">
                        SIDE QUEST
                      </span>
                    )}
                    <p className="text-xs font-mono text-slate-400 w-full">
                      ID: {inspectingMission.id} • Assigned: {inspectingMission.assignedAgent}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setInspectingMission(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto space-y-5 flex-1">
                {/* Status & Dates */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Status</span>
                    <div className="pt-0.5">{getStatusBadge(inspectingMission.status)}</div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Created</span>
                    <span className="text-slate-300 font-mono text-[11px]">
                      {new Date(inspectingMission.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Archived</span>
                    <span className="text-purple-300 font-mono text-[11px]">
                      {inspectingMission.archivedAt ? new Date(inspectingMission.archivedAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* LLM Token & Cost Breakdown */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">LLM Token Usage &amp; Operational Cost</h4>
                  <MissionCostCounter
                    costUsd={inspectingMission.costUsd}
                    costPhp={inspectingMission.costPhp}
                    totalTokensInput={inspectingMission.totalTokensInput}
                    totalTokensOutput={inspectingMission.totalTokensOutput}
                    totalTokens={inspectingMission.totalTokens}
                    llmCallsCount={inspectingMission.llmCallsCount}
                    modelsUsed={inspectingMission.modelsUsed}
                    modelUsageBreakdown={inspectingMission.modelUsageBreakdown}
                    compact={false}
                  />
                </div>

                {/* Cancellation Details */}
                {inspectingMission.status === 'cancelled' && (
                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                      <Ban className="w-4 h-4 text-rose-400" />
                      <span>Cancellation Record</span>
                    </div>
                    <p className="text-xs text-rose-200">
                      {inspectingMission.cancellationReason || 'Cancelled by Founder'}
                    </p>
                    {inspectingMission.cancelledAt && (
                      <span className="text-[10px] font-mono text-rose-400 block pt-1">
                        Timestamp: {new Date(inspectingMission.cancelledAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Objective */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Mission Objective</h4>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
                    {inspectingMission.objective}
                  </div>
                </div>

                {/* Workspace Folder & GitHub PR */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Workspace &amp; Version Control</h4>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    {inspectingMission.projectFolder && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Project Directory:</span>
                        <span className="font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          projects/{inspectingMission.projectFolder}/
                        </span>
                      </div>
                    )}
                    {inspectingMission.prNumber ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Consolidated PR:</span>
                        <a
                          href={inspectingMission.prUrl || `https://github.com/froilandzngarcia/neptena-os/pull/${inspectingMission.prNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-purple-300 hover:text-purple-200 underline flex items-center gap-1"
                        >
                          <span>PR #{inspectingMission.prNumber}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-slate-500 italic text-[11px]">No GitHub Pull Request associated with this mission.</div>
                    )}
                  </div>
                </div>

                {/* Tasks & Dependency Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Associated Tasks &amp; Execution Pipeline ({inspectingMission.tasks.length})
                  </h4>
                  <TaskDependencyGraph
                    tasks={inspectingMission.tasks}
                    missionStatus={inspectingMission.status}
                    missionTitle={inspectingMission.title}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between gap-3">
                <button
                  onClick={() => setInspectingMission(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Close
                </button>

                <button
                  onClick={() => handleUnarchive(inspectingMission.id, inspectingMission.title)}
                  disabled={actionInProgressId === inspectingMission.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${actionInProgressId === inspectingMission.id ? 'animate-spin' : ''}`} />
                  <span>Restore to Active Mission Control</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
