import React from 'react';
import Link from 'next/link';
import { Home, ShieldAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 selection:bg-cyan-500/30">
      <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800 bg-slate-900/90 text-center space-y-6 shadow-2xl">
        <div className="w-12 h-12 mx-auto rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            HTTP 404
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">Resource Not Located</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            The requested endpoint does not exist or has been relocated within the mission parameters.
          </p>
        </div>
        <div className="pt-2 flex justify-center">
          <Link
            id="not-found-home-btn"
            href="/"
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/25 transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Return to Mission Control</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
