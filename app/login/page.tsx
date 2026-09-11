'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Lock, 
  Mail, 
  KeyRound, 
  UserPlus, 
  LogIn, 
  ArrowLeft, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Bot,
  LogOut,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  getFirebaseAuth, 
  onAuthStateChanged, 
  loginWithEmailPassword, 
  registerWithEmailPassword, 
  loginWithGoogle, 
  logoutUser,
  type User 
} from '@/lib/firebase';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/';

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters in length.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await registerWithEmailPassword(trimmedEmail, password);
        setSuccessMsg(`Account created for ${trimmedEmail}! Entering Mission Control...`);
      } else {
        await loginWithEmailPassword(trimmedEmail, password);
        setSuccessMsg(`Welcome back, ${trimmedEmail}! Redirecting...`);
      }
      
      setTimeout(() => {
        router.push(redirectTarget);
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setGoogleLoading(true);
    try {
      const res = await loginWithGoogle();
      setSuccessMsg(`Authenticated as ${res.user.email || 'Founder'}! Redirecting to Mission Control...`);
      setTimeout(() => {
        router.push(redirectTarget);
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Google SSO sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignOutCurrent = async () => {
    setSigningOut(true);
    setErrorMsg(null);
    try {
      await logoutUser();
      setCurrentUser(null);
      setSuccessMsg('Signed out successfully.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Brand Header */}
      <div className="flex items-center justify-between">
        <Link 
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>
        <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1">
          <Bot className="w-3.5 h-3.5" /> Neptena-OS
        </span>
      </div>

      {/* Main Auth Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/20 space-y-5">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Founder Gateway</h1>
          <p className="text-xs text-slate-400">
            Sign in or create your Founder profile to unlock autonomous agent dispatch and mission control
          </p>
        </div>

        {/* Current Active Session Card */}
        {currentUser && (
          <div className="p-3.5 rounded-xl bg-cyan-950/60 border border-cyan-800/80 text-xs text-cyan-200 space-y-3 animate-fadeIn">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Active Session</span>
                <span className="font-mono font-semibold text-white truncate block">
                  {currentUser.email || 'Founder Account'}
                </span>
                <span className="text-[10px] text-cyan-300">UID: {currentUser.uid.slice(0, 14)}...</span>
              </div>
              <button
                id="login-signout-btn"
                type="button"
                onClick={handleSignOutCurrent}
                disabled={signingOut}
                className="px-2 py-1 text-[11px] text-rose-300 hover:text-white bg-rose-950/80 border border-rose-800/80 rounded flex items-center gap-1 active:scale-95 transition-all"
                title="Sign out of current account"
              >
                <LogOut className="w-3 h-3" />
                <span>{signingOut ? 'Signing out...' : 'Switch'}</span>
              </button>
            </div>

            <button
              id="enter-mission-control-btn"
              onClick={() => router.push(redirectTarget)}
              className="w-full py-2 px-3 text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span>Enter Mission Control →</span>
            </button>
          </div>
        )}

        {/* Mode Switcher: Sign In vs Create Account */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            id="tab-signin"
            type="button"
            onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-2 text-xs font-medium rounded-md transition-all ${
              mode === 'signin' 
                ? 'bg-slate-800 text-white shadow-sm font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            id="tab-register"
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-2 text-xs font-medium rounded-md transition-all ${
              mode === 'register' 
                ? 'bg-slate-800 text-white shadow-sm font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800/80 text-xs text-rose-200 flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-xs text-emerald-200 flex items-start gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>{successMsg}</p>
          </div>
        )}

        {/* Non-SSO Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address
            </label>
            <input
              id="auth-email-input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@company.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Password
            </label>
            <div className="relative">
              <input
                id="auth-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-slate-400">Must be at least 6 characters long.</p>
            )}
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mode === 'register' ? (
              <>
                <UserPlus className="w-4 h-4" /> Create Founder Account
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Sign In to Neptena-OS
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-slate-900 px-2 text-slate-400 font-mono">Or Continue With SSO</span>
          </div>
        </div>

        {/* SSO Option */}
        <div>
          <button
            id="auth-google-btn"
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {googleLoading ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                <span>Connecting to Google SSO...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Continue with Google SSO</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center px-4 py-12 selection:bg-cyan-500/30 selection:text-cyan-200">
      <Suspense fallback={
        <div className="w-full max-w-md mx-auto p-8 text-center text-slate-400 text-xs">
          Loading authentication gateway...
        </div>
      }>
        <LoginFormContent />
      </Suspense>
    </main>
  );
}
