/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthGate } from './components/AuthGate';
import { AddAssignmentModal } from './components/AddAssignmentModal';
import { HomeView } from './views/HomeView';
import { DashboardView } from './views/DashboardView';
import { AssignmentManagerView } from './views/AssignmentManagerView';
import { AiSolverView } from './views/AiSolverView';
import { AiLearningAssistantView } from './views/AiLearningAssistantView';
import { QuickRevisionCentreView } from './views/QuickRevisionCentreView';

const WebsiteShell: React.FC = () => {
  const { activeView, syncError, clearSyncError } = useWorkspace();

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#16192C] flex flex-col">
      <Navbar />

      <main className="flex-1">
        {activeView === 'home' ? (
          <HomeView />
        ) : (
          <AuthGate>
            {activeView === 'dashboard' && <DashboardView />}
            {activeView === 'assignments' && <AssignmentManagerView />}
            {activeView === 'solver' && <AiSolverView />}
            {activeView === 'assistant' && <AiLearningAssistantView />}
            {activeView === 'revision' && <QuickRevisionCentreView />}
          </AuthGate>
        )}
      </main>

      <Footer />
      <AddAssignmentModal />

      {syncError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 right-6 z-50 max-w-md flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 shadow-lg text-xs sm:text-sm"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{syncError}</div>
          <button
            type="button"
            onClick={clearSyncError}
            aria-label="Dismiss authentication alert"
            className="p-0.5 rounded-lg text-rose-500 hover:text-rose-800 hover:bg-rose-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <WebsiteShell />
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
