import React, { useState } from 'react';
import { X, Calendar, BookOpen, CheckCircle2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { AssignmentStatus } from '../types';

export const AddAssignmentModal: React.FC = () => {
  const { isAddAssignmentOpen, setIsAddAssignmentOpen, addAssignment } = useWorkspace();

  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [dueDate, setDueDate] = useState(today);
  const [status, setStatus] = useState<AssignmentStatus>('Pending');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isAddAssignmentOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !dueDate) {
      setError('Please fill in the assignment title, subject, and due date.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addAssignment({ title, subject, dueDate, status });
      setTitle('');
      setSubject('Mathematics');
      setDueDate(today);
      setStatus('Pending');
      setIsAddAssignmentOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save assignment.');
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
        className="w-full max-w-md bg-white rounded-2xl border border-[#EAECEF] shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#EAECEF]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#16192C]">Add Assignment</h2>
            <p className="text-xs text-[#5A607F] mt-0.5">Schedule coursework and track your deadline</p>
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

          <div>
            <label className="block text-xs font-medium text-[#16192C] mb-1.5">
              Subject
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-[#8C93A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Mathematics, Physics, Computer Science..."
                maxLength={80}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] placeholder:text-[#8C93A8] focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#EAECEF] bg-[#F8F9FB] text-sm text-[#16192C] tabular-nums focus:outline-none focus:bg-white focus:border-[#6C5CE7] transition-colors"
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

          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={() => setIsAddAssignmentOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-[#EAECEF] bg-white text-sm font-medium text-[#5A607F] hover:bg-[#F3F4F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
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
