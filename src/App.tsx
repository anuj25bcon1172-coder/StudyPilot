/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, BellRing, Clock, X } from 'lucide-react';
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
  const {
    activeView,
    setActiveView,
    syncError,
    clearSyncError,
    reminderAlerts,
    reminderStatusFeedback,
    dismissReminderAlert,
    clearReminderStatusFeedback,
  } = useWorkspace();

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

      {(reminderAlerts.length > 0 || reminderStatusFeedback || syncError) && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-3rem)]">
          {reminderAlerts.map((alert) => {
            const toneClass =
              alert.urgency === 'overdue'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : alert.urgency === 'today'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-white border-[#6C5CE7]/30 text-[#16192C]';
            const iconClass =
              alert.urgency === 'overdue'
                ? 'text-rose-600'
                : alert.urgency === 'today'
                ? 'text-amber-600'
                : 'text-[#6C5CE7]';

            return (
              <div
                key={alert.id}
                role="status"
                aria-live="polite"
                className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border shadow-lg text-xs sm:text-sm ${toneClass}`}
              >
                {alert.urgency === 'overdue' ? (
                  <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} />
                ) : alert.urgency === 'today' ? (
                  <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} />
                ) : (
                  <BellRing className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs leading-snug truncate">{alert.headline}</p>
                  <p className="text-xs opacity-85 mt-0.5 leading-relaxed">{alert.message}</p>
                  <button
                    type="button"
                    onClick={() => {
                      dismissReminderAlert(alert.id);
                      setActiveView('assignments');
                    }}
                    className="mt-1.5 text-xs font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
                  >
                    Open Assignments
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => dismissReminderAlert(alert.id)}
                  aria-label={`Dismiss reminder for ${alert.title}`}
                  className="p-0.5 rounded-lg opacity-65 hover:opacity-100 hover:bg-black/5 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {reminderStatusFeedback && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-[#16192C] text-white shadow-lg text-xs"
            >
              <BellRing className="w-4 h-4 text-[#A29BFE] shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{reminderStatusFeedback}</div>
              <button
                type="button"
                onClick={clearReminderStatusFeedback}
                aria-label="Dismiss reminder notice"
                className="p-0.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {syncError && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 shadow-lg text-xs sm:text-sm"
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
