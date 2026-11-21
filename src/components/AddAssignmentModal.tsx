import React, { useRef, useState } from 'react';
import {
  X,
  Calendar,
  BookOpen,
  CheckCircle2,
  FileText,
  Upload,
  Image as ImageIcon,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatFileSize, processAssignmentFile } from '../lib/fileAttachment';
import { AssignmentAttachment, AssignmentStatus } from '../types';

export const AddAssignmentModal: React.FC = () => {
  const { isAddAssignmentOpen, setIsAddAssignmentOpen, addAssignment } = useWorkspace();

  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [dueDate, setDueDate] = useState(today);
  const [status, setStatus] = useState<AssignmentStatus>('Pending');
  const [questionText, setQuestionText] = useState('');
  const [questionFile, setQuestionFile] = useState<AssignmentAttachment | null>(null);
  const [handwrittenSolution, setHandwrittenSolution] = useState<AssignmentAttachment | null>(null);
  const [processingTarget, setProcessingTarget] = useState<'question' | 'handwritten' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const questionFileRef = useRef<HTMLInputElement | null>(null);
  const handwrittenFileRef = useRef<HTMLInputElement | null>(null);

  if (!isAddAssignmentOpen) return null;

  const resetForm = () => {
    setTitle('');
    setSubject('Mathematics');
    setDueDate(today);
    setStatus('Pending');
    setQuestionText('');
    setQuestionFile(null);
    setHandwrittenSolution(null);
    setError('');
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'question' | 'handwritten'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessingTarget(target);
    setError('');
    try {
      const processed = await processAssignmentFile(file);
      if (target === 'question') {
        setQuestionFile(processed);
      } else {
        setHandwrittenSolution(processed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process selected file.');
    } finally {
      setProcessingTarget(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !dueDate) {
      setError('Please fill in the assignment title, subject, and due date.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addAssignment({
        title,
        subject,
        dueDate,
        status,
        questionText: questionText.trim() || undefined,
        questionFile: questionFile || undefined,
        handwrittenSolution: handwrittenSolution || undefined,
      });
      resetForm();
      setIsAddAssignmentOpen(false);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Unable to save assignment.';
      if (msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          // Keep original message
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#16192C]/45 p-4 backdrop-blur-[2px]"
      onClick={() => setIsAddAssignmentOpen(false)}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-2xl border border-[#EAECEF] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#EAECEF]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#16192C]">Add Assignment</h2>
            <p className="text-xs text-[#5A607F] mt-0.5">
              Schedule coursework, paste the question, and attach your handwritten solution
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddAssignmentOpen(false)}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#8C93A8] hover:text-[#16192C] hover:bg-[#F3F4F8] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#16192C] mb-1.5">
              Assignment Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Linear Algebra Problem Set 4"
              maxLength={160}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#16192C] mb-1.5">
                Subject
              </label>
              <div className="relative">
                <BookOpen className="w-4 h-4 text-[#8C93A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Mathematics..."
                  maxLength={80}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#16192C] mb-1.5">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-[#8C93A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-9 pr-2.5 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] tabular-nums focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#16192C] mb-1.5">
                Status
              </label>
              <div className="relative">
                <CheckCircle2 className="w-4 h-4 text-[#8C93A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
                >
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            </div>
          </div>

          {/* Assignment Question Text */}
          <div>
            <label className="block text-xs font-medium text-[#16192C] mb-1.5">
              Assignment Question <span className="text-[#8C93A8] font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              maxLength={6000}
              placeholder="Paste or type the assignment question or prompt..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors resize-none"
            />
          </div>

          {/* Question File & Handwritten Solution Uploaders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Question File */}
            <div className="p-3.5 rounded-xl bg-[#FAFBFD] border border-[#EAECEF] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#16192C]">Question File</span>
                <span className="text-[10px] text-[#8C93A8]">JPG, PNG, PDF</span>
              </div>
              <input
                ref={questionFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileChange(e, 'question')}
                className="hidden"
              />
              {questionFile ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-[#EAECEF]">
                  <div className="flex items-center gap-2 min-w-0">
                    {questionFile.mimeType === 'application/pdf' ? (
                      <FileText className="w-4 h-4 text-[#6C5CE7] shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#6C5CE7] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#16192C] truncate">
                        {questionFile.name}
                      </p>
                      <p className="text-[10px] text-[#8C93A8]">
                        {formatFileSize(questionFile.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestionFile(null)}
                    aria-label="Remove question file"
                    className="p-1 text-[#8C93A8] hover:text-rose-600 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={processingTarget === 'question'}
                  onClick={() => questionFileRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-lg border border-dashed border-[#CBD2E0] bg-white text-xs font-medium text-[#5A607F] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {processingTarget === 'question' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Question File</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Handwritten Solution */}
            <div className="p-3.5 rounded-xl bg-[#FAFBFD] border border-[#EAECEF] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#16192C]">Handwritten Solution</span>
                <span className="text-[10px] text-[#8C93A8]">JPG, PNG, PDF</span>
              </div>
              <input
                ref={handwrittenFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileChange(e, 'handwritten')}
                className="hidden"
              />
              {handwrittenSolution ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-[#00B894]/40">
                  <div className="flex items-center gap-2 min-w-0">
                    {handwrittenSolution.mimeType === 'application/pdf' ? (
                      <FileText className="w-4 h-4 text-[#00896E] shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#00896E] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#16192C] truncate">
                        {handwrittenSolution.name}
                      </p>
                      <p className="text-[10px] text-[#8C93A8]">
                        {formatFileSize(handwrittenSolution.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHandwrittenSolution(null)}
                    aria-label="Remove handwritten solution"
                    className="p-1 text-[#8C93A8] hover:text-rose-600 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={processingTarget === 'handwritten'}
                  onClick={() => handwrittenFileRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-lg border border-dashed border-[#CBD2E0] bg-white text-xs font-medium text-[#5A607F] hover:border-[#00B894] hover:text-[#00896E] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {processingTarget === 'handwritten' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Compressing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Handwritten Work</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#EAECEF]">
            <button
              type="button"
              onClick={() => setIsAddAssignmentOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-[#EAECEF] bg-white text-sm font-medium text-[#5A607F] hover:bg-[#F3F4F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || processingTarget !== null}
              className="px-5 py-2.5 rounded-xl bg-[#6C5CE7] text-white text-sm font-medium hover:bg-[#5B4BD5] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
