import React, { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ViewId } from '../types';

const NAV_LINKS: Array<{ id: ViewId; label: string; href: string }> = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'assignments', label: 'Assignments', href: '/assignments' },
  { id: 'solver', label: 'AI Solver', href: '/solver' },
  { id: 'assistant', label: 'AI Tutor', href: '/tutor' },
  { id: 'revision', label: 'Revision Centre', href: '/revision' },
];

export const Navbar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    profile,
    user,
    authLoading,
    signInWithGoogle,
    signOutUser,
  } = useWorkspace();

  const [signingIn, setSigningIn] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  const displayName = user?.displayName || profile.displayName || 'Student';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#EAECEF]">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C5CE7] rounded-lg"
        >
          <span className="w-8 h-8 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center font-display font-bold text-xs tracking-tight">
            SP
          </span>
          <span className="font-display font-bold text-xl tracking-tight text-[#16192C]">
            StudyPilot
          </span>
        </a>

        {/* Zone 2: Horizontal Page Links */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-6 lg:gap-8 overflow-x-auto no-scrollbar py-1"
        >
          {NAV_LINKS.map((link) => {
            const isActive = activeView === link.id;
            return (
              <a
                key={link.id}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView(link.id);
                }}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'text-[#6C5CE7] font-semibold'
                    : 'text-[#5A607F] hover:text-[#16192C]'
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#6C5CE7]" />
                )}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Sign in with Google OR Authenticated User Profile + Sign Out */}
        <div className="flex items-center gap-3 shrink-0">
          {authLoading ? (
            <div className="w-36 h-9 rounded-xl bg-[#F3F4F8] animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-2.5 text-left rounded-xl px-2 py-1 hover:bg-[#F8F9FB] transition-colors cursor-pointer"
              >
                {user.photoURL && !avatarBroken ? (
                  <img
                    src={user.photoURL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarBroken(true)}
                    className="w-8 h-8 rounded-full object-cover border border-[#EAECEF] shrink-0"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[#6C5CE7] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </span>
                )}
                <span className="hidden sm:block text-sm font-medium text-[#16192C] max-w-[140px] truncate whitespace-nowrap">
                  {displayName}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EAECEF] bg-white hover:bg-[#F8F9FB] text-xs font-medium text-[#5A607F] hover:text-[#16192C] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={handleSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6C5CE7] hover:bg-[#5B4BD5] text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24" aria-hidden="true">
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
              <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
