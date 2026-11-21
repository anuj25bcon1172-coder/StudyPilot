import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Bookmark,
  Send,
  Upload,
  X,
  Loader2,
  Check,
  CheckCircle2,
  Trash2,
  Sparkles,
  Image as ImageIcon,
  Copy,
  FileText,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MathFormula, RichMathText } from '../components/MathRenderer';
import { formatSolvedAssignmentText } from '../lib/formatSolution';
import { SolutionStep, SolvedAssignment } from '../types';
import { solveAssignmentFollowUp, solveAssignmentProblem } from '../lib/gemini';

interface ActiveSolution {
  question: string;
  subject: string;
  title?: string;
  steps: SolutionStep[];
  finalAnswer: string;
}

interface FollowUpMessage {
  role: 'user' | 'model';
  text: string;
}

const SUBJECT_OPTIONS = [
  'Mathematics',
  'Programming',
  'Physics',
  'Chemistry',
  'Computer Science',
  'Theory / Humanities',
];

const SAMPLE_PROMPTS = [
  {
    label: 'Differential Equation',
    subject: 'Mathematics',
    question: 'Solve the differential equation dy/dx + 2y = x with the initial condition y(0) = 1.',
  },
  {
    label: 'Python Binary Search',
    subject: 'Programming',
    question: 'Write an iterative binary search in Python and prove its time complexity is O(log n).',
  },
  {
    label: 'Projectile Physics',
    subject: 'Physics',
    question: 'A ball is launched at 25 m/s at an angle of 37 degrees. Find its maximum height and horizontal range.',
  },
];

