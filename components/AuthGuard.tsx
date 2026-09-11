'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Lock, 
  ShieldCheck 
} from 'lucide-react';
import { 
  getFirebaseAuth, 
  onAuthStateChanged, 
  type User 
} from '@/lib/firebase';

interface AuthGuardProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

export default function AuthGuard({
  children,
  fallbackTitle = 'Authentication Required',
  fallbackDescription = 'You must be signed in with a Founder or CEO account to access Neptena-OS features and autonomous agent operations.',
}: AuthGuardProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Initial Auth Token Verification Screen
  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 text-white font-bold text-lg animate-pulse">
              N
            </div>
            <div className="absolute -inset-1 border border-cyan-500/40 rounded-2xl animate-ping opacity-25" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-white tracking-wide">Neptena-OS Security Engine</h2>
            <p className="text-xs text-slate-400 font-mono">Authenticating Founder Credentials...</p>
          </div>
        </div>
      </main>
    );
  }

  // 2. Unauthenticated Access Gate
  if (!user) {
    const redirectParam = pathname && pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : '';
    const loginUrl = `/login${redirectParam}`;

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 selection:bg-cyan-500/30 selection:text-cyan-200">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-cyan-950/20 text-center">
          {/* Lock Badge */}
          <div className="relative mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          {/* Headline & Explanation */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              <span>Restricted Founder Zone</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">{fallbackTitle}</h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              {fallbackDescription}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <Link
              id="gate-login-btn"
              href={loginUrl}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/25 active:scale-[0.98] transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Sign In / Create Founder Account</span>
            </Link>
          </div>

          {/* Footer note */}
          <p className="text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-800/80">
            Neptena-OS Dual-Agent Autonomous Control
          </p>
        </div>
      </main>
    );
  }

  // 3. User is Authenticated -> Render Feature Children
  return <>{children}</>;
}
