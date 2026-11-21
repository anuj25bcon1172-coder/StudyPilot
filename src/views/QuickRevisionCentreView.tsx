import React, { useEffect, useState } from 'react';
import {
  FileText,
  HelpCircle,
  CheckCircle2,
  Layers,
  Clock,
  ArrowRight,
  Loader2,
  Bookmark,
  Check,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { RevisionItem, RevisionToolType } from '../types';
import { generateRevisionMaterial } from '../lib/gemini';

interface McqQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Flashcard {
  front: string;
  back: string;
  hint: string;
}

export const QuickRevisionCentreView: React.FC = () => {
  const {
    profile,
    user,
    revisionInitialTool,
    revisionInitialTab,
    revisionItems,
    saveRevisionItem,
    deleteRevisionItem,
    awardXp,
  } = useWorkspace();

  const firstName = (user?.displayName || profile.displayName || 'Student').split(' ')[0];
  const [activeTab, setActiveTab] = useState<'tools' | 'folder'>(revisionInitialTab);
  const [selectedTool, setSelectedTool] = useState<RevisionToolType>(revisionInitialTool);
  const [topicInput, setTopicInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  // Structured tool results
  const [resultTopic, setResultTopic] = useState('');
  const [notesData, setNotesData] = useState<Array<{ heading: string; points: string[] }>>([]);
  const [questionsData, setQuestionsData] = useState<
    Array<{ question: string; difficulty: string; keyPoints: string }>
  >([]);
  const [mcqData, setMcqData] = useState<McqQuestion[]>([]);
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>({});
  const [mcqXpClaimed, setMcqXpClaimed] = useState(false);

  const [flashcardsData, setFlashcardsData] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [summaryData, setSummaryData] = useState<{
    summaryText: string;
    takeaways: string[];
    mustRememberFormula: string;
    fiveMinChecklist: string[];
  } | null>(null);

  useEffect(() => {
    setSelectedTool(revisionInitialTool);
  }, [revisionInitialTool]);

  useEffect(() => {
    setActiveTab(revisionInitialTab);
  }, [revisionInitialTab]);

  const runTool = async (tool: RevisionToolType) => {
    if (!topicInput.trim()) {
      setError('Please enter a topic or paste your study notes first.');
      return;
    }
    setSelectedTool(tool);
    setActiveTab('tools');
    setLoading(true);
    setError('');
    setSavedNotice(false);

    try {
      const data = await generateRevisionMaterial({
        tool,
        input: topicInput.trim(),
      });

      setResultTopic(
        typeof data.topic === 'string' && data.topic
          ? data.topic
          : topicInput.trim().slice(0, 60)
      );

      if (tool === 'notes') {
        setNotesData(
          Array.isArray(data.sections)
            ? (data.sections as Array<{ heading: string; points: string[] }>)
            : []
        );
      } else if (tool === 'questions') {
        setQuestionsData(
          Array.isArray(data.questions)
            ? (data.questions as Array<{ question: string; difficulty: string; keyPoints: string }>)
            : []
        );
      } else if (tool === 'mcq') {
        setMcqData(Array.isArray(data.mcqs) ? (data.mcqs as McqQuestion[]) : []);
        setMcqAnswers({});
        setMcqXpClaimed(false);
      } else if (tool === 'flashcards') {
        setFlashcardsData(
          Array.isArray(data.flashcards) ? (data.flashcards as Flashcard[]) : []
        );
        setCardIndex(0);
        setCardFlipped(false);
        setShowHint(false);
      } else if (tool === 'summary') {
        setSummaryData({
          summaryText: typeof data.summaryText === 'string' ? data.summaryText : '',
          takeaways: Array.isArray(data.takeaways) ? (data.takeaways as string[]) : [],
          mustRememberFormula:
            typeof data.mustRememberFormula === 'string' ? data.mustRememberFormula : '',
          fiveMinChecklist: Array.isArray(data.fiveMinChecklist)
            ? (data.fiveMinChecklist as string[])
            : [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate revision pack.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMcqOption = async (qIdx: number, optIdx: number) => {
    if (mcqAnswers[qIdx] !== undefined) return;
    const nextAnswers = { ...mcqAnswers, [qIdx]: optIdx };
    setMcqAnswers(nextAnswers);

    if (
      !mcqXpClaimed &&
      mcqData.length > 0 &&
      Object.keys(nextAnswers).length === mcqData.length
    ) {
      setMcqXpClaimed(true);
      await awardXp(20);
    }
  };

  const handleSaveToFolder = async () => {
    let items: Array<Record<string, unknown>> = [];
    let summaryText = resultTopic || topicInput.trim();

    if (selectedTool === 'notes') {
      items = notesData as unknown as Array<Record<string, unknown>>;
    } else if (selectedTool === 'questions') {
      items = questionsData as unknown as Array<Record<string, unknown>>;
    } else if (selectedTool === 'mcq') {
      items = mcqData as unknown as Array<Record<string, unknown>>;
    } else if (selectedTool === 'flashcards') {
      items = flashcardsData as unknown as Array<Record<string, unknown>>;
    } else if (selectedTool === 'summary' && summaryData) {
      summaryText = summaryData.summaryText;
      items = [{ takeaways: summaryData.takeaways, formula: summaryData.mustRememberFormula }];
    }

    await saveRevisionItem({
      toolType: selectedTool,
      topic: resultTopic || topicInput.trim().slice(0, 120),
      summaryText,
      items,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const openSavedItem = (item: RevisionItem) => {
    setResultTopic(item.topic);
    setSelectedTool(item.toolType);
    setActiveTab('tools');

    if (item.toolType === 'notes') {
      setNotesData(item.items as unknown as Array<{ heading: string; points: string[] }>);
    } else if (item.toolType === 'questions') {
      setQuestionsData(
        item.items as unknown as Array<{ question: string; difficulty: string; keyPoints: string }>
      );
    } else if (item.toolType === 'mcq') {
      setMcqData(item.items as unknown as McqQuestion[]);
      setMcqAnswers({});
      setMcqXpClaimed(false);
    } else if (item.toolType === 'flashcards') {
      setFlashcardsData(item.items as unknown as Flashcard[]);
      setCardIndex(0);
      setCardFlipped(false);
    } else if (item.toolType === 'summary') {
      const first = (item.items[0] || {}) as { takeaways?: string[]; formula?: string };
      setSummaryData({
        summaryText: item.summaryText,
        takeaways: Array.isArray(first.takeaways) ? first.takeaways : [],
        mustRememberFormula: first.formula || '',
        fiveMinChecklist: [],
      });
    }
  };

  const toolCards: Array<{
    id: RevisionToolType;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'notes', title: 'Notes', subtitle: 'Generate notes', icon: FileText },
    {
      id: 'questions',
      title: 'Important Question',
      subtitle: 'Create questions',
      icon: HelpCircle,
    },
    { id: 'mcq', title: 'MCQ', subtitle: 'Generate mcq (+20 XP)', icon: CheckCircle2 },
    { id: 'flashcards', title: 'Flashcard', subtitle: 'Create flashcards', icon: Layers },
  ];

  const hasResult =
    (selectedTool === 'notes' && notesData.length > 0) ||
    (selectedTool === 'questions' && questionsData.length > 0) ||
    (selectedTool === 'mcq' && mcqData.length > 0) ||
    (selectedTool === 'flashcards' && flashcardsData.length > 0) ||
    (selectedTool === 'summary' && summaryData !== null);

  const mcqScore = mcqData.reduce((acc, q, idx) => {
    return acc + (mcqAnswers[idx] === q.correctIndex ? 1 : 0);
  }, 0);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto space-y-6">
      {/* Emerald Teal Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#00B894] to-[#00997A] text-white p-6 sm:p-7 shadow-sm">
        <p className="text-xs font-medium text-white/90">Hey, {firstName}</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          Quick Revision of all themes
        </h1>
        <p className="text-sm text-white/85 mt-1">
          Select any tool to start your quick revision
        </p>

        <div className="mt-5 inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'tools'
                ? 'bg-white text-[#00896E]'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Revision Tools
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('folder')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'folder'
                ? 'bg-white text-[#00896E]'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            My Folder ({revisionItems.length})
          </button>
        </div>
      </div>

      {activeTab === 'folder' ? (
        <div className="bg-white border border-[#EAECEF] rounded-2xl p-6">
          <h2 className="font-display text-base font-semibold text-[#16192C] mb-4">
            Saved Revision Packs
          </h2>
          {revisionItems.length === 0 ? (
            <p className="text-sm text-[#8C93A8] py-8 text-center">
              Your folder is empty. Generate notes, flashcards, or quizzes and save them here.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {revisionItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-[#F8F9FB] border border-[#EAECEF] flex flex-col justify-between gap-3"
                >
                  <div>
                    <span className="text-[11px] font-semibold uppercase text-[#00896E]">
                      {item.toolType}
                    </span>
                    <h3 className="font-display text-sm font-semibold text-[#16192C] mt-1">
                      {item.topic}
                    </h3>
                    <p className="text-xs text-[#5A607F] mt-1 line-clamp-2">{item.summaryText}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#EAECEF]">
                    <button
                      type="button"
                      onClick={() => openSavedItem(item)}
                      className="text-xs font-semibold text-[#6C5CE7] hover:underline cursor-pointer"
                    >
                      Open Pack
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRevisionItem(item.id)}
                      aria-label={`Delete ${item.topic}`}
                      className="p-1 text-[#8C93A8] hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Notes / Topic Input */}
          <div className="bg-white border border-[#EAECEF] rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-[#16192C]">
                Paste Study Notes or Enter a Topic
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Cellular Respiration', 'React Hooks & State', 'Calculus Derivatives'].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTopicInput(preset)}
                      className="px-2.5 py-1 rounded-lg bg-[#F8F9FB] border border-[#EAECEF] text-xs text-[#5A607F] hover:border-[#00B894] hover:text-[#00896E] cursor-pointer"
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
            </div>
            <textarea
              rows={3}
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Paste lecture notes, a chapter outline, or any exam topic..."
              className="w-full p-3.5 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#00B894] resize-none"
            />
          </div>

          {/* Select Tools 4-Card Grid */}
          <section>
            <h2 className="font-display text-sm font-semibold text-[#16192C] mb-3">
              Select Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {toolCards.map((card) => {
                const Icon = card.icon;
                const isSelected = selectedTool === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={loading}
                    onClick={() => runTool(card.id)}
                    className={`group bg-white rounded-2xl p-5 text-left border transition-all cursor-pointer flex flex-col justify-between min-h-[132px] ${
                      isSelected
                        ? 'border-[#6C5CE7] shadow-sm'
                        : 'border-[#EAECEF] hover:border-[#6C5CE7]/40'
                    }`}
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>

                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-semibold text-[#16192C]">
                          {card.title}
                        </p>
                        <p className="text-xs text-[#8C93A8] mt-0.5">{card.subtitle}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#6C5CE7] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Bottom 5 Minutes Revision Rapid Summary Button */}
          <button
            type="button"
            disabled={loading}
            onClick={() => runTool('summary')}
            className="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-[#E6F8F4] hover:bg-[#D4F3EB] border border-[#00B894]/25 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-white text-[#00B894] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-[#0D6E59]">
                  5 Minutes Revision
                </p>
                <p className="text-xs text-[#00896E]">
                  Get rapid high-yield summary in short time
                </p>
              </div>
            </div>
            <span className="px-3.5 py-2 rounded-xl bg-[#00B894] text-white text-xs font-semibold whitespace-nowrap shrink-0">
              Generate Summary
            </span>
          </button>

          {/* Error Display */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Output Stage */}
          {loading ? (
            <div className="bg-white border border-[#EAECEF] rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-7 h-7 text-[#00B894] animate-spin mb-3" />
              <p className="text-sm font-medium text-[#16192C]">
                Generating interactive study material with Gemini...
              </p>
            </div>
          ) : hasResult ? (
            <div className="bg-white border border-[#EAECEF] rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EAECEF]">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#00896E]">
                    {selectedTool === 'summary' ? '5-Minute Rapid Summary' : selectedTool}
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#16192C] mt-0.5">
                    {resultTopic}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleSaveToFolder}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    savedNotice
                      ? 'bg-[#E6F8F4] text-[#00896E]'
                      : 'bg-[#F8F9FB] border border-[#EAECEF] text-[#16192C] hover:border-[#00B894]'
                  }`}
                >
                  {savedNotice ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved to Folder</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save to My Folder</span>
                    </>
                  )}
                </button>
              </div>

              {/* Notes Output */}
              {selectedTool === 'notes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {notesData.map((sec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF]"
                    >
                      <h4 className="font-display text-sm font-semibold text-[#16192C] mb-2">
                        {sec.heading}
                      </h4>
                      <ul className="space-y-1.5 text-sm text-[#3F4562] list-disc list-inside">
                        {sec.points.map((pt, pIdx) => (
                          <li key={pIdx}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Important Questions Output */}
              {selectedTool === 'questions' && (
                <div className="space-y-3">
                  {questionsData.map((q, idx) => (
                    <details
                      key={idx}
                      open={idx === 0}
                      className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF]"
                    >
                      <summary className="font-medium text-sm text-[#16192C] cursor-pointer flex items-center justify-between gap-2">
                        <span>
                          {idx + 1}. {q.question}
                        </span>
                        <span className="text-xs font-semibold text-[#6C5CE7] shrink-0">
                          {q.difficulty}
                        </span>
                      </summary>
                      <p className="mt-2.5 pt-2.5 border-t border-[#EAECEF] text-xs text-[#3F4562] leading-relaxed">
                        Key Answer Points: {q.keyPoints}
                      </p>
                    </details>
                  ))}
                </div>
              )}

              {/* Interactive MCQ Quiz (+20 XP) */}
              {selectedTool === 'mcq' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F1EFFE] text-xs font-semibold text-[#6C5CE7]">
                    <span>
                      Progress: {Object.keys(mcqAnswers).length}/{mcqData.length} answered · Score:{' '}
                      <span className="tabular-nums">{mcqScore}/{mcqData.length}</span>
                    </span>
                    {mcqXpClaimed ? (
                      <span className="text-[#00896E]">+20 XP Awarded!</span>
                    ) : (
                      <span>Complete all questions to earn +20 XP</span>
                    )}
                  </div>

                  {mcqData.map((q, qIdx) => {
                    const chosen = mcqAnswers[qIdx];
                    const isAnswered = chosen !== undefined;
                    return (
                      <div
                        key={qIdx}
                        className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] space-y-3"
                      >
                        <p className="text-sm font-semibold text-[#16192C]">
                          {qIdx + 1}. {q.question}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = oIdx === q.correctIndex;
                            const isChosen = chosen === oIdx;
                            let style =
                              'bg-white border-[#EAECEF] text-[#16192C] hover:border-[#6C5CE7]';
                            if (isAnswered) {
                              if (isCorrect) {
                                style = 'bg-[#E6F8F4] border-[#00B894] text-[#0D6E59] font-medium';
                              } else if (isChosen) {
                                style = 'bg-rose-50 border-rose-400 text-rose-800';
                              } else {
                                style = 'bg-white border-[#EAECEF] text-[#8C93A8] opacity-75';
                              }
                            }
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                disabled={isAnswered}
                                onClick={() => handleSelectMcqOption(qIdx, oIdx)}
                                className={`p-3 rounded-xl border text-left text-xs transition-colors cursor-pointer ${style}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {isAnswered && (
                          <p className="text-xs text-[#5A607F] pt-1">
                            Explanation: {q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Interactive Flip Flashcards */}
              {selectedTool === 'flashcards' && flashcardsData.length > 0 && (
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="flex items-center justify-between text-xs text-[#5A607F]">
                    <span className="tabular-nums font-medium">
                      Card {cardIndex + 1} of {flashcardsData.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHint((h) => !h)}
                      className="text-[#6C5CE7] font-medium hover:underline cursor-pointer"
                    >
                      {showHint ? 'Hide Hint' : 'Show Hint'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCardFlipped((f) => !f)}
                    className={`w-full min-h-[220px] p-7 rounded-2xl border text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                      cardFlipped
                        ? 'bg-[#16192C] border-[#16192C] text-white'
                        : 'bg-[#F8F9FB] border-[#EAECEF] text-[#16192C] hover:border-[#6C5CE7]'
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide opacity-65 mb-2">
                      {cardFlipped ? 'Answer' : 'Prompt (Click to flip)'}
                    </span>
                    <p className="font-display text-lg font-semibold leading-relaxed">
                      {cardFlipped
                        ? flashcardsData[cardIndex].back
                        : flashcardsData[cardIndex].front}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs opacity-65">
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Tap card to flip</span>
                    </span>
                  </button>

                  {showHint && (
                    <p className="text-xs text-center text-[#5A607F] bg-[#F1EFFE] rounded-xl p-2.5">
                      Hint: {flashcardsData[cardIndex].hint}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={cardIndex === 0}
                      onClick={() => {
                        setCardIndex((i) => Math.max(0, i - 1));
                        setCardFlipped(false);
                        setShowHint(false);
                      }}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-[#EAECEF] text-xs font-medium text-[#16192C] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      disabled={cardIndex === flashcardsData.length - 1}
                      onClick={() => {
                        setCardIndex((i) => Math.min(flashcardsData.length - 1, i + 1));
                        setCardFlipped(false);
                        setShowHint(false);
                      }}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#6C5CE7] text-white text-xs font-medium disabled:opacity-40 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* 5 Minutes Revision Rapid Summary */}
              {selectedTool === 'summary' && summaryData && (
                <div className="space-y-4">
                  <p className="text-sm text-[#16192C] leading-relaxed">
                    {summaryData.summaryText}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[#F8F9FB] border border-[#EAECEF]">
                      <h4 className="font-display text-sm font-semibold text-[#16192C] mb-2">
                        Core Takeaways
                      </h4>
                      <ul className="space-y-1.5 text-sm text-[#3F4562] list-disc list-inside">
                        {summaryData.takeaways.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      {summaryData.mustRememberFormula && (
                        <div className="p-4 rounded-xl bg-[#F1EFFE] border border-[#6C5CE7]/25">
                          <h4 className="font-display text-xs font-semibold text-[#6C5CE7] mb-1">
                            Must-Remember Formula / Rule
                          </h4>
                          <p className="text-sm font-semibold text-[#16192C]">
                            {summaryData.mustRememberFormula}
                          </p>
                        </div>
                      )}
                      {summaryData.fiveMinChecklist.length > 0 && (
                        <div className="p-4 rounded-xl bg-[#E6F8F4]/70 border border-[#00B894]/25">
                          <h4 className="font-display text-xs font-semibold text-[#00896E] mb-1.5">
                            5-Minute Recall Checklist
                          </h4>
                          <ul className="space-y-1 text-xs text-[#0D6E59] list-disc list-inside">
                            {summaryData.fiveMinChecklist.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
