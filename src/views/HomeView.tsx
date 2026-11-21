import React from 'react';
import {
  ArrowRight,
  ClipboardList,
  Sparkles,
  GraduationCap,
  Zap,
  CheckCircle2,
  Clock,
  BookOpen,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MathFormula } from '../components/MathRenderer';

export const HomeView: React.FC = () => {
  const { user, signInWithGoogle, setActiveView, assignments, goals, profile } = useWorkspace();
  const [launching, setLaunching] = React.useState(false);

  const handleLaunchWorkspace = async () => {
    if (user) {
      setActiveView('dashboard');
      return;
    }
    setLaunching(true);
    try {
      const ok = await signInWithGoogle();
      if (ok) {
        setActiveView('dashboard');
      }
    } finally {
      setLaunching(false);
    }
  };

  const pendingCount = assignments.filter((a) => a.status === 'Pending').length;
  const completedCount = assignments.filter((a) => a.status === 'Completed').length;
  const doneGoals = goals.filter((g) => g.completed).length;

  const features = [
    {
      index: '01',
      title: 'Assignment Manager',
      description:
        'Organize coursework deadlines across a Monday–Sunday workload chart, live KPI counters, and Today’s Focus reminders.',
      icon: ClipboardList,
      accentBg: 'bg-[#F1EFFE] text-[#6C5CE7]',
      cta: 'Open Assignments',
      view: 'assignments' as const,
    },
    {
      index: '02',
      title: 'AI Solver',
      description:
        'Type math, coding, or theory questions—or upload a problem photo—for step-by-step derivations with KaTeX math rendering.',
      icon: Sparkles,
      accentBg: 'bg-indigo-50 text-[#6C5CE7]',
      cta: 'Open AI Solver',
      view: 'solver' as const,
    },
    {
      index: '03',
      title: 'Learning Assistant',
      description:
        'Switch on Simple English mode to break dense topics into a clear explanation, core rule, example, and walkthrough.',
      icon: GraduationCap,
      accentBg: 'bg-amber-50 text-amber-600',
      cta: 'Open AI Tutor',
      view: 'assistant' as const,
    },
    {
      index: '04',
      title: 'Quick Revision Centre',
      description:
        'Turn pasted lecture notes into structured summaries, exam questions, +20 XP MCQ quizzes, flip flashcards, and 5-minute crams.',
      icon: Zap,
      accentBg: 'bg-[#E6F8F4] text-[#00B894]',
      cta: 'Open Revision Centre',
      view: 'revision' as const,
    },
  ];

  return (
    <div className="bg-[#F8F9FB]">
      {/* Hero Section */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          {/* Left Hero Copy & Primary CTA */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-sm font-semibold text-[#6C5CE7]">
              StudyPilot Academic Workspace
            </p>
            <h1
              className="font-display font-bold text-[#16192C] tracking-tight mt-3 leading-[1.1]"
              style={{ fontSize: 'clamp(2.35rem, 4vw, 3.65rem)' }}
            >
              Study Smarter with AI — Smart Assignment Hub
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#5A607F] leading-relaxed max-w-2xl">
              Manage every semester deadline, derive step-by-step solutions for STEM and programming coursework, simplify hard concepts, and run 5-minute active recall quizzes from one desktop workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={launching}
                onClick={handleLaunchWorkspace}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#6C5CE7] hover:bg-[#5B4BD5] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {!user && (
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
                <span>
                  {launching
                    ? 'Signing in with Google...'
                    : user
                    ? 'Launch Workspace'
                    : 'Sign in with Google to Launch Workspace'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setActiveView('solver')}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white border border-[#EAECEF] hover:border-[#6C5CE7]/40 text-sm font-semibold text-[#16192C] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Try AI Assignment Solver</span>
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-[#EAECEF] flex flex-wrap items-center gap-6 text-sm text-[#5A607F]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00B894]" />
                <span className="tabular-nums">{completedCount} assignments completed</span>
              </div>
              <span aria-hidden="true" className="text-[#CBD2E0]">·</span>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6C5CE7]" />
                <span className="tabular-nums">{pendingCount} upcoming deadlines tracked</span>
              </div>
              <span aria-hidden="true" className="text-[#CBD2E0]">·</span>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#16192C]" />
                <span className="tabular-nums">
                  Level {profile.level} ({profile.xp} XP)
                </span>
              </div>
            </div>
          </div>

          {/* Right Live Workspace Snapshot Card */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="h-full bg-white border border-[#EAECEF] rounded-2xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between pb-4 border-b border-[#EAECEF]">
                <div>
                  <p className="text-xs font-medium text-[#8C93A8]">Live Workspace Preview</p>
                  <h2 className="font-display text-base font-bold text-[#16192C] mt-0.5">
                    Today&apos;s Study Snapshot
                  </h2>
                </div>
                <span className="text-xs font-semibold text-[#00B894] tabular-nums">
                  {doneGoals}/{goals.length} goals done
                </span>
              </div>

              {/* Sample Solver Preview */}
              <div className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] space-y-2.5">
                <p className="text-xs font-semibold text-[#6C5CE7]">
                  AI Assignment Solver · Differential Equations
                </p>
                <p className="text-sm font-medium text-[#16192C]">
                  Solve dy/dx + 2y = x with y(0) = 1
                </p>
                <div className="px-3 py-2 rounded-lg bg-white border border-[#EAECEF] overflow-x-auto text-sm">
                  <MathFormula formula="y(x) = \frac{x}{2} - \frac{1}{4} + \frac{5}{4}e^{-2x}" displayMode />
                </div>
              </div>

              {/* Quick Module Preview Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#111322] text-white">
                  <p className="text-[11px] text-white/65">Language Tutor</p>
                  <p className="font-display text-xl font-bold mt-1 tabular-nums">
                    Lvl {profile.level}
                  </p>
                  <p className="text-xs text-[#FBBF24] mt-0.5 tabular-nums">{profile.xp} XP earned</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#00B894] text-white">
                  <p className="text-[11px] text-white/80">Quick Revision</p>
                  <p className="font-display text-xl font-bold mt-1">5-Min</p>
                  <p className="text-xs text-white/90 mt-0.5">Notes, MCQs & Cards</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveView('dashboard')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#F8F9FB] hover:bg-[#F1EFFE] border border-[#EAECEF] text-xs font-semibold text-[#16192C] hover:text-[#6C5CE7] transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Open Full Student Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Feature Showcase */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6C5CE7]">
              Core Platform Modules
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#16192C] tracking-tight mt-1">
              Four focused tools built for coursework & exams
            </h2>
          </div>
          <p className="text-sm text-[#5A607F] max-w-md">
            Switch seamlessly between assignment planning, step-by-step problem solving, concept tutoring, and rapid revision.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.index}
                className="bg-white border border-[#EAECEF] rounded-2xl p-6 flex flex-col justify-between hover:border-[#6C5CE7]/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${feat.accentBg}`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#8C93A8] tabular-nums">
                      {feat.index}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-[#16192C]">
                    {feat.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-[#5A607F] leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveView(feat.view)}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C5CE7] hover:text-[#5B4BD5] cursor-pointer group"
                >
                  <span>{feat.cta}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Desktop Workflow Banner */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pb-8">
        <div className="rounded-2xl bg-[#111322] text-white p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-2.5">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Ready to organize your entire study week?
            </h2>
            <p className="text-sm sm:text-base text-white/75 max-w-2xl leading-relaxed">
              Launch the student dashboard to manage daily goals, review your Monday–Sunday deadline schedule, and sync your saved solutions and revision decks to your Google account.
            </p>
          </div>
          <div className="lg:col-span-4 flex lg:justify-end">
            <button
              type="button"
              disabled={launching}
              onClick={handleLaunchWorkspace}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#00B894] hover:bg-[#00A383] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <span>{user ? 'Launch Workspace' : 'Sign in with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
