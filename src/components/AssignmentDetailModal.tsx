import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  FileText,
  Upload,
  Download,
  Trash2,
  Check,
  Copy,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Bookmark,
  PenLine,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  downloadAttachment,
  formatFileSize,
  isSafeAttachmentUrl,
  processAssignmentFile,
} from '../lib/fileAttachment';
import { formatSolvedAssignmentText } from '../lib/formatSolution';
import { MathFormula, RichMathText } from './MathRenderer';
import { Assignment, AssignmentAttachment, SolvedAssignment } from '../types';

interface AssignmentDetailModalProps {
  assignment: Assignment | null;
  onClose: () => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export const AssignmentDetailModal: React.FC<AssignmentDetailModalProps> = ({
  assignment,
  onClose,
  onToast,
}) => {
  const {
    solvedAssignments,
    updateAssignmentDetails,
    updateAssignmentStatus,
    setSelectedSolvedAssignment,
    setPendingSolverPrompt,
    setActiveView,
  } = useWorkspace();

  const [questionDraft, setQuestionDraft] = useState('');
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<'question' | 'handwritten' | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);
  const [error, setError] = useState('');

  const questionFileInputRef = useRef<HTMLInputElement | null>(null);
  const handwrittenFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!assignment) return;
    setQuestionDraft(assignment.questionText || '');
    setEditingQuestion(false);
    setError('');
  }, [assignment?.id, assignment?.questionText]);

  const matchedSolvedAssignment: SolvedAssignment | null = useMemo(() => {
    if (!assignment) return null;
    if (assignment.linkedSolvedAssignmentId) {
      const explicit = solvedAssignments.find((s) => s.id === assignment.linkedSolvedAssignmentId);
      if (explicit) return explicit;
    }
    const lowerTitle = assignment.title.trim().toLowerCase();
    const lowerQuestion = (assignment.questionText || '').trim().toLowerCase();
    return (
      solvedAssignments.find((s) => {
        const sName = s.assignmentName.trim().toLowerCase();
        const sQuestion = s.question.trim().toLowerCase();
        return (
          sName === lowerTitle ||
          lowerTitle.includes(sName) ||
          sName.includes(lowerTitle) ||
          (lowerQuestion.length > 10 && sQuestion === lowerQuestion)
        );
      }) || null
    );
  }, [assignment, solvedAssignments]);

  if (!assignment) return null;

  const extractReadableError = (err: unknown, fallback: string): string => {
    let msg = err instanceof Error ? err.message : fallback;
    if (msg.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg) as { error?: string };
        if (parsed.error) msg = parsed.error;
      } catch {
        // Keep original message
      }
    }
    return msg;
  };

  const handleSaveQuestionText = async () => {
    setSavingQuestion(true);
    setError('');
    try {
      await updateAssignmentDetails(assignment.id, {
        questionText: questionDraft,
      });
      setEditingQuestion(false);
      onToast('Assignment question updated.');
    } catch (err) {
      const msg = extractReadableError(err, 'Unable to save assignment question.');
      setError(msg);
      onToast(msg, 'error');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleUploadFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'question' | 'handwritten'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingTarget(target);
    setError('');
    try {
      const attachment = await processAssignmentFile(file);
      if (target === 'question') {
        await updateAssignmentDetails(assignment.id, { questionFile: attachment });
        onToast(`Uploaded question file "${attachment.name}".`);
      } else {
        await updateAssignmentDetails(assignment.id, { handwrittenSolution: attachment });
        onToast(`Saved handwritten solution "${attachment.name}".`);
      }
    } catch (err) {
      const msg = extractReadableError(err, 'Unable to upload file.');
      setError(msg);
      onToast(msg, 'error');
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleRemoveFile = async (target: 'question' | 'handwritten') => {
    setUploadingTarget(target);
    setError('');
    try {
      if (target === 'question') {
        await updateAssignmentDetails(assignment.id, { questionFile: null });
        onToast('Removed question file.');
      } else {
        await updateAssignmentDetails(assignment.id, { handwrittenSolution: null });
        onToast('Removed handwritten solution.');
      }
    } catch (err) {
      const msg = extractReadableError(err, 'Unable to remove file.');
      setError(msg);
      onToast(msg, 'error');
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleLinkSolvedAssignment = async (solvedId: string) => {
    setError('');
    try {
      await updateAssignmentDetails(assignment.id, {
        linkedSolvedAssignmentId: solvedId || null,
      });
      onToast(solvedId ? 'Linked saved AI solution.' : 'Unlinked AI solution.');
    } catch (err) {
      const msg = extractReadableError(err, 'Unable to link saved solution.');
      setError(msg);
      onToast(msg, 'error');
    }
  };

  const handleDownload = (att: AssignmentAttachment) => {
    try {
      downloadAttachment(att);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Download failed.', 'error');
    }
  };

  const handleSolveWithAi = () => {
    setPendingSolverPrompt({
      question: assignment.questionText?.trim() || assignment.title,
      subject: assignment.subject,
    });
    onClose();
    setActiveView('solver');
  };

  const handleOpenSavedInSolver = (item: SolvedAssignment) => {
    setSelectedSolvedAssignment(item);
    onClose();
    setActiveView('solver');
  };

  const handleCopyAiSolution = async (item: SolvedAssignment) => {
    try {
      await navigator.clipboard.writeText(formatSolvedAssignmentText(item));
      setCopiedAi(true);
      onToast('Copied AI solution to clipboard.');
      setTimeout(() => setCopiedAi(false), 2000);
    } catch {
      onToast('Unable to copy solution.', 'error');
    }
  };

  const formatReadableDate = (iso: string) => {
    const dt = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusBadge =
    assignment.status === 'Completed'
      ? 'bg-[#E6F8F4] text-[#00896E]'
      : assignment.status === 'Overdue'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-[#F1EFFE] text-[#6C5CE7]';

  const renderAttachmentPreview = (att: AssignmentAttachment) => {
    if (!isSafeAttachmentUrl(att.dataUrl)) {
      return (
        <p className="text-xs text-rose-600 p-3 bg-rose-50 rounded-xl">
          Attachment preview unavailable.
        </p>
      );
    }
    if (att.mimeType === 'application/pdf') {
      return (
        <div className="rounded-xl overflow-hidden border border-[#EAECEF] bg-[#F8F9FB]">
          <iframe
            title={att.name}
            src={att.dataUrl}
            className="w-full h-80 bg-white"
          />
        </div>
      );
    }
    return (
      <div className="rounded-xl overflow-hidden border border-[#EAECEF] bg-[#F8F9FB] p-2 flex items-center justify-center">
        <img
          src={att.dataUrl}
          alt={att.name}
          className="max-h-96 w-auto object-contain rounded-lg"
        />
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#16192C]/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-detail-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#EAECEF] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#EAECEF] flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-[#F1EFFE] text-[#6C5CE7] text-xs font-semibold">
                {assignment.subject}
              </span>
              <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${statusBadge}`}>
                {assignment.status}
              </span>
              <span className="text-xs text-[#8C93A8] tabular-nums">
                Due {formatReadableDate(assignment.dueDate)}
              </span>
            </div>
            <h2
              id="assignment-detail-modal-title"
              className="font-display text-lg font-bold text-[#16192C] mt-1.5"
            >
              {assignment.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {assignment.status !== 'Completed' && (
              <button
                type="button"
                onClick={() => updateAssignmentStatus(assignment.id, 'Completed')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E6F8F4] text-[#00896E] hover:bg-[#D1F2EA] text-xs font-semibold transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark Completed</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assignment details"
              className="p-2 rounded-xl text-[#8C93A8] hover:text-[#16192C] hover:bg-[#F3F4F8] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* 1. Assignment Question Section */}
          <section className="p-5 rounded-2xl bg-[#FAFBFD] border border-[#EAECEF] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#16192C]">
                    Assignment Question
                  </h3>
                  <p className="text-[11px] text-[#8C93A8]">
                    Store the problem prompt text and/or an uploaded question sheet (JPG, PNG, PDF)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingQuestion((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>{assignment.questionText ? 'Edit Question' : 'Add Question Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSolveWithAi}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6C5CE7] text-white text-xs font-semibold hover:bg-[#5B4BD5] transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Solve with AI</span>
                </button>
              </div>
            </div>

            {editingQuestion ? (
              <div className="space-y-2.5">
                <textarea
                  rows={4}
                  value={questionDraft}
                  onChange={(e) => setQuestionDraft(e.target.value)}
                  maxLength={6000}
                  placeholder="Enter or paste the assignment question..."
                  className="w-full p-3.5 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:border-[#6C5CE7] resize-y"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuestionDraft(assignment.questionText || '');
                      setEditingQuestion(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#5A607F] hover:bg-[#F3F4F8] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingQuestion}
                    onClick={handleSaveQuestionText}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#6C5CE7] text-white text-xs font-semibold hover:bg-[#5B4BD5] disabled:opacity-60 cursor-pointer"
                  >
                    {savingQuestion ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Question</span>
                    )}
                  </button>
                </div>
              </div>
            ) : assignment.questionText ? (
              <div className="p-4 rounded-xl bg-white border border-[#EAECEF] text-sm text-[#16192C] whitespace-pre-wrap leading-relaxed">
                {assignment.questionText}
              </div>
            ) : (
              <p className="text-xs text-[#8C93A8] italic">
                No question text added yet. Click &ldquo;Add Question Text&rdquo; to paste the prompt.
              </p>
            )}

            {/* Question File Upload / Preview */}
            <input
              ref={questionFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => handleUploadFile(e, 'question')}
              className="hidden"
            />
            {assignment.questionFile ? (
              <div className="space-y-3 pt-2 border-t border-[#EAECEF]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {assignment.questionFile.mimeType === 'application/pdf' ? (
                      <FileText className="w-4 h-4 text-[#6C5CE7] shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#6C5CE7] shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-[#16192C] truncate">
                      {assignment.questionFile.name}
                    </span>
                    <span className="text-[11px] text-[#8C93A8]">
                      ({formatFileSize(assignment.questionFile.sizeBytes)})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownload(assignment.questionFile!)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      disabled={uploadingTarget === 'question'}
                      onClick={() => questionFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      disabled={uploadingTarget === 'question'}
                      onClick={() => handleRemoveFile('question')}
                      aria-label="Remove question file"
                      className="p-1.5 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {renderAttachmentPreview(assignment.questionFile)}
              </div>
            ) : (
              <button
                type="button"
                disabled={uploadingTarget === 'question'}
                onClick={() => questionFileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-[#CBD2E0] bg-white text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {uploadingTarget === 'question' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Question File...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload Question File (JPG, PNG, or PDF)</span>
                  </>
                )}
              </button>
            )}
          </section>

          {/* 2. Handwritten Solution Section */}
          <section className="p-5 rounded-2xl bg-[#FAFBFD] border border-[#EAECEF] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#E6F8F4] text-[#00896E] flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#16192C]">
                    Uploaded Handwritten Solution
                  </h3>
                  <p className="text-[11px] text-[#8C93A8]">
                    Supports JPG, PNG, or PDF — images are automatically compressed for fast cloud sync
                  </p>
                </div>
              </div>

              <input
                ref={handwrittenFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleUploadFile(e, 'handwritten')}
                className="hidden"
              />

              {assignment.handwrittenSolution && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(assignment.handwrittenSolution!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00B894] text-white text-xs font-semibold hover:bg-[#00A383] transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploadingTarget === 'handwritten'}
                    onClick={() => handwrittenFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploadingTarget === 'handwritten'}
                    onClick={() => handleRemoveFile('handwritten')}
                    aria-label="Remove handwritten solution"
                    className="p-1.5 rounded-lg text-[#8C93A8] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {assignment.handwrittenSolution ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-[#5A607F]">
                  {assignment.handwrittenSolution.mimeType === 'application/pdf' ? (
                    <FileText className="w-4 h-4 text-[#00896E]" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-[#00896E]" />
                  )}
                  <span className="font-semibold text-[#16192C]">
                    {assignment.handwrittenSolution.name}
                  </span>
                  <span className="text-[#8C93A8]">
                    · {formatFileSize(assignment.handwrittenSolution.sizeBytes)}
                  </span>
                </div>
                {renderAttachmentPreview(assignment.handwrittenSolution)}
              </div>
            ) : (
              <button
                type="button"
                disabled={uploadingTarget === 'handwritten'}
                onClick={() => handwrittenFileInputRef.current?.click()}
                className="w-full py-7 px-4 rounded-xl border-2 border-dashed border-[#CBD2E0] bg-white hover:border-[#00B894] hover:bg-[#E6F8F4]/30 transition-colors flex flex-col items-center justify-center text-center cursor-pointer disabled:opacity-60"
              >
                {uploadingTarget === 'handwritten' ? (
                  <>
                    <Loader2 className="w-6 h-6 text-[#00B894] animate-spin mb-2" />
                    <span className="text-xs font-semibold text-[#16192C]">
                      Compressing &amp; saving to Firestore...
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-[#00B894] mb-2" />
                    <span className="text-sm font-semibold text-[#16192C]">
                      Upload Handwritten Solution
                    </span>
                    <span className="text-xs text-[#8C93A8] mt-0.5">
                      Click to select a JPG, PNG scan or PDF (under 300 KB)
                    </span>
                  </>
                )}
              </button>
            )}
          </section>

          {/* 3. AI / Saved Solution Section */}
          <section className="p-5 rounded-2xl bg-[#FAFBFD] border border-[#EAECEF] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#F1EFFE] text-[#6C5CE7] flex items-center justify-center">
                  <Bookmark className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#16192C]">
                    AI / Saved Solution
                  </h3>
                  <p className="text-[11px] text-[#8C93A8]">
                    Step-by-step solution linked from your Saved Solutions library
                  </p>
                </div>
              </div>

              {solvedAssignments.length > 0 && (
                <select
                  aria-label="Link a saved AI solution"
                  value={matchedSolvedAssignment?.id || ''}
                  onChange={(e) => handleLinkSolvedAssignment(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#EAECEF] text-xs text-[#16192C] focus:outline-none focus:border-[#6C5CE7] max-w-xs"
                >
                  <option value="">Link a Saved Solution...</option>
                  {solvedAssignments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.assignmentName} ({s.subject})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {matchedSolvedAssignment ? (
              <div className="p-4 rounded-xl bg-white border border-[#EAECEF] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EAECEF]">
                  <div>
                    <p className="text-xs font-semibold text-[#6C5CE7]">
                      {matchedSolvedAssignment.subject}
                    </p>
                    <p className="text-sm font-bold text-[#16192C]">
                      {matchedSolvedAssignment.assignmentName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyAiSolution(matchedSolvedAssignment)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F8F9FB] border border-[#EAECEF] text-xs font-medium text-[#16192C] hover:border-[#6C5CE7] hover:text-[#6C5CE7] cursor-pointer"
                    >
                      {copiedAi ? (
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
                      onClick={() => handleOpenSavedInSolver(matchedSolvedAssignment)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F1EFFE] text-[#6C5CE7] hover:bg-[#E7E3FD] text-xs font-semibold cursor-pointer"
                    >
                      <span>Open in Solver</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {matchedSolvedAssignment.solution.steps.map((step) => (
                    <div key={step.stepNumber} className="space-y-1.5">
                      <h4 className="font-display text-xs font-semibold text-[#16192C]">
                        Step {step.stepNumber}: {step.title}
                      </h4>
                      <p className="text-xs text-[#3F4562] leading-relaxed">
                        <RichMathText text={step.explanation} />
                      </p>
                      {step.formula && (
                        <div className="px-3 py-2.5 rounded-xl bg-[#F8F9FB] border border-[#EAECEF] overflow-x-auto">
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

                {matchedSolvedAssignment.solution.finalAnswer && (
                  <div className="p-3.5 rounded-xl bg-[#E6F8F4]/70 border border-[#00B894]/30">
                    <p className="text-[11px] font-semibold text-[#00896E] mb-0.5">Final Answer</p>
                    <div className="text-xs font-semibold text-[#16192C]">
                      <RichMathText text={matchedSolvedAssignment.solution.finalAnswer} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white border border-[#EAECEF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-[#5A607F]">
                  No AI solution linked to this assignment yet. Generate one in the AI Solver or select an existing saved solution above.
                </p>
                <button
                  type="button"
                  onClick={handleSolveWithAi}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1EFFE] text-[#6C5CE7] hover:bg-[#E7E3FD] text-xs font-semibold shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate AI Solution</span>
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#EAECEF] bg-[#FAFBFD] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-[#EAECEF] text-xs font-semibold text-[#16192C] hover:bg-[#F3F4F8] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