export const AiSolverView: React.FC = () => {
  const {
    solvedAssignments,
    saveSolvedAssignment,
    deleteSolvedAssignment,
    selectedSolvedAssignment,
    setSelectedSolvedAssignment,
    pendingSolverPrompt,
    setPendingSolverPrompt,
    awardXp,
  } = useWorkspace();

  const [subTab, setSubTab] = useState<'solve' | 'saved'>('solve');
  const [subject, setSubject] = useState('Auto-detect');
  const [question, setQuestion] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [solution, setSolution] = useState<ActiveSolution | null>(null);

  const [assignmentName, setAssignmentName] = useState('');
  const [saveSubject, setSaveSubject] = useState('Mathematics');
  const [savingSolution, setSavingSolution] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const [followUps, setFollowUps] = useState<FollowUpMessage[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Prefill question/subject when launched from Assignment Details modal
  useEffect(() => {
    if (!pendingSolverPrompt) return;
    setQuestion(pendingSolverPrompt.question);
    setSubject(pendingSolverPrompt.subject || 'Auto-detect');
    setSaveSubject(pendingSolverPrompt.subject || 'Mathematics');
    setSubTab('solve');
    setPendingSolverPrompt(null);
  }, [pendingSolverPrompt, setPendingSolverPrompt]);

  // Open a saved assignment when navigated from Assignment Manager
  useEffect(() => {
    if (!selectedSolvedAssignment) return;
    setSolution({
      question: selectedSolvedAssignment.question,
      subject: selectedSolvedAssignment.subject,
      title: selectedSolvedAssignment.solution.title,
      steps: selectedSolvedAssignment.solution.steps,
      finalAnswer: selectedSolvedAssignment.solution.finalAnswer,
    });
    setQuestion(selectedSolvedAssignment.question);
    setAssignmentName(selectedSolvedAssignment.assignmentName);
    setSaveSubject(selectedSolvedAssignment.subject || 'Mathematics');
    setSaveError('');
    setSavedConfirmed(false);
    setFollowUps([]);
    setSubTab('solve');
    setSelectedSolvedAssignment(null);
  }, [selectedSolvedAssignment, setSelectedSolvedAssignment]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('Image must be smaller than 6 MB.');
      return;
    }
    setImageMimeType(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSolve = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!question.trim() && !imagePreview) {
      setError('Enter a question or upload an image of your problem.');
      return;
    }
    setLoading(true);
    setError('');
    setSaveError('');
    setSavedConfirmed(false);
    setFollowUps([]);

    try {
      const data = await solveAssignmentProblem({
        question: question.trim(),
        subject: subject === 'Auto-detect' ? undefined : subject,
        imageBase64: imagePreview || undefined,
        imageMimeType: imagePreview ? imageMimeType : undefined,
      });

      const resolvedSubject =
        data.subject || (subject !== 'Auto-detect' ? subject : 'Mathematics');

      setSolution({
        question: question.trim() || 'Uploaded problem image',
        subject: resolvedSubject,
        title: data.title,
        steps: Array.isArray(data.steps) ? data.steps : [],
        finalAnswer: data.finalAnswer || '',
      });
      setSaveSubject(resolvedSubject);
      setAssignmentName('');
      setSubTab('solve');
      await awardXp(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to solve question.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solution) return;
    const trimmedName = assignmentName.trim();
    if (!trimmedName) {
      setSaveError('Please enter an Assignment Name (e.g., Data Structures Lab 3).');
      return;
    }
    if (savingSolution) return;

    setSavingSolution(true);
    setSaveError('');

    try {
      const saved = await saveSolvedAssignment({
        assignmentName: trimmedName,
        subject: saveSubject || solution.subject || 'Mathematics',
        question: solution.question,
        solution: {
          title: solution.title,
          steps: solution.steps,
          finalAnswer: solution.finalAnswer,
        },
      });
      setSavedConfirmed(true);
      showToast(`Saved "${saved.assignmentName}" to Saved Solutions.`);
      setTimeout(() => setSavedConfirmed(false), 2500);
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Unable to save solution right now.';
      if (message.startsWith('{')) {
        try {
          const parsed = JSON.parse(message) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Keep original message
        }
      }
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setSavingSolution(false);
    }
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast('Formatted solution copied to clipboard.');
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      showToast('Unable to copy to clipboard.', 'error');
    }
  };

  const handleDeleteSavedAssignment = async (item: SolvedAssignment) => {
    try {
      await deleteSolvedAssignment(item.id);
      showToast(`Removed "${item.assignmentName}" from Saved Solutions.`);
    } catch {
      showToast('Unable to delete saved solution.', 'error');
    }
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = followUpInput.trim();
    if (!solution || !msg || followUpLoading) return;

    const nextHistory: FollowUpMessage[] = [...followUps, { role: 'user', text: msg }];
    setFollowUps(nextHistory);
    setFollowUpInput('');
    setFollowUpLoading(true);

    try {
      const reply = await solveAssignmentFollowUp({
        question: solution.question,
        subject: solution.subject,
        followUpHistory: nextHistory,
        followUpMessage: msg,
      });
      setFollowUps((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (err) {
      setFollowUps((prev) => [
        ...prev,
        {
          role: 'model',
          text: err instanceof Error ? err.message : 'Unable to answer follow-up right now.',
        },
      ]);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const loadSavedAssignment = (item: SolvedAssignment) => {
    setSolution({
      question: item.question,
      subject: item.subject,
      title: item.solution.title,
      steps: item.solution.steps,
      finalAnswer: item.solution.finalAnswer,
    });
    setQuestion(item.question);
    setAssignmentName(item.assignmentName);
    setSaveSubject(item.subject || 'Mathematics');
    setSaveError('');
    setFollowUps([]);
    setSubTab('solve');
  };

  const formatSavedDate = (iso?: string) => {
    if (!iso) return 'Just now';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'Saved';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const subjectSelectOptions = SUBJECT_OPTIONS.includes(saveSubject)
    ? SUBJECT_OPTIONS
    : [saveSubject, ...SUBJECT_OPTIONS];

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[#16192C] tracking-tight">
          AI Assignment Solver
        </h1>
        <p className="text-sm text-[#5A607F] mt-0.5">
          Type a math, programming, or theory question—or upload a problem photo—for a step-by-step walkthrough.
        </p>
      </div>

      {/* Main Split Container */}
      <div className="bg-white border border-[#EAECEF] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[680px]">
        {/* Left Navigation & Question Composer Column */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#EAECEF] bg-[#FAFBFD] p-5 flex flex-col justify-between gap-5">
          <div className="space-y-5">
            {/* Solver Sub-tabs */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setSubTab('solve')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  subTab === 'solve'
                    ? 'bg-[#F1EFFE] text-[#6C5CE7]'
                    : 'text-[#5A607F] hover:bg-white'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Plus className="w-4 h-4" />
                  <span>New Question</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('saved')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  subTab === 'saved'
                    ? 'bg-[#F1EFFE] text-[#6C5CE7]'
                    : 'text-[#5A607F] hover:bg-white'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Bookmark className="w-4 h-4" />
                  <span>Saved Solutions</span>
                </span>
                <span className="text-xs font-semibold tabular-nums text-[#8C93A8]">
                  {solvedAssignments.length}
                </span>
              </button>
            </div>

            {subTab === 'solve' ? (
              <form onSubmit={handleSolve} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#16192C] mb-1.5">
                    Subject
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] focus:outline-none focus:border-[#6C5CE7]"
                  >
                    <option value="Auto-detect">Auto-detect</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Programming">Programming</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Computer Science">Computer Science</option>
                    <option value="Theory / Humanities">Theory / Humanities</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#16192C] mb-1.5">
                    Your Problem
                  </label>
                  <textarea
                    rows={5}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Type an equation, code prompt, or theory question..."
                    className="w-full p-3.5 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:border-[#6C5CE7] resize-none"
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  {imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-[#EAECEF] bg-white p-2">
                      <img
                        src={imagePreview}
                        alt="Uploaded problem preview"
                        className="w-full max-h-36 object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        aria-label="Remove uploaded image"
                        className="absolute top-3 right-3 p-1 rounded-full bg-[#16192C]/75 text-white hover:bg-[#16192C] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-[#CBD2E0] bg-white text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Problem Image (PNG/JPG)</span>
                    </button>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#6C5CE7] text-white text-sm font-semibold hover:bg-[#5B4BD5] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Solving with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Solve Step-by-Step</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {solvedAssignments.length === 0 ? (
                  <div className="py-8 px-3 text-center bg-white rounded-xl border border-[#EAECEF]">
                    <FileText className="w-6 h-6 text-[#8C93A8] mx-auto mb-2" />
                    <p className="text-xs font-medium text-[#16192C]">No saved solutions yet</p>
                    <p className="text-[11px] text-[#8C93A8] mt-1">
                      Solve a problem, enter an Assignment Name, and click Save Solution.
                    </p>
                  </div>
                ) : (
                  solvedAssignments.map((item) => {
                    const isCopied = copiedId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="group p-3.5 rounded-xl bg-white border border-[#EAECEF] hover:border-[#6C5CE7]/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => loadSavedAssignment(item)}
                            className="text-left flex-1 min-w-0 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-semibold text-[#6C5CE7]">
                                {item.subject}
                              </span>
                              <span className="text-[10px] text-[#8C93A8]">
                                · {formatSavedDate(item.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-[#16192C] group-hover:text-[#6C5CE7] transition-colors truncate mt-0.5">
                              {item.assignmentName}
                            </p>
                            <p className="text-[11px] text-[#5A607F] line-clamp-2 mt-1">
                              {item.question}
                            </p>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyText(formatSolvedAssignmentText(item), item.id)}
                              aria-label={`Copy ${item.assignmentName}`}
                              title="Copy formatted solution"
                              className="p-1.5 rounded-lg text-[#8C93A8] hover:text-[#6C5CE7] hover:bg-[#F1EFFE] transition-colors cursor-pointer"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-[#00896E]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedAssignment(item)}
                              aria-label={`Delete ${item.assignmentName}`}
                              title="Delete saved solution"
                              className="p-1.5 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Sample Prompts */}
          {subTab === 'solve' && (
            <div className="pt-4 border-t border-[#EAECEF]">
              <p className="text-[11px] font-medium text-[#8C93A8] mb-2">Try a sample prompt</p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PROMPTS.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => {
                      setQuestion(sample.question);
                      setSubject(sample.subject);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-[11px] font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Solution & Follow-Up Chat Panel */}
        <div className="lg:col-span-8 p-6 flex flex-col justify-between bg-white">
          <div className="space-y-6">
            {solution ? (
              <>
                {/* Q.1 Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#EAECEF]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-display text-sm font-bold text-[#6C5CE7]">Q.1</span>
                      <span className="text-xs font-medium text-[#8C93A8]">
                        · {solution.subject}
                      </span>
                    </div>
                    <p className="mt-1.5 text-base font-medium text-[#16192C] leading-relaxed">
                      {solution.question}
                    </p>
                    {imagePreview && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#00B894]">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Image attached to solver</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        formatSolvedAssignmentText({
                          assignmentName: assignmentName.trim() || solution.title || 'Solved Assignment',
                          subject: saveSubject || solution.subject,
                          question: solution.question,
                          solution: {
                            title: solution.title,
                            steps: solution.steps,
                            finalAnswer: solution.finalAnswer,
                          },
                        }),
                        'active-solution'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer shrink-0"
                  >
                    {copiedId === 'active-solution' ? (
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
                </div>

                {/* Save by Assignment Name Bar */}
                {!loading && solution.steps.length > 0 && (
                  <form
                    onSubmit={handleSaveSolution}
                    className="p-4 rounded-2xl bg-[#FAFBFD] border border-[#EAECEF] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="assignment-name-input"
                        className="text-xs font-semibold text-[#16192C]"
                      >
                        Save to Your Assignment Library
                      </label>
                      <span className="text-[11px] text-[#8C93A8]">
                        Stored securely in your cloud workspace
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-6">
                        <input
                          id="assignment-name-input"
                          type="text"
                          value={assignmentName}
                          onChange={(e) => {
                            setAssignmentName(e.target.value);
                            if (saveError) setSaveError('');
                          }}
                          maxLength={160}
                          placeholder="Assignment Name (e.g., Data Structures Lab 3)"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:border-[#6C5CE7]"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <select
                          aria-label="Subject for saved solution"
                          value={saveSubject}
                          onChange={(e) => setSaveSubject(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] focus:outline-none focus:border-[#6C5CE7]"
                        >
                          {subjectSelectOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <button
                          type="submit"
                          disabled={savingSolution}
                          className={`w-full h-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                            savedConfirmed
                              ? 'bg-[#00B894] text-white'
                              : 'bg-[#6C5CE7] text-white hover:bg-[#5B4BD5]'
                          }`}
                        >
                          {savingSolution ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : savedConfirmed ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Saved!</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-4 h-4" />
                              <span>Save Solution</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {saveError && (
                      <p className="text-xs text-rose-600">{saveError}</p>
                    )}
                  </form>
                )}

                {/* Step-by-step Solution */}
                {loading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-7 h-7 text-[#6C5CE7] animate-spin mb-3" />
                    <p className="text-sm font-medium text-[#16192C]">
                      Analyzing problem and deriving step-by-step solution...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <h2 className="font-display text-base font-bold text-[#16192C]">
                      Step-by-step Solution
                    </h2>

                    <div className="space-y-5">
                      {solution.steps.map((step) => (
                        <div key={step.stepNumber} className="space-y-2">
                          <h3 className="font-display text-sm font-semibold text-[#16192C]">
                            Step {step.stepNumber}: {step.title}
                          </h3>
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
                    </div>

                    {/* Final Answer Highlight */}
                    {solution.finalAnswer && (
                      <div className="p-4 rounded-xl bg-[#E6F8F4]/70 border border-[#00B894]/30">
                        <p className="text-xs font-semibold text-[#00896E] mb-1">Final Answer</p>
                        <div className="text-sm font-semibold text-[#16192C]">
                          <RichMathText text={solution.finalAnswer} />
                        </div>
                      </div>
                    )}

                    {/* Follow-up Conversation */}
                    {followUps.length > 0 && (
                      <div className="pt-4 border-t border-[#EAECEF] space-y-3">
                        <p className="text-xs font-semibold text-[#8C93A8]">Follow-up Discussion</p>
                        {followUps.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3.5 rounded-xl text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#F1EFFE] text-[#16192C] ml-8'
                                : 'bg-[#F8F9FB] border border-[#EAECEF] text-[#16192C] mr-4'
                            }`}
                          >
                            <p className="text-[11px] font-semibold text-[#5A607F] mb-1">
                              {msg.role === 'user' ? 'You' : 'StudyPilot Solver'}
                            </p>
                            <div className="whitespace-pre-wrap">
                              <RichMathText text={msg.text} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : loading ? (
              <div className="py-24 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-7 h-7 text-[#6C5CE7] animate-spin mb-3" />
                <p className="text-sm font-medium text-[#16192C]">
                  Analyzing problem and deriving step-by-step solution...
                </p>
              </div>
            ) : (
              <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
                <span className="w-14 h-14 rounded-2xl bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7" />
                </span>
                <h2 className="font-display text-lg font-bold text-[#16192C]">
                  No active solution yet
                </h2>
                <p className="text-sm text-[#5A607F] mt-1.5 max-w-md leading-relaxed">
                  Type a question or upload a problem image on the left, then click{' '}
                  <span className="font-semibold text-[#16192C]">Solve Step-by-Step</span> to generate a detailed walkthrough you can save to your library.
                </p>
                {solvedAssignments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSubTab('saved')}
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] text-xs font-semibold hover:bg-[#E7E3FD] transition-colors cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Browse Saved Solutions ({solvedAssignments.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom Follow-Up Chat Input */}
          <form onSubmit={handleFollowUp} className="mt-6 pt-4 border-t border-[#EAECEF]">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#F8F9FB] border border-[#EAECEF] focus-within:border-[#6C5CE7] focus-within:bg-white transition-colors">
              <input
                type="text"
                disabled={!solution}
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder={
                  solution
                    ? 'Ask a follow-up question...'
                    : 'Solve a problem first to ask follow-up questions...'
                }
                className="flex-1 bg-transparent text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none py-1 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!solution || followUpLoading || !followUpInput.trim()}
                aria-label="Send follow-up question"
                className="w-9 h-9 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center hover:bg-[#5B4BD5] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              >
                {followUpLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

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
