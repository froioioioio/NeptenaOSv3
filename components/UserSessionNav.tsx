'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  LogOut, 
  ShieldCheck, 
  User as UserIcon 
} from 'lucide-react';
import { 
  getFirebaseAuth, 
  onAuthStateChanged, 
  logoutUser, 
  type User 
} from '@/lib/firebase';

export default function UserSessionNav() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await logoutUser();
      router.push('/login');
    } catch (err: unknown) {
      console.error('Failed to sign out:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  if (!user) {
    return (
      <Link
        id="nav-login-link"
        href="/login"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm active:scale-95 transition-all shrink-0"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </Link>
    );
  }

  const userDisplayName = user.email 
    ? user.email.split('@')[0] 
    : 'Founder';

  return (
    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
      {/* User Badge */}
      <div 
        className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs shrink-0 max-w-[130px] sm:max-w-[180px]"
        title={`Signed in as ${user.email || 'Founder'} (${user.uid})`}
      >
        <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-[10px] text-cyan-300 font-bold shrink-0">
          {userDisplayName.charAt(0).toUpperCase()}
        </div>
        <span className="truncate text-[11px] font-medium hidden sm:inline">{userDisplayName}</span>
        <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 shrink-0 font-mono hidden md:inline">
          CEO
        </span>
      </div>

      {/* Sign Out Button */}
      <button
        id="nav-signout-btn"
        type="button"
        onClick={handleSignOut}
        disabled={loggingOut}
        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-800 text-slate-400 hover:text-rose-200 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
        title="Sign Out of Neptena-OS"
        aria-label="Sign Out"
      >
        <LogOut className={`w-3.5 h-3.5 ${loggingOut ? 'animate-spin text-rose-400' : ''}`} />
        <span className="hidden sm:inline text-[11px]">Logout</span>
      </button>
    </div>
  );
}

