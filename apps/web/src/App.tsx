import { useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Chat } from './pages/Chat';
import { Approvals } from './pages/Approvals';
import { Tasks } from './pages/Tasks';
import { Settings } from './pages/Settings';
import { useGatewayEvents } from './hooks/useGatewayEvents';
import { Toaster } from './components/ui/toaster';

type Page = 'dashboard' | 'agents' | 'chat' | 'approvals' | 'tasks' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  // Set up SSE event listener for real-time updates
  useGatewayEvents();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'agents':
        return <Agents />;
      case 'chat':
        return <Chat />;
      case 'approvals':
        return <Approvals />;
      case 'tasks':
        return <Tasks />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <MainLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </MainLayout>
      <Toaster />
    </>
  );
}

export default App;
