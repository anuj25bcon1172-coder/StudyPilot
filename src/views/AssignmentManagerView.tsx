import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  CalendarCheck2,
  Check,
  Bookmark,
  Copy,
  Eye,
  X,
  ArrowUpRight,
  Sparkles,
  FileText,
  FileUp,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { AssignmentDetailModal } from '../components/AssignmentDetailModal';
import { MathFormula, RichMathText } from '../components/MathRenderer';
import { formatSolvedAssignmentText } from '../lib/formatSolution';
import { AssignmentStatus, SolvedAssignment } from '../types';

export const AssignmentManagerView: React.FC = () => {
  const {
    assignments,
    solvedAssignments,
    updateAssignmentStatus,
    deleteAssignment,
    deleteSolvedAssignment,
    setIsAddAssignmentOpen,
    setSelectedSolvedAssignment,
    setActiveView,
  } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | AssignmentStatus>('All');
  const [solutionSearch, setSolutionSearch] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [activeSolutionModal, setActiveSolutionModal] = useState<SolvedAssignment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const activeAssignmentDetail = useMemo(
    () => (selectedAssignmentId ? assignments.find((a) => a.id === selectedAssignmentId) || null : null),
    [assignments, selectedAssignmentId]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Live KPI metrics
  const stats = useMemo(() => {
    const total = assignments.length;
    const pending = assignments.filter((a) => a.status === 'Pending').length;
    const completed = assignments.filter((a) => a.status === 'Completed').length;
    const overdue = assignments.filter((a) => a.status === 'Overdue').length;
    return { total, pending, completed, overdue };
  }, [assignments]);

  // Filtered table rows
  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments.filter((a) => {
      const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
      const matchesQuery =
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        a.dueDate.includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [assignments, searchQuery, statusFilter]);

  const filteredSolvedAssignments = useMemo(() => {
    const q = (solutionSearch || searchQuery).trim().toLowerCase();
    if (!q) return solvedAssignments;
    return solvedAssignments.filter(
      (item) =>
        item.assignmentName.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.question.toLowerCase().includes(q)
    );
  }, [solvedAssignments, solutionSearch, searchQuery]);

  // Today's focus assignments
  const dueToday = useMemo(
    () => assignments.filter((a) => a.dueDate === todayIso && a.status !== 'Completed'),
    [assignments, todayIso]
  );

  // Monday - Sunday Bar Chart distribution computed purely from user's assignments
  const weeklyBars = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    assignments.forEach((a) => {
      const dt = new Date(`${a.dueDate}T12:00:00`);
      if (!Number.isNaN(dt.getTime())) {
        const jsDay = dt.getDay(); // 0=Sun..6=Sat
        const monIdx = jsDay === 0 ? 6 : jsDay - 1;
        counts[monIdx] += 1;
      }
    });
    return labels.map((day, idx) => ({
      day,
      value: counts[idx],
      assignmentsCount: counts[idx],
    }));
  }, [assignments]);

  const maxBarValue = Math.max(4, ...weeklyBars.map((b) => b.value));

  const formatReadableDate = (iso: string) => {
    const dt = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTimestampDate = (iso?: string) => {
    if (!iso) return 'Just now';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'Saved';
    return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleCopySolution = async (item: SolvedAssignment) => {
    try {
      await navigator.clipboard.writeText(formatSolvedAssignmentText(item));
      setCopiedId(item.id);
      setToast({ message: `Copied "${item.assignmentName}" to clipboard.`, tone: 'success' });
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2000);
    } catch {
      setToast({ message: 'Unable to copy to clipboard.', tone: 'error' });
    }
  };

  const handleDeleteSavedSolution = async (item: SolvedAssignment) => {
    try {
      await deleteSolvedAssignment(item.id);
      if (activeSolutionModal?.id === item.id) {
        setActiveSolutionModal(null);
      }
      setToast({ message: `Deleted "${item.assignmentName}" from Saved Solutions.`, tone: 'success' });
    } catch {
      setToast({ message: 'Unable to delete saved solution.', tone: 'error' });
    }
  };

  const handleOpenInSolver = (item: SolvedAssignment) => {
    setSelectedSolvedAssignment(item);
    setActiveSolutionModal(null);
    setActiveView('solver');
  };

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto space-y-6">
      {/* Top Action & Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#16192C] tracking-tight">
            Assignment Manager
          </h1>
          <p className="text-sm text-[#5A607F] mt-0.5">
            Track upcoming deadlines, completed coursework, and saved AI solutions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-[#8C93A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assignments, subjects..."
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:border-[#6C5CE7]"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsAddAssignmentOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6C5CE7] text-white text-sm font-medium hover:bg-[#5B4BD5] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Assignment</span>
          </button>
        </div>
      </div>

      {/* 4 Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#5A607F]">Total Assignments</p>
            <p className="font-display text-3xl font-bold text-[#16192C] mt-1 tabular-nums">
              {stats.total}
            </p>
            <p className="text-xs text-[#8C93A8] mt-1">All tracked coursework</p>
          </div>
          <span className="w-11 h-11 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </span>
        </div>

        <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#5A607F]">Pending</p>
            <p className="font-display text-3xl font-bold text-amber-600 mt-1 tabular-nums">
              {stats.pending}
            </p>
            <p className="text-xs text-[#8C93A8] mt-1">Due soon</p>
          </div>
          <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </span>
        </div>

        <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#5A607F]">Completed</p>
            <p className="font-display text-3xl font-bold text-[#00B894] mt-1 tabular-nums">
              {stats.completed}
            </p>
            <p className="text-xs text-[#8C93A8] mt-1">Great progress</p>
          </div>
          <span className="w-11 h-11 rounded-xl bg-[#E6F8F4] text-[#00B894] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </span>
        </div>

        <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#5A607F]">Overdue</p>
            <p className="font-display text-3xl font-bold text-rose-600 mt-1 tabular-nums">
              {stats.overdue}
            </p>
            <p className="text-xs text-[#8C93A8] mt-1">Needs attention</p>
          </div>
          <span className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </span>
        </div>
      </div>

      {/* Middle Row: Monday-Sunday Bar Chart + Recent Assignments */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-[#EAECEF] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-base font-semibold text-[#16192C]">
                Upcoming Deadlines
              </h2>
              <p className="text-xs text-[#8C93A8] mt-0.5">Monday–Sunday workload distribution</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('All');
                setSearchQuery('');
              }}
              className="text-xs font-medium text-[#6C5CE7] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>

          <div className="flex items-end gap-4 h-52 pt-4">
            {/* Y-Axis Scale */}
            <div className="flex flex-col justify-between h-full pb-6 text-[11px] text-[#8C93A8] tabular-nums pr-1">
              <span>{maxBarValue}</span>
              <span>{Math.round(maxBarValue / 2)}</span>
              <span>0</span>
            </div>

            {/* Bars */}
            <div className="flex-1 grid grid-cols-7 gap-3 items-end h-full">
              {weeklyBars.map((bar) => {
                const heightPct =
                  bar.value === 0 ? 3 : Math.max(14, Math.round((bar.value / maxBarValue) * 100));
                return (
                  <div key={bar.day} className="flex flex-col items-center h-full justify-end group">
                    <div className="w-full flex-1 flex items-end justify-center pb-2">
                      <div
                        style={{ height: `${heightPct}%` }}
                        title={`${bar.day}: ${bar.assignmentsCount} assignment(s)`}
                        className={`w-7 sm:w-9 rounded-t-xl transition-all relative ${
                          bar.value === 0
                            ? 'bg-[#EAECEF]'
                            : 'bg-gradient-to-t from-[#6C5CE7] to-[#8C7FF5] group-hover:from-[#5B4BD5] group-hover:to-[#6C5CE7]'
                        }`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[#16192C] text-white text-[10px] tabular-nums whitespace-nowrap transition-opacity">
                          {bar.assignmentsCount} due
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[#5A607F]">{bar.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {assignments.length === 0 && (
            <p className="mt-3 text-xs text-[#8C93A8] text-center">
              No assignments scheduled yet. Add an assignment to visualize your weekly workload.
            </p>
          )}
        </div>

        {/* Recent Assignments List */}
        <div className="lg:col-span-5 bg-white border border-[#EAECEF] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-[#16192C]">
              Recent Assignments
            </h2>
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className="text-xs font-medium text-[#6C5CE7] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>

          <div className="space-y-2.5">
            {assignments.length === 0 ? (
              <div className="py-10 px-4 rounded-xl bg-[#FAFBFD] border border-dashed border-[#CBD2E0] text-center">
                <p className="text-sm font-medium text-[#16192C]">No assignments yet</p>
                <p className="text-xs text-[#8C93A8] mt-1">
                  Add your first assignment to track deadlines and handwritten work.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddAssignmentOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] text-xs font-semibold hover:bg-[#E7E3FD] transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Assignment</span>
                </button>
              </div>
            ) : (
              assignments.slice(0, 5).map((item) => {
                const statusStyle =
                  item.status === 'Completed'
                    ? 'bg-[#E6F8F4] text-[#00896E]'
                    : item.status === 'Overdue'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-[#F1EFFE] text-[#6C5CE7]';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8F9FB] border border-[#EAECEF]/70"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#16192C] truncate">{item.title}</p>
                      <p className="text-xs text-[#8C93A8] tabular-nums mt-0.5">
                        Due: {formatReadableDate(item.dueDate)}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${statusStyle}`}>
                      {item.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Searchable Table + Today's Focus Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 bg-white border border-[#EAECEF] rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-base font-semibold text-[#16192C]">
              All Assignments
            </h2>

            {/* Segmented Filter Tabs */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F3F4F8] self-start">
              {(['All', 'Pending', 'Completed', 'Overdue'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-white text-[#16192C] shadow-xs'
                      : 'text-[#5A607F] hover:text-[#16192C]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAECEF] text-xs font-medium text-[#8C93A8]">
                  <th className="py-3 pr-4">Assignment</th>
                  <th className="py-3 px-3">Subject</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAECEF]">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-[#8C93A8]">
                      {assignments.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <span>No assignments yet. Add your first assignment!</span>
                          <button
                            type="button"
                            onClick={() => setIsAddAssignmentOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6C5CE7] text-white text-xs font-semibold hover:bg-[#5B4BD5] transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Assignment</span>
                          </button>
                        </div>
                      ) : (
                        'No matching assignments found.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((item) => {
                    const statusBadge =
                      item.status === 'Completed'
                        ? 'bg-[#E6F8F4] text-[#00896E]'
                        : item.status === 'Overdue'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-[#F1EFFE] text-[#6C5CE7]';
                    const hasQuestion = Boolean(item.questionText || item.questionFile);
                    const hasHandwritten = Boolean(item.handwrittenSolution);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedAssignmentId(item.id)}
                        className="hover:bg-[#F8F9FB] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 pr-4">
                          <p className="text-sm font-medium text-[#16192C] group-hover:text-[#6C5CE7] transition-colors">
                            {item.title}
                          </p>
                          {(hasQuestion || hasHandwritten) && (
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-[#5A607F]">
                              {hasQuestion && (
                                <span className="inline-flex items-center gap-1 text-[#6C5CE7]">
                                  <FileText className="w-3 h-3" />
                                  <span>Question</span>
                                </span>
                              )}
                              {hasHandwritten && (
                                <span className="inline-flex items-center gap-1 text-[#00896E]">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Handwritten Solution</span>
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-xs text-[#5A607F] whitespace-nowrap">
                          {item.subject}
                        </td>
                        <td className="py-3.5 px-3 text-xs text-[#5A607F] tabular-nums whitespace-nowrap">
                          {formatReadableDate(item.dueDate)}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${statusBadge}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                          <div
                            className="inline-flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedAssignmentId(item.id)}
                              title="Upload Question / Handwritten Solution or View Details"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1EFFE] text-[#6C5CE7] hover:bg-[#E7E3FD] text-xs font-medium transition-colors cursor-pointer"
                            >
                              {hasHandwritten ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </>
                              ) : (
                                <>
                                  <FileUp className="w-3.5 h-3.5" />
                                  <span>Upload / View Details</span>
                                </>
                              )}
                            </button>
                            {item.status !== 'Completed' && (
                              <button
                                type="button"
                                onClick={() => updateAssignmentStatus(item.id, 'Completed')}
                                title="Mark as Completed (+15 XP)"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E6F8F4] text-[#00896E] hover:bg-[#D1F2EA] text-xs font-medium transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Done</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteAssignment(item.id)}
                              aria-label={`Delete ${item.title}`}
                              className="p-1.5 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Today's Focus Card */}
        <div className="lg:col-span-4 bg-white border border-[#EAECEF] rounded-2xl p-5">
          <h2 className="font-display text-base font-semibold text-[#16192C]">Today&apos;s Focus</h2>

          {dueToday.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center">
              <span className="w-14 h-14 rounded-2xl bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center mb-3.5">
                <CalendarCheck2 className="w-7 h-7" />
              </span>
              <p className="text-sm font-semibold text-[#16192C]">No assignments due today</p>
              <p className="text-xs text-[#8C93A8] mt-1">
                Enjoy your day or get ahead on tomorrow&apos;s tasks.
              </p>
              <button
                type="button"
                onClick={() => setIsAddAssignmentOpen(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7]/40 transition-colors cursor-pointer"
              >
                Schedule New Task
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {dueToday.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16192C] truncate">{item.title}</p>
                    <p className="text-xs text-[#5A607F] mt-0.5">{item.subject}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAssignmentStatus(item.id, 'Completed')}
                    className="px-3 py-1.5 rounded-lg bg-[#00B894] text-white text-xs font-medium hover:bg-[#00A383] shrink-0 cursor-pointer"
                  >
                    Complete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Saved Solutions Library Section */}
      <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center shrink-0">
              <Bookmark className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-semibold text-[#16192C]">
                  Saved Solutions
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#F3F4F8] text-xs font-semibold text-[#5A607F] tabular-nums">
                  {solvedAssignments.length}
                </span>
              </div>
              <p className="text-xs text-[#8C93A8] mt-0.5">
                Click any saved assignment name to reopen the full formatted solution, copy it, or remove it.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {solvedAssignments.length > 0 && (
              <div className="relative sm:w-60">
                <Search className="w-3.5 h-3.5 text-[#8C93A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={solutionSearch}
                  onChange={(e) => setSolutionSearch(e.target.value)}
                  placeholder="Filter saved solutions..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-xs text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:border-[#6C5CE7]"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveView('solver')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] hover:bg-[#E7E3FD] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Solver</span>
            </button>
          </div>
        </div>

        {solvedAssignments.length === 0 ? (
          <div className="py-10 px-4 rounded-xl bg-[#FAFBFD] border border-dashed border-[#CBD2E0] flex flex-col items-center text-center">
            <Bookmark className="w-7 h-7 text-[#8C93A8] mb-2.5" />
            <p className="text-sm font-semibold text-[#16192C]">No saved solutions yet</p>
            <p className="text-xs text-[#8C93A8] mt-1 max-w-md">
              Generate a step-by-step walkthrough in the AI Assignment Solver and save it by assignment name to build your personal reference library.
            </p>
            <button
              type="button"
              onClick={() => setActiveView('solver')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6C5CE7] text-white text-xs font-semibold hover:bg-[#5B4BD5] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Solve an Assignment</span>
            </button>
          </div>
        ) : filteredSolvedAssignments.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8C93A8]">
            No saved solutions match your current filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSolvedAssignments.map((item) => {
              const isCopied = copiedId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] hover:border-[#6C5CE7]/40 transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[#F1EFFE] text-[#6C5CE7] text-[11px] font-semibold truncate">
                        {item.subject}
                      </span>
                      <span className="text-[11px] text-[#8C93A8] tabular-nums shrink-0">
                        {formatTimestampDate(item.createdAt)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSolutionModal(item)}
                      className="text-left font-display text-sm font-semibold text-[#16192C] hover:text-[#6C5CE7] transition-colors line-clamp-1 cursor-pointer w-full"
                    >
                      {item.assignmentName}
                    </button>

                    <p className="text-xs text-[#5A607F] line-clamp-2 mt-1 leading-relaxed">
                      {item.question}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-[#EAECEF] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSolutionModal(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Solution</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopySolution(item)}
                        aria-label={`Copy ${item.assignmentName}`}
                        title="Copy formatted solution"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#00896E]" />
                            <span className="text-[#00896E]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSavedSolution(item)}
                        aria-label={`Delete ${item.assignmentName}`}
                        title="Delete saved solution"
                        className="p-1.5 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Formatted Solution Detail Modal */}
      {activeSolutionModal && (
        <div
          className="fixed inset-0 z-50 bg-[#16192C]/45 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-solution-modal-title"
        >
          <div className="bg-white border border-[#EAECEF] rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#EAECEF] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#F1EFFE] text-[#6C5CE7] text-xs font-semibold">
                    {activeSolutionModal.subject}
                  </span>
                  <span className="text-xs text-[#8C93A8]">
                    Saved {formatTimestampDate(activeSolutionModal.createdAt)}
                  </span>
                </div>
                <h3
                  id="saved-solution-modal-title"
                  className="font-display text-lg font-bold text-[#16192C] mt-1.5"
                >
                  {activeSolutionModal.assignmentName}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setActiveSolutionModal(null)}
                aria-label="Close solution modal"
                className="p-2 rounded-xl text-[#8C93A8] hover:text-[#16192C] hover:bg-[#F3F4F8] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="p-4 rounded-xl bg-[#FAFBFD] border border-[#EAECEF]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8C93A8] mb-1">
                  Problem Question
                </p>
                <p className="text-sm font-medium text-[#16192C] leading-relaxed">
                  {activeSolutionModal.question}
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="font-display text-sm font-bold text-[#16192C]">
                  Step-by-step Solution
                </h4>

                {activeSolutionModal.solution.steps.map((step) => (
                  <div key={step.stepNumber} className="space-y-2">
                    <h5 className="font-display text-sm font-semibold text-[#16192C]">
                      Step {step.stepNumber}: {step.title}
                    </h5>
                    <p className="text-sm text-[#3F4562] leading-relaxed">
                      <RichMathText text={step.explanation} />
                    </p>
                    {step.formula && (
                      <div className="px-4 py-3 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] overflow-x-auto">
                        {step.formula.includes('\n') ||
                        step.formula.includes('def ') ||
                        step.formula.includes('function ') ? (
                          <pre className="font-mono text-xs text-[#16192C] whitespace-pre-wrap">
                            {step.formula}
                          </pre>
                        ) : (
                          <MathFormula formula={step.formula} displayMode />
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {activeSolutionModal.solution.finalAnswer && (
                  <div className="p-4 rounded-xl bg-[#E6F8F4]/70 border border-[#00B894]/30">
                    <p className="text-xs font-semibold text-[#00896E] mb-1">Final Answer</p>
                    <div className="text-sm font-semibold text-[#16192C]">
                      <RichMathText text={activeSolutionModal.solution.finalAnswer} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#EAECEF] bg-[#FAFBFD] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleDeleteSavedSolution(activeSolutionModal)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCopySolution(activeSolutionModal)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#EAECEF] text-xs font-semibold text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  {copiedId === activeSolutionModal.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#00896E]" />
                      <span className="text-[#00896E]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Solution</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenInSolver(activeSolutionModal)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6C5CE7] text-white text-xs font-semibold hover:bg-[#5B4BD5] transition-colors cursor-pointer"
                >
                  <span>Open in AI Solver</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Question & Handwritten Solution Modal */}
      <AssignmentDetailModal
        assignment={activeAssignmentDetail}
        onClose={() => setSelectedAssignmentId(null)}
        onToast={(message, tone = 'success') => setToast({ message, tone })}
      />

      {/* Confirmation Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.tone === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-[#16192C] border-[#2A2F4A] text-white'
          }`}
        >
          <CheckCircle2
            className={`w-4 h-4 shrink-0 ${
              toast.tone === 'error' ? 'text-rose-600' : 'text-[#00B894]'
            }`}
          />
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="ml-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
