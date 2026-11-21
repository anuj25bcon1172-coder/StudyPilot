/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
  const { activeView } = useWorkspace();

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
