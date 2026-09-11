'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Sparkles,
  Bot,
  BookOpen,
  Rocket,
  ShieldCheck,
  Layers,
  ChevronRight,
  FileCode,
  FileText,
  GitCompare,
  Database,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  Eye,
  Copy,
  Trash2,
  Plus,
  Play,
  Filter,
  Flame,
  Archive,
  Folder,
  Download
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import UserSessionNav from '@/components/UserSessionNav';
import { ArtifactEntity, KnowledgeDocument } from '@/schemas/repositories';

type UnifiedItemType = 'artifact' | 'knowledge';

interface UnifiedReviewItem {
  uid: string; // unique key for list
  id: string;
  sourceType: UnifiedItemType;
  title: string;
  categoryOrDomain: string;
  typeBadge: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'draft' | 'canonical' | 'superseded' | 'archived';
  isPending: boolean;
  isApproved: boolean;
  content: string;
  version?: number;
  confidence?: number;
  sources?: string[];
  filePath?: string;
  projectFilePath?: string;
  missionId?: string;
  taskId?: string;
  approvedBy?: string;
  approvedAt?: number;
  createdAtTime: number;
  createdAtString: string;
}

export default function ArtifactsReviewPage() {
  const [artifacts, setArtifacts] = useState<ArtifactEntity[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'artifacts' | 'knowledge'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Action in-flight states
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; message: string; details?: string } | null>(null);

  // Inspector modal
  const [inspectingItem, setInspectingItem] = useState<UnifiedReviewItem | null>(null);
  const [copied, setCopied] = useState(false);

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

      const [artData, knowData] = await Promise.all([
        safeFetch('/api/artifacts'),
        safeFetch('/api/knowledge'),
      ]);

      if (artData?.success && Array.isArray(artData.artifacts)) {
        setArtifacts(artData.artifacts);
      }
      if (knowData?.success && Array.isArray(knowData.documents)) {
        setKnowledgeDocs(knowData.documents);
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
    async function init() {
      try {
        await fetchData();
      } catch {
        // Fallback silently
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    init();

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

  // Convert raw artifacts and knowledge docs into a unified list
  const unifiedItems: UnifiedReviewItem[] = React.useMemo(() => {
    const items: UnifiedReviewItem[] = [];

    // Process Artifacts
    for (const art of artifacts) {
      const status = (art.status || 'pending_approval') as UnifiedReviewItem['status'];
      const isPending = status === 'pending_approval' || status === 'draft';
      const isApproved = status === 'approved';
      const createdTime = art.createdAt || 0;

      items.push({
        uid: `artifact-${art.id}`,
        id: art.id,
        sourceType: 'artifact',
        title: art.title,
        categoryOrDomain: art.missionId || 'mission-output',
        typeBadge: art.type || 'markdown',
        status,
        isPending,
        isApproved,
        content: art.content,
        version: art.version,
        projectFilePath: art.projectFilePath,
        missionId: art.missionId,
        taskId: art.taskId,
        approvedBy: art.approvedBy,
        approvedAt: art.approvedAt,
        createdAtTime: createdTime,
        createdAtString: createdTime ? new Date(createdTime).toLocaleString() : 'N/A',
      });
    }

    // Process Knowledge Documents
    for (const doc of knowledgeDocs) {
      const status = (doc.status || 'draft') as UnifiedReviewItem['status'];
      const isPending = status === 'draft';
      const isApproved = status === 'canonical';
      const parsedTime = doc.created ? new Date(doc.created).getTime() : 0;
      const createdTime = isNaN(parsedTime) ? 0 : parsedTime;

      items.push({
        uid: `knowledge-${doc.id}`,
        id: doc.id,
        sourceType: 'knowledge',
        title: doc.title,
        categoryOrDomain: doc.domain,
        typeBadge: 'company-knowledge',
        status,
        isPending,
        isApproved,
        content: doc.content,
        confidence: doc.confidence,
        sources: doc.sources,
        filePath: doc.filePath,
        createdAtTime: createdTime,
        createdAtString: doc.created ? new Date(doc.created).toLocaleString() : 'N/A',
      });
    }

    // Sort newest first
    items.sort((a, b) => b.createdAtTime - a.createdAtTime);
    return items;
  }, [artifacts, knowledgeDocs]);

  // Filtering
  const filteredItems = unifiedItems.filter((item) => {
    // Source filter
    if (sourceFilter === 'artifacts' && item.sourceType !== 'artifact') return false;
    if (sourceFilter === 'knowledge' && item.sourceType !== 'knowledge') return false;

    // Status filter
    if (statusFilter === 'pending' && !item.isPending) return false;
    if (statusFilter === 'approved' && !item.isApproved) return false;
    if (statusFilter === 'rejected' && (item.status !== 'rejected' && item.status !== 'superseded' && item.status !== 'archived')) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDomain = item.categoryOrDomain.toLowerCase().includes(q);
      const matchId = item.id.toLowerCase().includes(q);
      const matchContent = item.content.toLowerCase().includes(q);
      if (!matchTitle && !matchDomain && !matchId && !matchContent) return false;
    }

    return true;
  });

  // Calculate Metrics
  const totalCount = unifiedItems.length;
  const pendingCount = unifiedItems.filter((i) => i.isPending).length;
  const approvedCount = unifiedItems.filter((i) => i.isApproved).length;
  const rejectedCount = unifiedItems.filter((i) => i.status === 'rejected' || i.status === 'superseded' || i.status === 'archived').length;
  const approvalRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

  // One-tap Approve Handler
  const handleOneTapApprove = async (item: UnifiedReviewItem) => {
    setApprovingId(item.uid);
    try {
      if (item.sourceType === 'artifact') {
        const res = await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            id: item.id,
            status: 'approved',
            approvedBy: 'Founder / CEO (One-Tap)',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to approve artifact in Firestore');
        }

        // Optimistic / Local update in artifacts state
        setArtifacts((prev) =>
          prev.map((a) => (a.id === item.id ? {
            ...a,
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: 'Founder / CEO (One-Tap)',
            projectFilePath: data.projectFilePath || a.projectFilePath,
            projectFolder: data.projectFolder || a.projectFolder,
          } : a))
        );

        setToastMessage({
          type: 'success',
          message: `Approved Artifact: "${item.title}"`,
          details: data.projectFilePath
            ? `Stored in mission folder [${data.projectFilePath}] and recorded in Firestore`
            : `Firestore document [artifacts/${item.id}] status updated to 'approved'`,
        });
      } else {
        // Knowledge Doc -> Mark Canonical
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark_canonical',
            id: item.id,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to mark knowledge document canonical');
        }

        // Optimistic / Local update in knowledge docs state
        setKnowledgeDocs((prev) =>
          prev.map((d) => (d.id === item.id ? { ...d, status: 'canonical', updated: new Date().toISOString() } : d))
        );

        setToastMessage({
          type: 'success',
          message: `Approved Knowledge Doc: "${item.title}"`,
          details: `Frontmatter status in [${item.filePath || item.id}] promoted to 'canonical'`,
        });
      }

      // If modal was open for this item, update modal state
      if (inspectingItem && inspectingItem.uid === item.uid) {
        setInspectingItem({
          ...inspectingItem,
          status: item.sourceType === 'artifact' ? 'approved' : 'canonical',
          isApproved: true,
          isPending: false,
        });
      }

      // Background refresh to ensure fresh sync
      fetchData(true);
    } catch (err: unknown) {
      console.error('Approve action failed:', err);
      setToastMessage({
        type: 'error',
        message: 'Approval Action Failed',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApprovingId(null);
    }
  };

  // Reject / Revert to Draft action
  const handleRejectOrDraft = async (item: UnifiedReviewItem, newStatus: 'rejected' | 'draft' | 'pending_approval') => {
    setRejectingId(item.uid);
    try {
      if (item.sourceType === 'artifact') {
        const res = await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_status',
            id: item.id,
            status: newStatus === 'draft' ? 'pending_approval' : newStatus,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update artifact status');
        }
        setArtifacts((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, status: newStatus === 'draft' ? 'pending_approval' : newStatus } : a))
        );
      } else {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_status',
            id: item.id,
            status: newStatus === 'rejected' ? 'superseded' : 'draft',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update knowledge document status');
        }
        setKnowledgeDocs((prev) =>
          prev.map((d) => (d.id === item.id ? { ...d, status: newStatus === 'rejected' ? 'superseded' : 'draft' } : d))
        );
      }

      setToastMessage({
        type: 'info',
        message: `Status updated for "${item.title}"`,
        details: `Updated to ${newStatus}`,
      });

      if (inspectingItem && inspectingItem.uid === item.uid) {
        setInspectingItem({
          ...inspectingItem,
          status: newStatus,
          isPending: newStatus === 'draft' || newStatus === 'pending_approval',
          isApproved: false,
        });
      }

      fetchData(true);
    } catch (err: unknown) {
      console.error('Status update failed:', err);
      setToastMessage({
        type: 'error',
        message: 'Status Update Failed',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRejectingId(null);
    }
  };

  const handleCopyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getItemIcon = (item: UnifiedReviewItem) => {
    if (item.sourceType === 'knowledge') {
      return <BookOpen className="w-4 h-4 text-emerald-400" />;
    }
    switch (item.typeBadge) {
      case 'diff':
        return <GitCompare className="w-4 h-4 text-amber-400" />;
      case 'code':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'research_report':
        return <Sparkles className="w-4 h-4 text-indigo-400" />;
      default:
        return <FileText className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <AuthGuard
      fallbackTitle="Review & Approvals Chamber"
      fallbackDescription="Founder approval gate, artifact verification, and knowledge document promotion require authenticated Founder credentials."
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
        {/* Top Header */}
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 sm:px-6 py-2 transition-all">
          <div className="max-w-6xl mx-auto flex flex-col divide-y divide-slate-800/80">
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
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-md text-white font-bold text-xs sm:text-sm shrink-0">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h1 className="text-xs sm:text-sm md:text-base font-semibold tracking-tight text-white truncate">Review &amp; Approvals</h1>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="hidden sm:inline">Real Firestore + Disk Live</span>
                      <span className="sm:hidden">Live</span>
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">Artifacts &amp; Knowledge documents grouped by status with one-tap approval</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="refresh-artifacts-btn"
                  onClick={() => fetchData(true)}
                  disabled={refreshing || loading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
                  title="Refresh live data"
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
                <Rocket className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
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
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0 leading-none"
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
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 text-cyan-200 border border-cyan-800 shrink-0 shadow-sm leading-none"
              >
                <FileCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Artifacts</span>
                <span className="sm:hidden">Review</span>
              </Link>
            </div>
          </div>
        </header>

      {/* Main Content Container */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-200'
              : 'bg-cyan-950/80 border-cyan-800 text-cyan-200'
          }`}>
            <div className="flex items-start gap-2.5">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : toastMessage.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-semibold">{toastMessage.message}</p>
                {toastMessage.details && (
                  <p className="text-xs opacity-85 mt-0.5 font-mono">{toastMessage.details}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Metrics Dashboard Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Items</p>
              <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{artifacts.length} Artifacts + {knowledgeDocs.length} Docs</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center">
              <Layers className="w-5 h-5 text-slate-300" />
            </div>
          </div>

          <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm transition-all ${
            pendingCount > 0
              ? 'bg-amber-950/20 border-amber-800/60 ring-1 ring-amber-500/20'
              : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div>
              <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                Needs Approval
              </p>
              <p className="text-2xl font-bold text-amber-300 mt-1">{pendingCount}</p>
              <p className="text-[11px] text-amber-500/80 mt-0.5">Pending one-tap review</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-800 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs font-medium text-emerald-400">Approved / Canonical</p>
              <p className="text-2xl font-bold text-emerald-300 mt-1">{approvedCount}</p>
              <p className="text-[11px] text-emerald-500/80 mt-0.5">Committed &amp; active</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs font-medium text-cyan-400">Approval Rate</p>
              <p className="text-2xl font-bold text-cyan-300 mt-1">{approvalRate}%</p>
              <p className="text-[11px] text-cyan-500/80 mt-0.5">{rejectedCount} rejected/superseded</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-800 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
        </section>

        {/* Filter Toolbar */}
        <section className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 overflow-x-auto">
            <button
              id="filter-all-btn"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Items ({totalCount})
            </button>
            <button
              id="filter-pending-btn"
              onClick={() => setStatusFilter('pending')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === 'pending'
                  ? 'bg-amber-900/70 text-amber-200 border border-amber-700/80 shadow-sm font-semibold'
                  : 'text-amber-400 hover:bg-amber-950/40'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Review ({pendingCount})</span>
            </button>
            <button
              id="filter-approved-btn"
              onClick={() => setStatusFilter('approved')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === 'approved'
                  ? 'bg-emerald-900/70 text-emerald-200 border border-emerald-700/80 shadow-sm font-semibold'
                  : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approved / Canonical ({approvedCount})</span>
            </button>
            <button
              id="filter-rejected-btn"
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === 'rejected'
                  ? 'bg-slate-800 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rejected ({rejectedCount})
            </button>
          </div>

          {/* Source Type + Search Filter */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Source Segment */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  sourceFilter === 'all' ? 'bg-cyan-900/70 text-cyan-200 font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Sources
              </button>
              <button
                onClick={() => setSourceFilter('artifacts')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  sourceFilter === 'artifacts' ? 'bg-cyan-900/70 text-cyan-200 font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Artifacts ({artifacts.length})
              </button>
              <button
                onClick={() => setSourceFilter('knowledge')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  sourceFilter === 'knowledge' ? 'bg-cyan-900/70 text-cyan-200 font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Knowledge Docs ({knowledgeDocs.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by title or text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
          </div>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-300 font-medium">Loading live artifacts and knowledge docs...</p>
            <p className="text-xs text-slate-500 mt-1">Connecting to Firestore collection &amp; company markdown repository</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredItems.length === 0 && (
          <div className="p-12 text-center rounded-xl bg-slate-900/30 border border-slate-800/80 space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">No items found matching filter</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'
                  ? 'Try clearing your search query or switching status tabs.'
                  : 'No artifacts or knowledge documents currently exist. Launch missions or dispatch tasks from Mission Control to generate reviewable deliverables.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              {(searchQuery || statusFilter !== 'all' || sourceFilter !== 'all') ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSourceFilter('all');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  Clear Filters
                </button>
              ) : (
                <Link
                  href="/"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md active:scale-95 transition-all"
                >
                  <Rocket className="w-4 h-4" />
                  <span>Go to Mission Control</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* List of Unified Review Items */}
        {!loading && filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isApproving = approvingId === item.uid;
              const isRejecting = rejectingId === item.uid;

              return (
                <div
                  key={item.uid}
                  id={`review-card-${item.id}`}
                  className={`p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    item.isPending
                      ? 'bg-slate-900/80 border-amber-700/50 hover:border-amber-500/80 shadow-md shadow-amber-950/20 ring-1 ring-amber-500/10'
                      : item.isApproved
                      ? 'bg-slate-900/50 border-emerald-900/60 hover:border-emerald-700/60'
                      : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 opacity-80'
                  }`}
                >
                  {/* Left Column: Icon + Meta + Title */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                      item.isPending
                        ? 'bg-amber-950/50 border-amber-800/80 text-amber-300'
                        : item.isApproved
                        ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      {getItemIcon(item)}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Top Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Source Badge */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${
                          item.sourceType === 'artifact'
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                            : 'bg-purple-950/80 text-purple-300 border-purple-800'
                        }`}>
                          {item.sourceType === 'artifact' ? 'Firestore Artifact' : 'Knowledge Doc'}
                        </span>

                        {/* Status Badge */}
                        {item.status === 'pending_approval' || item.status === 'draft' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-700 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            {item.status === 'pending_approval' ? 'Pending Approval' : 'Draft Proposal'}
                          </span>
                        ) : item.status === 'approved' || item.status === 'canonical' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {item.status === 'approved' ? 'Approved' : 'Canonical'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.status}
                          </span>
                        )}

                        {/* Type / Category Tag */}
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.categoryOrDomain}
                        </span>

                        {item.confidence && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            {(item.confidence * 100).toFixed(0)}% conf
                          </span>
                        )}
                      </div>

                      {/* Document / Artifact Title */}
                      <h3
                        onClick={() => setInspectingItem(item)}
                        className="text-sm font-semibold text-white hover:text-cyan-300 cursor-pointer truncate transition-colors"
                        title={item.title}
                      >
                        {item.title}
                      </h3>

                      {/* Content Preview Snippet */}
                      <p className="text-xs text-slate-400 line-clamp-1 font-mono">
                        {item.content.replace(/^#+\s+/gm, '').replace(/[\n\r]+/g, ' ').slice(0, 140)}...
                      </p>

                      {/* Footer Metadata */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
                        <span>ID: <span className="font-mono text-slate-400">{item.id}</span></span>
                        <span>•</span>
                        <span>Created: {item.createdAtString}</span>
                        {item.approvedAt && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400">Approved: {new Date(item.approvedAt).toLocaleTimeString()}</span>
                          </>
                        )}
                        {item.approvedBy && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400">By: {item.approvedBy}</span>
                          </>
                        )}
                        {item.projectFilePath && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-400 font-mono flex items-center gap-1">
                              <Folder className="w-3 h-3 text-cyan-500" />
                              {item.projectFilePath}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: One-Tap Action Buttons */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {/* The Primary ONE-TAP APPROVE Button */}
                    {item.isPending ? (
                      <button
                        id={`approve-btn-${item.id}`}
                        onClick={() => handleOneTapApprove(item)}
                        disabled={isApproving || isRejecting}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-900/30 active:scale-95 transition-all disabled:opacity-50"
                        title="One-Tap Approve: immediately update status field in Firestore/disk"
                      >
                        {isApproving ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        )}
                        <span>Approve</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRejectOrDraft(item, 'draft')}
                        disabled={isApproving || isRejecting}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        title="Revert status back to draft / pending review"
                      >
                        <RefreshCw className="w-3 h-3 text-slate-400" />
                        <span>Revert to Draft</span>
                      </button>
                    )}

                    {/* Secondary Actions: Quick Reject */}
                    {item.isPending && (
                      <button
                        id={`reject-btn-${item.id}`}
                        onClick={() => handleRejectOrDraft(item, 'rejected')}
                        disabled={isApproving || isRejecting}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 text-slate-400 border border-slate-700 transition-colors"
                        title="Reject item"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reject</span>
                      </button>
                    )}

                    {/* Download Deliverable Link */}
                    <a
                      href={`/api/projects/file?${item.projectFilePath ? `path=${encodeURIComponent(item.projectFilePath)}&` : ''}id=${encodeURIComponent(item.id)}&download=true`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-emerald-950 hover:text-emerald-400 hover:border-emerald-800 text-slate-300 border border-slate-700 transition-colors"
                      title="Download Deliverable Document (.docx, .pptx, .svg, .html, .ts)"
                    >
                      <Download className="w-4 h-4" />
                    </a>

                    {/* Full Preview / Inspect Modal Button */}
                    <button
                      id={`inspect-btn-${item.id}`}
                      onClick={() => setInspectingItem(item)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                      title="Inspect full content and metadata"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Full Content Inspector & Metadata Drawer */}
        {inspectingItem && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
                    {getItemIcon(inspectingItem)}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white line-clamp-1">{inspectingItem.title}</h2>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-mono">{inspectingItem.sourceType === 'artifact' ? 'Firestore Artifact' : 'Company Knowledge Doc'}</span>
                      <span>•</span>
                      <span className="font-mono text-cyan-400">{inspectingItem.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyContent(inspectingItem.content)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                    title="Copy full content to clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={() => setInspectingItem(null)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body: Metadata Bar + Content */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Metadata Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Status</span>
                    <span className={`font-semibold capitalize ${
                      inspectingItem.isApproved ? 'text-emerald-400' : inspectingItem.isPending ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {inspectingItem.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Category / Domain</span>
                    <span className="font-mono text-slate-300">{inspectingItem.categoryOrDomain}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Created</span>
                    <span className="text-slate-300">{inspectingItem.createdAtString}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Storage Reference</span>
                    <span className="font-mono text-[11px] text-cyan-400 truncate block">
                      {inspectingItem.projectFilePath || inspectingItem.filePath || `artifacts/${inspectingItem.id}`}
                    </span>
                  </div>
                </div>

                {/* Content View */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Payload Content
                  </label>
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {inspectingItem.content}
                  </pre>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  {inspectingItem.isPending ? (
                    <span className="text-amber-400 font-medium">Ready for approval</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">Approved &amp; Synced to Database</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/projects/file?${inspectingItem.projectFilePath ? `path=${encodeURIComponent(inspectingItem.projectFilePath)}&` : ''}id=${encodeURIComponent(inspectingItem.id)}&download=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white shadow-sm transition-all"
                    title="Download Deliverable (.docx, .pptx, .svg, .html, .ts)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>

                  <button
                    onClick={() => setInspectingItem(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    Close
                  </button>

                  {inspectingItem.isPending && (
                    <button
                      onClick={() => handleOneTapApprove(inspectingItem)}
                      disabled={approvingId === inspectingItem.uid}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-50"
                    >
                      {approvingId === inspectingItem.uid ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      )}
                      <span>One-Tap Approve</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  </AuthGuard>
  );
}
