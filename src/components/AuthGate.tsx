import React, { useState } from 'react';
import { ArrowLeft, Lock, Loader2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ViewId } from '../types';

const MODULE_LABELS: Record<Exclude<ViewId, 'home'>, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Student Dashboard',
    subtitle: 'Access your daily goals, study streak, calendar, and Language Tutor XP.',
  },
  assignments: {
    title: 'Assignment Manager',
    subtitle: 'Manage your coursework deadlines, Monday–Sunday workload, and focus queue.',
  },
  solver: {
    title: 'AI Assignment Solver',
    subtitle: 'Derive step-by-step STEM, coding, and theory solutions and save answers.',
  },
  assistant: {
    title: 'AI Learning Assistant',
    subtitle: 'Explore concept breakdowns in Simple English and track your Learning Path.',
  },
  revision: {
    title: 'Quick Revision Centre',
    subtitle: 'Generate study notes, important questions, +20 XP MCQs, and flip flashcards.',
  },
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authLoading, activeView, setActiveView, signInWithGoogle, syncError } =
    useWorkspace();
  const [signingIn, setSigningIn] = useState(false);

  if (activeView === 'home') {
    return <>{children}</>;
  }

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <Loader2 className="w-8 h-8 text-[#6C5CE7] animate-spin" />
        <p className="mt-3 text-sm text-[#5A607F]">Loading your StudyPilot account...</p>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const info = MODULE_LABELS[activeView];

  const handleContinueWithGoogle = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16 bg-[#F8F9FB]">
      <div className="w-full max-w-md bg-white border border-[#EAECEF] rounded-2xl p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>

        <h1 className="font-display text-xl font-bold text-[#16192C] mt-5">
          Sign in to open {info.title}
        </h1>
        <p className="text-sm text-[#5A607F] mt-2 leading-relaxed">
          {info.subtitle} Your assignments, goals, saved answers, and XP are stored privately under your Google account.
        </p>

        {syncError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 text-left">
            {syncError}
          </div>
        )}

        <button
          type="button"
          disabled={signingIn}
          onClick={handleContinueWithGoogle}
          className="mt-6 w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-[#16192C] hover:bg-[#252A44] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
        >
          {signingIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
          )}
          <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('home')}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#5A607F] hover:text-[#16192C] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      </div>
    </div>
  );
};
