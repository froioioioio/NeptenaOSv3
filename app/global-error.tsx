'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md p-8 rounded-2xl border border-rose-900/40 bg-slate-900 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">System Level Failure</h2>
          <p className="text-xs text-slate-400">
            {error?.message || 'A critical error halted the system runtime.'}
          </p>
          <button
            id="global-error-reset-btn"
            onClick={() => reset()}
            className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}
