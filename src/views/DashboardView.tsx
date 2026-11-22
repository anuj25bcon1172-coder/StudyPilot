import React, { useMemo, useState } from 'react';
import {
  HelpCircle,
  FileText,
  CheckSquare,
  GitBranch,
  BookOpen,
  ClipboardList,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Layers,
  X,
  Send,
  Loader2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { runLanguageTutorSession } from '../lib/groq';

export const DashboardView: React.FC = () => {
  const {
    profile,
    goals,
    addGoal,
    toggleGoal,
    deleteGoal,
    timelineEvents,
    addTimelineEvent,
    deleteTimelineEvent,
    savedSolutions,
    revisionItems,
    clearPracticeHistory,
    assignments,
    setActiveView,
    setRevisionInitialTool,
    setIsAddAssignmentOpen,
    awardXp,
  } = useWorkspace();

  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());

  // Timeline quick add state
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtTime, setEvtTime] = useState('17:00');
  const [evtTheme, setEvtTheme] = useState<'rose' | 'emerald' | 'purple'>('purple');

  // Language Tutor modal state
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorPrompt, setTutorPrompt] = useState('');
  const [tutorReply, setTutorReply] = useState<string | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState('');

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    await addGoal(newGoalTitle);
    setNewGoalTitle('');
  };

  const handleAddTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle.trim()) return;
    const y = calendarMonth.getFullYear();
    const m = String(calendarMonth.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDay).padStart(2, '0');
    await addTimelineEvent({
      title: evtTitle,
      time: evtTime,
      date: `${y}-${m}-${d}`,
      colorTheme: evtTheme,
    });
    setEvtTitle('');
    setShowTimelineForm(false);
  };

  const handleLanguageTutorSubmit = async (customPrompt?: string) => {
    const promptToSend = customPrompt || tutorPrompt.trim() || 'Give me one academic writing polish exercise and a quick bilingual vocabulary challenge.';
    setTutorLoading(true);
    setTutorError('');
    try {
      const reply = await runLanguageTutorSession({
        prompt: promptToSend,
        targetLanguage: profile.languageTarget,
      });
      setTutorReply(reply);
      setTutorPrompt('');
      await awardXp(10);
    } catch (err) {
      setTutorError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setTutorLoading(false);
    }
  };

  // Calendar grid generation
  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayIndex; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    return { year, month, monthName, cells };
  }, [calendarMonth]);

  const selectedDateObj = new Date(calendarData.year, calendarData.month, selectedDay);
  const selectedWeekday = selectedDateObj.toLocaleString('en-US', { weekday: 'long' });
  const selectedDateIso = `${calendarData.year}-${String(calendarData.month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const tasksScheduledOnDay =
    timelineEvents.length +
    assignments.filter((a) => a.dueDate === selectedDateIso && a.status !== 'Completed').length;

  const quickActions = [
    {
      label: 'Ask a Question',
      subtitle: 'Step-by-step solver',
      icon: HelpCircle,
      iconBg: 'bg-amber-50 text-amber-600',
      onClick: () => setActiveView('solver'),
    },
    {
      label: 'Notes Reader',
      subtitle: 'Generate summaries',
      icon: FileText,
      iconBg: 'bg-indigo-50 text-[#6C5CE7]',
      onClick: () => {
        setRevisionInitialTool('notes');
        setActiveView('revision');
      },
    },
    {
      label: 'Practice Quiz',
      subtitle: 'Earn +20 XP MCQs',
      icon: CheckSquare,
      iconBg: 'bg-emerald-50 text-[#00B894]',
      onClick: () => {
        setRevisionInitialTool('mcq');
        setActiveView('revision');
      },
    },
    {
      label: 'Concept Tutor',
      subtitle: 'Simple English mode',
      icon: GitBranch,
      iconBg: 'bg-rose-50 text-rose-600',
      onClick: () => setActiveView('assistant'),
    },
    {
      label: 'Learning Path',
      subtitle: 'Track topic mastery',
      icon: BookOpen,
      iconBg: 'bg-purple-50 text-[#6C5CE7]',
      onClick: () => setActiveView('assistant'),
    },
    {
      label: 'Assignments',
      subtitle: 'Manage deadlines',
      icon: ClipboardList,
      iconBg: 'bg-slate-100 text-slate-700',
      onClick: () => setActiveView('assignments'),
    },
  ];

  const practiceHistory = [
    ...savedSolutions.map((s) => ({
      id: s.id,
      title: s.subject,
      detail: s.question,
      targetView: 'solver' as const,
      accent: 'text-[#6C5CE7] bg-[#F1EFFE]',
    })),
    ...revisionItems.map((r) => ({
      id: r.id,
      title: r.toolType.toUpperCase(),
      detail: r.topic,
      targetView: 'revision' as const,
      accent: 'text-[#00B894] bg-[#E6F8F4]',
    })),
  ].slice(0, 6);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Left/Center Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Top Purple Gradient Banners */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gradient-to-r from-[#6C5CE7] to-[#7D6FF0] p-5 text-white shadow-sm flex flex-col justify-between min-h-[126px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-tight">Daily Exam</h2>
                  <p className="mt-1.5 text-xs text-white/85 leading-relaxed max-w-[34ch]">
                    Sharp 5-question practice sprint tailored to your active coursework and pending deadlines.
                  </p>
                </div>
                <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </span>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('mcq');
                    setActiveView('revision');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white text-[#6C5CE7] text-xs font-semibold hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Start Daily Practice
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-r from-[#5B4BD5] to-[#6C5CE7] p-5 text-white shadow-sm flex flex-col justify-between min-h-[126px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-tight">
                    Productivity Formula
                  </h2>
                  <p className="mt-1.5 text-xs text-white/85 leading-relaxed max-w-[36ch]">
                    Eat the Frog: tackle your most demanding problem set first while your cognitive energy is highest.
                  </p>
                </div>
                <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4 text-white" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/85">
                <span className="tabular-nums">
                  {assignments.filter((a) => a.status === 'Pending').length} pending tasks queued
                </span>
                <button
                  type="button"
                  onClick={() => setActiveView('assignments')}
                  className="font-semibold text-white underline underline-offset-2 hover:text-white/85 cursor-pointer whitespace-nowrap"
                >
                  Open Manager
                </button>
              </div>
            </div>
          </div>

          {/* 6-Card Quick Actions Grid */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-[#16192C]">Quick Actions</h3>
              <span className="text-xs text-[#8C93A8]">Launch any study module</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className="group bg-white border border-[#EAECEF] rounded-2xl p-4 text-left hover:border-[#6C5CE7]/40 hover:shadow-sm transition-all cursor-pointer flex items-center gap-3.5"
                  >
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${action.iconBg}`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#16192C] group-hover:text-[#6C5CE7] transition-colors truncate">
                        {action.label}
                      </p>
                      <p className="text-xs text-[#8C93A8] truncate">{action.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Study Streak Visual Card + Interactive Today's Goals */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            {/* Study Streak Card (5 cols) */}
            <div className="md:col-span-5 rounded-2xl overflow-hidden relative min-h-[248px] bg-[#16192C] text-white flex flex-col justify-between p-5 border border-[#232742]">
              {/* Custom Atmospheric SVG Study Backdrop */}
              <svg
                aria-hidden="true"
                viewBox="0 0 400 300"
                className="absolute inset-0 w-full h-full object-cover opacity-55 pointer-events-none"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <radialGradient id="streakGlow" cx="65%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#6C5CE7" stopOpacity="0.8" />
                    <stop offset="55%" stopColor="#00B894" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#111322" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="400" height="300" fill="#131628" />
                <circle cx="255" cy="95" r="145" fill="url(#streakGlow)" />
                <path
                  d="M0 245 Q 110 175, 220 215 T 400 180 L 400 300 L 0 300 Z"
                  fill="#1C2038"
                  opacity="0.7"
                />
                <circle cx="255" cy="95" r="52" stroke="#A29BFE" strokeWidth="1" fill="none" opacity="0.35" />
                <circle cx="255" cy="95" r="82" stroke="#00B894" strokeWidth="1" fill="none" opacity="0.22" />
              </svg>

              <div className="relative z-10 flex items-center justify-between">
                <span className="text-xs font-medium text-white/80">Study Consistency</span>
                <span className="text-xs font-medium text-[#00B894] tabular-nums">
                  {goals.filter((g) => g.completed).length}/{goals.length} goals done
                </span>
              </div>

              <div className="relative z-10 mt-auto">
                <p className="font-display text-3xl font-bold tracking-tight tabular-nums">
                  {profile.streakDays} Days
                </p>
                <p className="text-xs text-white/75 mt-1">
                  Active study streak · Keep momentum going
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddAssignmentOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-medium text-white backdrop-blur-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add a task</span>
                </button>
              </div>
            </div>

            {/* Today's Goals Checklist (7 cols) */}
            <div className="md:col-span-7 bg-white border border-[#EAECEF] rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="font-display text-base font-semibold text-[#16192C]">
                    Today&apos;s Goals
                  </h3>
                  <span className="text-xs text-[#8C93A8] tabular-nums">
                    {goals.filter((g) => g.completed).length} of {goals.length} completed
                  </span>
                </div>

                <div className="space-y-2 max-h-[175px] overflow-y-auto pr-1">
                  {goals.length === 0 ? (
                    <p className="text-xs text-[#8C93A8] py-4 text-center">
                      No goals yet. Add your first focus item below.
                    </p>
                  ) : (
                    goals.map((goal) => (
                      <div
                        key={goal.id}
                        className="group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8F9FB] border border-[#EAECEF]/80 hover:border-[#6C5CE7]/30 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGoal(goal.id)}
                          className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                              goal.completed
                                ? 'bg-[#00B894] border-[#00B894] text-white'
                                : 'bg-white border-[#CBD2E0]'
                            }`}
                          >
                            {goal.completed && <Check className="w-3 h-3" />}
                          </span>
                          <span
                            className={`text-sm truncate ${
                              goal.completed ? 'line-through text-[#8C93A8]' : 'text-[#16192C]'
                            }`}
                          >
                            {goal.title}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGoal(goal.id)}
                          aria-label={`Remove ${goal.title}`}
                          className="opacity-60 group-hover:opacity-100 p-1 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <form onSubmit={handleAddGoal} className="mt-4 flex items-center gap-2">
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Add a new goal..."
                  maxLength={160}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#6C5CE7]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6C5CE7] text-white text-sm font-medium hover:bg-[#5B4BD5] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Add
                </button>
              </form>
            </div>
          </div>

          {/* Practice History Strip */}
          <section className="bg-white border border-[#EAECEF] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-display text-sm font-semibold text-[#16192C]">Practice History</h3>
              {practiceHistory.length > 0 && (
                <button
                  type="button"
                  onClick={clearPracticeHistory}
                  className="inline-flex items-center gap-1 text-xs text-[#8C93A8] hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {practiceHistory.length === 0 ? (
              <p className="text-xs text-[#8C93A8] py-3">
                Solved problems and revision packs you save will appear here for quick review.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {practiceHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.targetView)}
                    className="p-3 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] hover:border-[#6C5CE7]/40 text-left transition-colors cursor-pointer"
                  >
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${item.accent}`}>
                      {item.title}
                    </span>
                    <p className="mt-1.5 text-xs font-medium text-[#16192C] line-clamp-2">
                      {item.detail}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Dark Language Tutor XP & Level Card */}
          <div className="rounded-2xl bg-[#111322] text-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#A29BFE]">AI Tutor Active</span>
              <span className="text-xs text-white/60">Final Exam Track</span>
            </div>

            <h3 className="font-display text-lg font-bold mt-2">Language Tutor</h3>
            <p className="text-xs text-white/70 mt-0.5">{profile.languageTarget}</p>

            <div className="grid grid-cols-2 gap-3 mt-4 py-3 border-y border-white/10">
              <div>
                <p className="text-[11px] font-medium text-white/60">LEVEL</p>
                <p className="font-display text-2xl font-bold mt-0.5 tabular-nums">{profile.level}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-white/60">TOTAL XP</p>
                <p className="font-display text-2xl font-bold mt-0.5 text-[#FBBF24] tabular-nums">
                  {profile.xp}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTutorOpen(true)}
              className="mt-4 w-full py-2.5 px-4 rounded-xl bg-white text-[#111322] text-xs font-semibold hover:bg-white/90 transition-colors cursor-pointer"
            >
              Continue Session
            </button>
          </div>

          {/* Quick Jump Links: Summary Notes & Flashcards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setRevisionInitialTool('notes');
                setActiveView('revision');
              }}
              className="bg-white border border-[#EAECEF] rounded-2xl p-3.5 text-left hover:border-[#6C5CE7]/40 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#6C5CE7]" />
              <p className="text-xs font-semibold text-[#16192C] mt-2">Summary Notes</p>
              <p className="text-[11px] text-[#8C93A8] mt-0.5">Generate AI summaries</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setRevisionInitialTool('flashcards');
                setActiveView('revision');
              }}
              className="bg-white border border-[#EAECEF] rounded-2xl p-3.5 text-left hover:border-[#00B894]/50 transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#00B894]" />
              <p className="text-xs font-semibold text-[#16192C] mt-2">Flashcards</p>
              <p className="text-[11px] text-[#8C93A8] mt-0.5">Review active decks</p>
            </button>
          </div>

          {/* Monthly Calendar Widget */}
          <div className="bg-white border border-[#EAECEF] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-[#16192C]">Schedule</h3>
                <p className="text-xs text-[#8C93A8]">{calendarData.monthName}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(calendarData.year, calendarData.month - 1, 1)
                    )
                  }
                  className="p-1.5 rounded-lg text-[#5A607F] hover:bg-[#F3F4F8] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(calendarData.year, calendarData.month + 1, 1)
                    )
                  }
                  className="p-1.5 rounded-lg text-[#5A607F] hover:bg-[#F3F4F8] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-8">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[#8C93A8] mb-1.5">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {calendarData.cells.map((day, idx) =>
                    day === null ? (
                      <span key={`empty-${idx}`} className="h-7" />
                    ) : (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={`h-7 w-7 mx-auto rounded-lg text-xs tabular-nums flex items-center justify-center transition-colors cursor-pointer ${
                          selectedDay === day
                            ? 'bg-[#6C5CE7] text-white font-semibold'
                            : 'text-[#16192C] hover:bg-[#F1EFFE]'
                        }`}
                      >
                        {day}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="col-span-4 border-l border-[#EAECEF] pl-3 text-center">
                <p className="text-xs font-medium text-[#5A607F]">{selectedWeekday}</p>
                <p className="font-display text-3xl font-bold text-[#16192C] mt-1 tabular-nums">
                  {selectedDay}
                </p>
                <p className="text-[11px] font-semibold text-[#6C5CE7] mt-2">Focus</p>
                <p className="text-[11px] text-[#8C93A8] tabular-nums">
                  {tasksScheduledOnDay} tasks
                </p>
              </div>
            </div>
          </div>

          {/* Timeline Widget */}
          <div className="bg-white border border-[#EAECEF] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-display text-sm font-semibold text-[#16192C]">Timeline</h3>
              <button
                type="button"
                onClick={() => setShowTimelineForm((v) => !v)}
                aria-label="Add timeline event"
                className="w-7 h-7 rounded-full bg-amber-400 hover:bg-amber-500 text-[#16192C] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {showTimelineForm && (
              <form onSubmit={handleAddTimeline} className="mb-3.5 p-3 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] space-y-2.5">
                <input
                  type="text"
                  value={evtTitle}
                  onChange={(e) => setEvtTitle(e.target.value)}
                  placeholder="Session title..."
                  maxLength={120}
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs text-[#16192C] focus:outline-none focus:border-[#6C5CE7]"
                  required
                />
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={evtTime}
                    onChange={(e) => setEvtTime(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs tabular-nums"
                  />
                  <select
                    value={evtTheme}
                    onChange={(e) => setEvtTheme(e.target.value as 'rose' | 'emerald' | 'purple')}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs"
                  >
                    <option value="rose">Rose</option>
                    <option value="emerald">Emerald</option>
                    <option value="purple">Purple</option>
                  </select>
                  <button
                    type="submit"
                    className="ml-auto px-3 py-1.5 rounded-lg bg-[#6C5CE7] text-white text-xs font-medium cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {timelineEvents.length === 0 ? (
                <p className="text-xs text-[#8C93A8] py-4 text-center">
                  No scheduled events yet. Click + to add a study block.
                </p>
              ) : (
                timelineEvents.map((evt) => {
                  const themeClass =
                    evt.colorTheme === 'emerald'
                      ? 'bg-[#E6F8F4] text-[#0D6E59]'
                      : evt.colorTheme === 'purple'
                      ? 'bg-[#F1EFFE] text-[#4C3DC2]'
                      : 'bg-rose-50 text-rose-900';
                  return (
                    <div
                      key={evt.id}
                      className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl ${themeClass}`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{evt.title}</p>
                        <p className="text-[11px] opacity-75 tabular-nums mt-0.5">{evt.time}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteTimelineEvent(evt.id)}
                        aria-label={`Delete ${evt.title}`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-black/5 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Language Tutor Interactive Modal */}
      {tutorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#16192C]/45 p-4 backdrop-blur-[2px]"
          onClick={() => setTutorOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-[#EAECEF] shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#EAECEF]">
              <div>
                <h3 className="font-display text-base font-semibold text-[#16192C]">
                  Language Tutor Session (+10 XP)
                </h3>
                <p className="text-xs text-[#5A607F] mt-0.5">{profile.languageTarget}</p>
              </div>
              <button
                type="button"
                onClick={() => setTutorOpen(false)}
                className="p-1.5 rounded-lg text-[#8C93A8] hover:text-[#16192C] hover:bg-[#F3F4F8] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {tutorError && (
                <div className="p-3 rounded-xl bg-rose-50 text-xs text-rose-700 border border-rose-200">
                  {tutorError}
                </div>
              )}

              {tutorReply ? (
                <div className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-sm text-[#16192C] leading-relaxed whitespace-pre-wrap">
                  {tutorReply}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-xs text-[#5A607F]">
                  Practice grammar, academic phrasing, or translation. Send a sentence below or start a quick drill.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={tutorLoading}
                  onClick={() => handleLanguageTutorSubmit('Give me an academic English grammar correction challenge.')}
                  className="px-3 py-1.5 rounded-lg bg-[#F1EFFE] text-[#6C5CE7] text-xs font-medium hover:bg-[#E4E0FD] cursor-pointer"
                >
                  Grammar Drill
                </button>
                <button
                  type="button"
                  disabled={tutorLoading}
                  onClick={() => handleLanguageTutorSubmit('Teach me 3 useful French academic transition phrases.')}
                  className="px-3 py-1.5 rounded-lg bg-[#E6F8F4] text-[#00896E] text-xs font-medium hover:bg-[#D2F3EB] cursor-pointer"
                >
                  French Vocabulary
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleLanguageTutorSubmit();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={tutorPrompt}
                  onChange={(e) => setTutorPrompt(e.target.value)}
                  placeholder="Write a sentence to check or ask a language question..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] focus:outline-none focus:bg-white focus:border-[#6C5CE7]"
                />
                <button
                  type="submit"
                  disabled={tutorLoading}
                  className="px-4 py-2.5 rounded-xl bg-[#6C5CE7] text-white text-sm font-medium hover:bg-[#5B4BD5] disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
                >
                  {tutorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
