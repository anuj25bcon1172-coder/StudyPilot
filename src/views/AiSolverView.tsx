import React, { useState, useRef } from 'react';
import {
  Plus,
  Bookmark,
  Send,
  Upload,
  X,
  Loader2,
  Check,
  Trash2,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MathFormula, RichMathText } from '../components/MathRenderer';
import { SavedSolution, SolutionStep } from '../types';

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
  const { savedSolutions, saveSolution, deleteSolution, awardXp } = useWorkspace();

  const [subTab, setSubTab] = useState<'solve' | 'saved'>('solve');
  const [subject, setSubject] = useState('Auto-detect');
  const [question, setQuestion] = useState(SAMPLE_PROMPTS[0].question);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [solution, setSolution] = useState<ActiveSolution>(() => ({
    question: savedSolutions[0]?.question || SAMPLE_PROMPTS[0].question,
    subject: savedSolutions[0]?.subject || 'Differential Equations',
    title: savedSolutions[0]?.title || 'First-Order Linear ODE with Integrating Factor',
    steps: savedSolutions[0]?.steps || [
      {
        stepNumber: 1,
        title: 'Find the integrating factor',
        explanation:
          'The equation is of the form $\\frac{dy}{dx} + P(x)y = Q(x)$, where $P(x) = 2$ and $Q(x) = x$.',
        formula: 'IF = e^{\\int P(x)\\,dx} = e^{\\int 2\\,dx} = e^{2x}',
      },
      {
        stepNumber: 2,
        title: 'Multiply through by the integrating factor',
        explanation:
          'Multiplying both sides by $e^{2x}$ collapses the left side into a product derivative.',
        formula: '\\frac{d}{dx}\\left(x\\text{-term}:\\; y e^{2x}\\right) = x e^{2x}',
      },
      {
        stepNumber: 3,
        title: 'Integrate both sides & solve for C',
        explanation:
          'Integrating by parts gives $y e^{2x} = \\frac{x}{2}e^{2x} - \\frac{1}{4}e^{2x} + C$. Using $y(0)=1$, we find $C = \\frac{5}{4}$.',
        formula: 'y(x) = \\frac{x}{2} - \\frac{1}{4} + \\frac{5}{4}e^{-2x}',
      },
    ],
    finalAnswer:
      savedSolutions[0]?.finalAnswer || '$y(x) = \\frac{x}{2} - \\frac{1}{4} + \\frac{5}{4}e^{-2x}$',
  }));

  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpMessage[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);

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
    setSavedConfirmed(false);
    setFollowUps([]);

    try {
      const res = await fetch('/api/ai/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          subject: subject === 'Auto-detect' ? undefined : subject,
          imageBase64: imagePreview || undefined,
          imageMimeType: imagePreview ? imageMimeType : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate solution.');

      setSolution({
        question: question.trim() || 'Uploaded problem image',
        subject: data.subject || subject,
        title: data.title,
        steps: Array.isArray(data.steps) ? data.steps : [],
        finalAnswer: data.finalAnswer || '',
      });
      setSubTab('solve');
      await awardXp(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to solve question.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAnswer = async () => {
    await saveSolution({
      question: solution.question,
      subject: solution.subject,
      title: solution.title,
      steps: solution.steps,
      finalAnswer: solution.finalAnswer,
    });
    setSavedConfirmed(true);
    setTimeout(() => setSavedConfirmed(false), 2500);
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = followUpInput.trim();
    if (!msg || followUpLoading) return;

    const nextHistory: FollowUpMessage[] = [...followUps, { role: 'user', text: msg }];
    setFollowUps(nextHistory);
    setFollowUpInput('');
    setFollowUpLoading(true);

    try {
      const res = await fetch('/api/ai/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: solution.question,
          subject: solution.subject,
          followUpHistory: nextHistory,
          followUpMessage: msg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Follow-up request failed.');
      setFollowUps((prev) => [...prev, { role: 'model', text: data.reply }]);
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

  const loadSavedSolution = (item: SavedSolution) => {
    setSolution({
      question: item.question,
      subject: item.subject,
      title: item.title,
      steps: item.steps,
      finalAnswer: item.finalAnswer,
    });
    setQuestion(item.question);
    setFollowUps([]);
    setSubTab('solve');
  };

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
                  <span>Saved Answers</span>
                </span>
                <span className="text-xs font-semibold tabular-nums text-[#8C93A8]">
                  {savedSolutions.length}
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
                    <option value="Theory">Theory / Humanities</option>
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
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {savedSolutions.length === 0 ? (
                  <p className="text-xs text-[#8C93A8] py-6 text-center">
                    No saved answers yet. Solve a problem and click Save Answer.
                  </p>
                ) : (
                  savedSolutions.map((item) => (
                    <div
                      key={item.id}
                      className="group p-3 rounded-xl bg-white border border-[#EAECEF] hover:border-[#6C5CE7]/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => loadSavedSolution(item)}
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <p className="text-[11px] font-semibold text-[#6C5CE7]">
                            {item.subject}
                          </p>
                          <p className="text-xs font-medium text-[#16192C] line-clamp-2 mt-0.5">
                            {item.question}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSolution(item.id)}
                          aria-label="Delete saved solution"
                          className="p-1 text-[#8C93A8] hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
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
                onClick={handleSaveAnswer}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  savedConfirmed
                    ? 'bg-[#E6F8F4] text-[#00896E]'
                    : 'bg-[#F8F9FB] border border-[#EAECEF] text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7]'
                }`}
              >
                {savedConfirmed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved Answer</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Save Answer</span>
                  </>
                )}
              </button>
            </div>

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
                          {step.formula.includes('\n') || step.formula.includes('def ') || step.formula.includes('function ') ? (
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
          </div>

          {/* Bottom Follow-Up Chat Input */}
          <form onSubmit={handleFollowUp} className="mt-6 pt-4 border-t border-[#EAECEF]">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#F8F9FB] border border-[#EAECEF] focus-within:border-[#6C5CE7] focus-within:bg-white transition-colors">
              <input
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder="Ask a follow-up question..."
                className="flex-1 bg-transparent text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none py-1"
              />
              <button
                type="submit"
                disabled={followUpLoading || !followUpInput.trim()}
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
    </div>
  );
};
