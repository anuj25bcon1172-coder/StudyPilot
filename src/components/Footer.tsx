import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

export const Footer: React.FC = () => {
  const { setActiveView, setRevisionInitialTool, setIsAddAssignmentOpen } = useWorkspace();

  return (
    <footer className="bg-white border-t border-[#EAECEF] mt-16">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand Column */}
          <div className="md:col-span-4 space-y-3">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('home');
              }}
              className="inline-flex items-center gap-2.5"
            >
              <span className="w-8 h-8 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center font-display font-bold text-xs tracking-tight">
                SP
              </span>
              <span className="font-display font-bold text-lg tracking-tight text-[#16192C]">
                StudyPilot
              </span>
            </a>
            <p className="text-sm text-[#5A607F] leading-relaxed max-w-sm">
              Smart Assignment Hub combining deadline tracking, step-by-step problem solving, guided concept tutoring, and rapid exam revision in one desktop workspace.
            </p>
          </div>

          {/* Column 2: Workspace Pages */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="font-display text-xs font-semibold text-[#16192C] uppercase tracking-wider">
              Workspace
            </h3>
            <ul className="space-y-2.5 text-sm text-[#5A607F]">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('home')}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  Home Overview
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  Student Dashboard
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('assignments')}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  Assignment Manager
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setIsAddAssignmentOpen(true)}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  Schedule New Deadline
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: AI Study Modules */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="font-display text-xs font-semibold text-[#16192C] uppercase tracking-wider">
              AI Study Modules
            </h3>
            <ul className="space-y-2.5 text-sm text-[#5A607F]">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('solver')}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  AI Assignment Solver
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('assistant')}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  AI Learning Assistant
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('mcq');
                    setActiveView('revision');
                  }}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  Practice MCQ Quizzes
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('summary');
                    setActiveView('revision');
                  }}
                  className="hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  5-Minute Revision Summaries
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Revision Tools */}
          <div className="md:col-span-2 space-y-3">
            <h3 className="font-display text-xs font-semibold text-[#16192C] uppercase tracking-wider">
              Quick Tools
            </h3>
            <ul className="space-y-2.5 text-sm text-[#5A607F]">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('notes');
                    setActiveView('revision');
                  }}
                  className="hover:text-[#00B894] transition-colors cursor-pointer"
                >
                  Notes Generator
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('questions');
                    setActiveView('revision');
                  }}
                  className="hover:text-[#00B894] transition-colors cursor-pointer"
                >
                  Important Questions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionInitialTool('flashcards');
                    setActiveView('revision');
                  }}
                  className="hover:text-[#00B894] transition-colors cursor-pointer"
                >
                  Flip Flashcards
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#EAECEF] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8C93A8]">
          <p>© {new Date().getFullYear()} StudyPilot · Smart Assignment Hub</p>
          <p>Built for focused academic study, problem solving, and exam preparation.</p>
        </div>
      </div>
    </footer>
  );
};
