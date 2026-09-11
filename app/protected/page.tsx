'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  LogOut, 
  Cpu, 
  Database, 
  FileCode, 
  ArrowLeft, 
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { 
  getFirebaseAuth, 
  onAuthStateChanged, 
  logoutUser, 
  type User 
} from '@/lib/firebase';
import { getModelProviderConfig, type ModelProviderSettings } from '@/lib/config';

export default function ProtectedRoutePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [modelConfig] = useState<ModelProviderSettings>(() => getModelProviderConfig());

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await logoutUser();
      router.push('/login');
    } catch (err: unknown) {
      console.error('Sign out error:', err);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verifying Founder Security Tokens...</p>
        </div>
      </main>
    );
  }

  // Access Denied State (Protected Route Guard)
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-900/60 bg-slate-900/90 p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-950/80 border border-red-800/80 flex items-center justify-center text-red-400">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-white">401 • Protected Route Access Denied</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              This chamber requires an active authenticated session. Please sign in with your email/password or founder credentials.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              id="redirect-login-btn"
              href="/login?redirect=/protected"
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-cyan-600/20"
            >
              <ShieldCheck className="w-4 h-4" /> Go to Login Screen
            </Link>
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-slate-300 py-1"
            >
              Return to Public Overview
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Protected Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="p-1 rounded text-slate-400 hover:text-slate-200">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <Unlock className="w-3 h-3 text-emerald-400" /> Authenticated Route
                </span>
                <h1 className="text-sm font-semibold text-white">CEO Secure Chamber</h1>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {user.email || `Anonymous Founder (${user.uid.slice(0, 8)})`}
              </p>
            </div>
          </div>

          <button
            id="protected-signout-btn"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-95 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Verification Banner */}
        <section className="rounded-xl border border-emerald-800/80 bg-emerald-950/20 p-4 sm:p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-emerald-200">Protected Route Successfully Unlocked</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are viewing the authenticated CEO Orchestration chamber (`/protected`). Unauthenticated requests are blocked and redirected to `/login`.
            </p>
          </div>
        </section>

        {/* Model Provider Config readout (Environment-driven, not hardcoded) */}
        <section id="model-provider-config-card" className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Model Provider Environment Settings
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
              Provider: {modelConfig?.provider.toUpperCase()}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Loaded dynamically via <code className="text-cyan-300 font-mono text-[11px]">lib/config.ts</code> from environment configuration rather than hardcoded in source.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">CEO / Orchestrator</span>
              <p className="text-xs font-semibold text-cyan-300 font-mono truncate">{modelConfig?.models.ceo}</p>
              <div className="text-[10px] text-slate-400 pt-1">
                Temp: {modelConfig?.temperature.orchestrator} • Max Tokens: {modelConfig?.maxTokens.orchestrator}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">Growth Agent</span>
              <p className="text-xs font-semibold text-cyan-300 font-mono truncate">{modelConfig?.models.growth}</p>
              <div className="text-[10px] text-slate-400 pt-1">
                Temp: {modelConfig?.temperature.agent} • Max Tokens: {modelConfig?.maxTokens.agent}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">Development Agent</span>
              <p className="text-xs font-semibold text-cyan-300 font-mono truncate">{modelConfig?.models.development}</p>
              <div className="text-[10px] text-slate-400 pt-1">
                Temp: {modelConfig?.temperature.agent} • Max Tokens: {modelConfig?.maxTokens.agent}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">Ephemeral Worker</span>
              <p className="text-xs font-semibold text-cyan-300 font-mono truncate">{modelConfig?.models.worker}</p>
              <div className="text-[10px] text-slate-400 pt-1">
                Temp: {modelConfig?.temperature.worker} • Max Tokens: {modelConfig?.maxTokens.worker}
              </div>
            </div>
          </div>
        </section>

        {/* Repository Interfaces Overview */}
        <section id="repositories-spec-card" className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Registered Repository Interfaces
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              schemas/repositories.ts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { name: 'MissionRepository', desc: 'getById, listByFounder, create, update, delete, listByStatus' },
              { name: 'AgentRepository', desc: 'getById, listAll, updateStatus, assignMission' },
              { name: 'TaskRepository', desc: 'getById, listByMission, create, update, delete' },
              { name: 'ArtifactRepository', desc: 'getById, listByMission, create, update' },
              { name: 'ExecutionRepository', desc: 'getById, listByMission, recordExecution, completeExecution' },
              { name: 'ApprovalRepository', desc: 'getById, listPending, create, resolve' },
              { name: 'KnowledgeRepository', desc: 'getById, listCanonical, searchByKeyword, proposeDraft, promoteToCanonical, supersede' },
            ].map((repo) => (
              <div key={repo.name} className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 space-y-1">
                <span className="font-mono font-semibold text-cyan-300 text-xs block">{repo.name}</span>
                <p className="text-[11px] text-slate-400 font-mono">{repo.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Active Session Telemetry */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Active Session Security Context</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded bg-slate-950/80 border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">UID</span>
              <span className="font-mono text-slate-200 break-all text-[11px]">{user.uid}</span>
            </div>
            <div className="p-3 rounded bg-slate-950/80 border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">Provider / Auth Method</span>
              <span className="font-mono text-slate-200 text-[11px]">
                {user.isAnonymous ? 'Anonymous Solo Founder' : user.providerData?.[0]?.providerId || 'password'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
