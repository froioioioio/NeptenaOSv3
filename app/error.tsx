'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console
    console.error('Neptena-OS application error:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 selection:bg-cyan-500/30">
      <div className="w-full max-w-md p-8 rounded-2xl border border-rose-900/40 bg-slate-900/90 text-center space-y-6 shadow-2xl shadow-rose-950/20">
        <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
            System Fault Detected
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">Operation Interrupted</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error?.message || 'An unexpected anomaly occurred during orchestration.'}
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            id="error-retry-btn"
            onClick={() => reset()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retry</span>
          </button>
          <Link
            id="error-home-btn"
            href="/"
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/25 transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
