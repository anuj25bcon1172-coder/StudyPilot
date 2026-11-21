import React, { useState } from 'react';
import { Send, Loader2, Sparkles, BookOpen, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { MathFormula, RichMathText } from '../components/MathRenderer';
import { explainConceptWithAssistant } from '../lib/gemini';

interface StructuredExplanation {
  topicTitle: string;
  simpleExplanation: string;
  coreFormulaOrRule: {
    label: string;
    formula: string;
    note: string;
  };
  example: {
    scenario: string;
    expression: string;
    result: string;
  };
  walkthrough: string[];
}

export const AiLearningAssistantView: React.FC = () => {
  const { profile, awardXp } = useWorkspace();

  const [simpleEnglish, setSimpleEnglish] = useState(true);
  const [questionInput, setQuestionInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [explanation, setExplanation] = useState<StructuredExplanation | null>(null);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const askAssistant = async (promptText: string, overrideSimple?: boolean) => {
    const clean = promptText.trim();
    if (!clean) return;
    const useSimple = overrideSimple !== undefined ? overrideSimple : simpleEnglish;

    setLoading(true);
    setError('');
    setCurrentQuestion(clean);

    try {
      const data = await explainConceptWithAssistant({
        question: clean,
        simpleEnglish: useSimple,
        history,
      });

      setExplanation(data);
      setHistory((prev) => [
        ...prev,
        { role: 'user', text: clean },
        { role: 'model', text: data.simpleExplanation || data.topicTitle },
      ]);
      setQuestionInput('');
      await awardXp(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Learning Assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSimpleEnglish = () => {
    const nextVal = !simpleEnglish;
    setSimpleEnglish(nextVal);
    if (currentQuestion) {
      void askAssistant(currentQuestion, nextVal);
    }
  };

  const learningPaths = [
    {
      title: 'Algebra Basics',
      topics: '5 Topics',
      progress: profile.algebraProgress,
      prompt: 'Explain Algebra Basics: variables, balancing equations, and isolating x in Simple English.',
      gradient: 'from-[#8A7BFF] to-[#6C5CE7]',
    },
    {
      title: 'Linear Equations',
      topics: '4 Topics',
      progress: profile.linearProgress,
      prompt: 'How do Linear Equations (y = mx + b) work with slope and y-intercept?',
      gradient: 'from-[#FB7185] to-[#F43F5E]',
    },
    {
      title: 'Quadratic Equations',
      topics: '6 Topics',
      progress: profile.quadraticProgress,
      prompt: 'Explain Quadratic Equations and how to solve ax^2 + bx + c = 0 step by step.',
      gradient: 'from-[#FBBF24] to-[#F59E0B]',
    },
  ];

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#16192C] tracking-tight">
            AI Learning Assistant
          </h1>
          <p className="text-sm text-[#5A607F] mt-0.5">
            Personalized concept breakdowns with formulas, worked examples, and line-by-line walkthroughs.
          </p>
        </div>

        {/* Explain in Simple English Toggle */}
        <button
          type="button"
          onClick={handleToggleSimpleEnglish}
          className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-[#EAECEF] text-sm font-medium text-[#16192C] hover:border-[#6C5CE7]/40 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span>Explain in Simple English</span>
          <span
            className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center ${
              simpleEnglish ? 'bg-[#6C5CE7] justify-end' : 'bg-[#CBD2E0] justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Dark Indigo Tutor Card (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl bg-gradient-to-br from-[#161830] via-[#1C1F3D] to-[#262152] text-white p-6 shadow-sm flex flex-col justify-between min-h-[620px]">
          <div className="space-y-5">
            {/* Tutor Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#6C5CE7] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold">Explain Concept</p>
                  <p className="text-[11px] text-white/65">
                    {simpleEnglish ? 'Simple English Mode Active' : 'Academic Detail Mode'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['Big-O Notation', 'Chain Rule', 'Bayes Theorem'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={loading}
                    onClick={() => askAssistant(`Explain ${chip}`)}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white/90 transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/30 text-xs text-rose-100">
                {error}
              </div>
            )}

            {/* Your Question */}
            {currentQuestion && (
              <div className="p-4 rounded-xl bg-white/8 border border-white/10">
                <p className="text-[11px] font-medium text-[#A29BFE]">Your Question</p>
                <p className="text-base font-semibold mt-1">{currentQuestion}</p>
              </div>
            )}

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-7 h-7 text-[#A29BFE] animate-spin mb-3" />
                <p className="text-sm text-white/80">
                  Crafting your 4-part structured explanation...
                </p>
              </div>
            ) : explanation ? (
              <div className="space-y-4">
                {/* Section 1: Simple Explanation */}
                <div className="p-4 rounded-xl bg-white/8 border border-white/10">
                  <p className="text-xs font-semibold text-[#A29BFE] mb-1.5">
                    Simple Explanation
                  </p>
                  <p className="text-sm text-white/90 leading-relaxed">
                    <RichMathText text={explanation.simpleExplanation} />
                  </p>
                </div>

                {/* Section 2: Core Formula / Rule */}
                <div className="p-4 rounded-xl bg-white/8 border border-white/10">
                  <p className="text-xs font-semibold text-[#00D2A8] mb-2">
                    Core Formula / Rule — {explanation.coreFormulaOrRule.label}
                  </p>
                  <div className="px-4 py-2.5 rounded-lg bg-[#111322]/70 text-white overflow-x-auto">
                    <MathFormula formula={explanation.coreFormulaOrRule.formula} displayMode />
                  </div>
                  <p className="text-xs text-white/75 mt-2">
                    <RichMathText text={explanation.coreFormulaOrRule.note} />
                  </p>
                </div>

                {/* Section 3: Example */}
                <div className="p-4 rounded-xl bg-white/8 border border-white/10">
                  <p className="text-xs font-semibold text-[#A29BFE] mb-2">Example</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 120 90"
                      className="w-28 h-20 shrink-0 rounded-lg bg-[#111322]/60 p-2"
                    >
                      <polygon
                        points="18,74 18,16 102,74"
                        fill="rgba(108,92,231,0.22)"
                        stroke="#A29BFE"
                        strokeWidth="2"
                      />
                      <rect x="18" y="64" width="10" height="10" fill="none" stroke="#00D2A8" strokeWidth="1.5" />
                    </svg>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-xs text-white/80">
                        <RichMathText text={explanation.example.scenario} />
                      </p>
                      <div className="overflow-x-auto text-sm">
                        <MathFormula formula={explanation.example.expression} />
                      </div>
                      <p className="text-xs font-semibold text-[#00D2A8]">
                        Result: <RichMathText text={explanation.example.result} />
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 4: Line-by-Line Walkthrough */}
                <div className="p-4 rounded-xl bg-white/8 border border-white/10">
                  <p className="text-xs font-semibold text-[#A29BFE] mb-2">
                    Line-by-Line Walkthrough
                  </p>
                  <ol className="space-y-1.5 text-sm text-white/90">
                    {explanation.walkthrough.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="font-mono text-xs text-[#00D2A8] mt-0.5 tabular-nums">
                          {idx + 1}.
                        </span>
                        <span className="leading-relaxed">
                          <RichMathText text={step} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="py-20 px-4 flex flex-col items-center justify-center text-center">
                <span className="w-12 h-12 rounded-2xl bg-white/10 text-[#A29BFE] flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6" />
                </span>
                <p className="font-display text-base font-semibold text-white">
                  Ask any concept to start learning
                </p>
                <p className="text-xs sm:text-sm text-white/70 mt-1.5 max-w-md leading-relaxed">
                  Type a topic below, select a quick chip above, or pick a module from Your Learning Path on the right for a 4-part structured breakdown.
                </p>
              </div>
            )}
          </div>

          {/* Ask Follow-Up Question Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askAssistant(questionInput);
            }}
            className="mt-6 pt-4 border-t border-white/10"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 border border-white/15 focus-within:border-[#A29BFE]">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Ask a follow-up question or enter any topic..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none py-1"
              />
              <button
                type="submit"
                disabled={loading || !questionInput.trim()}
                aria-label="Ask AI Learning Assistant"
                className="w-9 h-9 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center hover:bg-[#5B4BD5] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Learning Path Panel (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-[#EAECEF] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-[#16192C]">
                Your Learning Path
              </h2>
              <p className="text-xs text-[#8C93A8] mt-0.5">
                Click any module to launch a guided explanation
              </p>
            </div>
            <BookOpen className="w-5 h-5 text-[#6C5CE7]" />
          </div>

          <div className="space-y-3.5">
            {learningPaths.map((path) => (
              <button
                key={path.title}
                type="button"
                onClick={() => askAssistant(path.prompt)}
                className="w-full group text-left p-3.5 rounded-2xl bg-[#F8F9FB] border border-[#EAECEF] hover:border-[#6C5CE7]/40 transition-all cursor-pointer flex items-center gap-3.5"
              >
                {/* Visual Geometric Thumbnail */}
                <div
                  className={`w-16 h-20 rounded-xl bg-gradient-to-br ${path.gradient} shrink-0 flex items-center justify-center relative overflow-hidden`}
                >
                  <svg viewBox="0 0 60 80" className="w-full h-full opacity-35" aria-hidden="true">
                    <circle cx="45" cy="18" r="20" fill="white" />
                    <path d="M0 65 Q 30 35 60 60 L 60 80 L 0 80 Z" fill="white" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-sm font-semibold text-[#16192C] group-hover:text-[#6C5CE7] transition-colors truncate">
                      {path.title}
                    </p>
                    <ChevronRight className="w-4 h-4 text-[#8C93A8] group-hover:text-[#6C5CE7] shrink-0" />
                  </div>
                  <p className="text-xs text-[#8C93A8] mt-0.5">{path.topics}</p>

                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="flex-1 h-2 rounded-full bg-[#EAECEF] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#6C5CE7]"
                        style={{ width: `${path.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-[#16192C] tabular-nums">
                      {path.progress}%
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
