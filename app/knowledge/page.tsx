'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  CheckCircle2,
  FileText,
  RefreshCw,
  ArrowLeft,
  Search,
  Sparkles,
  Check,
  Send,
  Layers,
  ChevronRight,
  Database,
  Bot,
  Rocket,
  FileCheck,
  Edit3,
  Trash2,
  Save,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  Archive
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import UserSessionNav from '@/components/UserSessionNav';
import { KnowledgeDocument } from '@/schemas/repositories';

const DOMAINS = ['all', 'company', 'market', 'growth', 'development', 'decisions', 'products'] as const;

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form State (Create Draft)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDomain, setNewDomain] = useState('growth');
  const [newContent, setNewContent] = useState('');
  const [newConfidence, setNewConfidence] = useState(0.85);
  const [newSources, setNewSources] = useState('docs/plan.md');
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit / Refine State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDomain, setEditDomain] = useState('company');
  const [editStatus, setEditStatus] = useState<KnowledgeDocument['status']>('draft');
  const [editConfidence, setEditConfidence] = useState(0.85);
  const [editSources, setEditSources] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Delete State / Modal
  const [docToDelete, setDocToDelete] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    try {
      const url = selectedDomain === 'all' ? '/api/knowledge' : `/api/knowledge?domain=${selectedDomain}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.documents)) {
        setDocuments(data.documents);
        if (!selectedDoc && data.documents.length > 0) {
          setSelectedDoc(data.documents[0]);
        } else if (selectedDoc) {
          const fresh = data.documents.find((d: KnowledgeDocument) => d.id === selectedDoc.id);
          if (fresh) {
            setSelectedDoc(fresh);
          }
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDomain, selectedDoc]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const url = selectedDomain === 'all' ? '/api/knowledge' : `/api/knowledge?domain=${selectedDomain}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!ignore && data?.success && Array.isArray(data.documents)) {
          setDocuments(data.documents);
          if (data.documents.length > 0) {
            setSelectedDoc((prev) => {
              if (!prev) return data.documents[0];
              const match = data.documents.find((d: KnowledgeDocument) => d.id === prev.id);
              return match || data.documents[0];
            });
          }
        }
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
  }, [selectedDomain]);

  const handleStartEdit = (doc: KnowledgeDocument) => {
    setSelectedDoc(doc);
    setEditTitle(doc.title);
    setEditDomain(doc.domain);
    setEditStatus(doc.status);
    setEditConfidence(doc.confidence ?? 0.85);
    setEditSources(Array.isArray(doc.sources) ? doc.sources.join('\n') : '');
    setEditContent(doc.content);
    setIsEditing(true);
    setPreviewMode(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setPreviewMode(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;
    if (!editTitle.trim() || !editContent.trim()) {
      setFormFeedback({ type: 'error', message: 'Title and content cannot be empty.' });
      return;
    }

    setSavingEdit(true);
    setFormFeedback(null);

    try {
      const sourcesArray = editSources
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: selectedDoc.id,
          title: editTitle.trim(),
          domain: editDomain,
          status: editStatus,
          confidence: Number(editConfidence),
          sources: sourcesArray,
          content: editContent.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update document');
      }

      setFormFeedback({
        type: 'success',
        message: `Document "${data.document?.title || editTitle}" refined and saved successfully.`,
      });

      if (data.document) {
        setSelectedDoc(data.document);
      }
      setIsEditing(false);
      await fetchDocuments(true);
    } catch (err: unknown) {
      setFormFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error updating knowledge document',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    setFormFeedback(null);

    try {
      const res = await fetch(`/api/knowledge?id=${encodeURIComponent(docToDelete.id)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete document');
      }

      setFormFeedback({
        type: 'success',
        message: `Document "${docToDelete.title}" removed completely from knowledge base.`,
      });

      const remaining = documents.filter((d) => d.id !== docToDelete.id);
      setDocuments(remaining);
      if (selectedDoc?.id === docToDelete.id) {
        setSelectedDoc(remaining.length > 0 ? remaining[0] : null);
        setIsEditing(false);
      }
      setDocToDelete(null);
    } catch (err: unknown) {
      setFormFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error deleting document',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      setFormFeedback({ type: 'error', message: 'Title and content are required.' });
      return;
    }

    setSubmitting(true);
    setFormFeedback(null);

    try {
      const sourcesArray = newSources
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_draft',
          domain: newDomain,
          title: newTitle.trim(),
          content: newContent.trim(),
          confidence: Number(newConfidence),
          sources: sourcesArray,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create draft');
      }

      setFormFeedback({
        type: 'success',
        message: `Draft created successfully in /company/${newDomain}/ with status [draft]!`,
      });

      // Clear form
      setNewTitle('');
      setNewContent('');
      setShowCreateForm(false);
      setSelectedDoc(data.document);

      // Refresh list
      await fetchDocuments(true);
    } catch (err: unknown) {
      setFormFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error creating draft document',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkCanonical = async (id: string) => {
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_canonical',
          id,
        }),
      });

      const data = await res.json();
      if (data.success && data.document) {
        setSelectedDoc(data.document);
        await fetchDocuments(true);
        setFormFeedback({
          type: 'success',
          message: `Document "${data.document.title}" marked as canonical!`,
        });
      }
    } catch (err) {
      console.error('Failed to mark canonical:', err);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadge = (status: KnowledgeDocument['status']) => {
    switch (status) {
      case 'canonical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> canonical
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950 text-amber-300 border border-amber-800">
            <Sparkles className="w-3 h-3 text-amber-400" /> draft
          </span>
        );
      case 'superseded':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800">
            superseded
          </span>
        );
    }
  };

  return (
    <AuthGuard
      fallbackTitle="Company Knowledge Base Chamber"
      fallbackDescription="Company knowledge synthesis, domain rules, and frontmatter documentation require authenticated Founder credentials."
    >
      <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-16">
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 sm:px-6 py-2 transition-all">
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
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-md text-white font-bold text-xs sm:text-sm shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h1 className="text-xs sm:text-sm md:text-base font-semibold tracking-tight text-white truncate">
                      Knowledge Base
                    </h1>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
                      /company §8
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">Canonical Markdown Store with YAML Frontmatter</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="create-draft-btn"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-all shrink-0 leading-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Create Draft</span>
                  <span className="sm:hidden">Draft</span>
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
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 text-cyan-200 border border-cyan-800 shrink-0 shadow-sm leading-none"
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Feedback message banner with X close button */}
        {formFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-md animate-fadeIn ${
              formFeedback.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                : 'bg-rose-950/70 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {formFeedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-medium">{formFeedback.message}</span>
            </div>
            <button
              id="dismiss-feedback-btn"
              type="button"
              onClick={() => setFormFeedback(null)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-black/20 transition-colors shrink-0"
              title="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Create Draft Form Dropdown */}
        {showCreateForm && (
          <section id="create-draft-section" className="rounded-2xl border border-cyan-800/80 bg-slate-900/90 p-5 sm:p-6 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Create New Draft Document</h2>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Developer Inbound Playbook"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Domain</label>
                  <select
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    {DOMAINS.filter((d) => d !== 'all').map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Markdown Content (Body)
                </label>
                <textarea
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="## Summary&#10;Key findings and strategic principles..."
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confidence (0.0 - 1.0)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={newConfidence}
                    onChange={(e) => setNewConfidence(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Sources (One per line)
                  </label>
                  <input
                    type="text"
                    value={newSources}
                    onChange={(e) => setNewSources(e.target.value)}
                    placeholder="docs/plan.md, https://..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Saving Draft...' : 'Save Draft Document'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Domain Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {DOMAINS.map((domain) => (
              <button
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-all whitespace-nowrap ${
                  selectedDomain === domain
                    ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {domain}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Split View: Documents List + Document Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Document List */}
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>DOCUMENTS ({filteredDocs.length})</span>
              <button
                onClick={() => fetchDocuments(true)}
                disabled={refreshing}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loading ? (
              <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-500">
                Loading Markdown documents...
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No documents found for this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setIsEditing(false);
                    }}
                    className={`group p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDoc?.id === doc.id
                        ? 'bg-slate-900 border-cyan-600 shadow-md ring-1 ring-cyan-500/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="text-xs font-semibold text-white truncate">{doc.title}</h3>
                      {getStatusBadge(doc.status)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="text-cyan-400">{doc.domain}</span>
                      <div className="flex items-center gap-2">
                        <span>Conf: {Math.round(doc.confidence * 100)}%</span>
                        {/* Quick action buttons on item */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Edit / Refine Document"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(doc);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-cyan-900/80 hover:text-cyan-300 text-slate-400 transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title="Delete Document Completely"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocToDelete(doc);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-900/80 hover:text-rose-300 text-slate-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Document Inspector / Editor */}
          <div className="lg:col-span-7">
            {selectedDoc ? (
              isEditing ? (
                /* Interactive Document Editor / Refiner */
                <div className="rounded-2xl border border-cyan-800/80 bg-slate-900/95 p-5 sm:p-6 space-y-4 shadow-2xl animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-cyan-400" />
                      <div>
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                          Edit &amp; Refine Document
                        </h2>
                        <p className="text-[11px] font-mono text-slate-400">ID: {selectedDoc.id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingEdit ? 'Saving...' : 'Save & Refine'}</span>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSaveEdit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Document Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          required
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Domain Chamber</label>
                        <select
                          value={editDomain}
                          onChange={(e) => setEditDomain(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        >
                          {DOMAINS.filter((d) => d !== 'all').map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as KnowledgeDocument['status'])}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        >
                          <option value="draft">draft</option>
                          <option value="canonical">canonical</option>
                          <option value="superseded">superseded</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Confidence (0.0 - 1.0)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={editConfidence}
                          onChange={(e) => setEditConfidence(parseFloat(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Sources (line-separated)</label>
                        <input
                          type="text"
                          value={editSources}
                          onChange={(e) => setEditSources(e.target.value)}
                          placeholder="docs/plan.md, https://..."
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                    </div>

                    {/* Markdown Content Section with Editor & Preview */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-300">
                          Markdown Content Section
                        </label>
                        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setPreviewMode(false)}
                            className={`px-2.5 py-1 rounded-md transition-colors ${
                              !previewMode ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMode(true)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                              previewMode ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                        </div>
                      </div>

                      {!previewMode ? (
                        <textarea
                          rows={14}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="Write markdown content here..."
                          required
                          className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-mono leading-relaxed placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-y min-h-[260px]"
                        />
                      ) : (
                        <div className="prose prose-invert max-w-none text-xs text-slate-200 leading-relaxed bg-slate-950/90 p-4 rounded-xl border border-slate-800/80 whitespace-pre-wrap font-sans min-h-[260px]">
                          {editContent || <span className="text-slate-500 italic">No content to preview</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingEdit ? 'Saving Document...' : 'Save & Refine Document'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* Viewing Mode: Document Inspector */
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-4 shadow-xl">
                  {/* Header info & Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-base font-bold text-white">{selectedDoc.title}</h2>
                        {getStatusBadge(selectedDoc.status)}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">ID: {selectedDoc.id}</p>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto">
                      {selectedDoc.status === 'draft' && (
                        <button
                          onClick={() => handleMarkCanonical(selectedDoc.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Promote to Canonical</span>
                        </button>
                      )}
                      <button
                        id="edit-doc-btn"
                        onClick={() => handleStartEdit(selectedDoc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700/80 hover:bg-cyan-600 text-white border border-cyan-500/30 shadow transition-all"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit / Refine</span>
                      </button>
                      <button
                        id="delete-doc-btn"
                        onClick={() => setDocToDelete(selectedDoc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 shadow transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* YAML Frontmatter Inspector Box */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                      <span>YAML Frontmatter</span>
                      <span className="text-cyan-400">{selectedDoc.filePath || `/company/${selectedDoc.domain}.md`}</span>
                    </div>
                    <div className="text-slate-300 grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div><span className="text-slate-500">domain:</span> {selectedDoc.domain}</div>
                      <div><span className="text-slate-500">status:</span> {selectedDoc.status}</div>
                      <div><span className="text-slate-500">confidence:</span> {selectedDoc.confidence}</div>
                      <div><span className="text-slate-500">sources:</span> {selectedDoc.sources.join(', ') || 'None'}</div>
                      <div className="col-span-2"><span className="text-slate-500">created:</span> {selectedDoc.created}</div>
                      <div className="col-span-2"><span className="text-slate-500">updated:</span> {selectedDoc.updated}</div>
                    </div>
                  </div>

                  {/* Markdown Content body */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono text-slate-400 uppercase">Markdown Content</span>
                      <button
                        onClick={() => handleStartEdit(selectedDoc)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Content</span>
                      </button>
                    </div>
                    <div className="prose prose-invert max-w-none text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 whitespace-pre-wrap font-sans">
                      {selectedDoc.content}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-xs text-slate-500">
                Select a document from the left to view its frontmatter and Markdown content.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-md w-full rounded-2xl border border-rose-800/80 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950 text-rose-400 border border-rose-800">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Knowledge Document</h3>
                <p className="text-xs text-slate-400">Permanent removal confirmation</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
              <p>
                Are you sure you want to permanently delete <strong className="text-white">&ldquo;{docToDelete.title}&rdquo;</strong> from the <span className="font-mono text-cyan-400">{docToDelete.domain}</span> repository?
              </p>
              <p className="text-[11px] text-rose-300 font-mono">
                This removes the document markdown file completely from the knowledge store.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDoc}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Delete Completely'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  </AuthGuard>
  );
}
