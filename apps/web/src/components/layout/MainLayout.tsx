import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores/ui';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

type Page = 'dashboard' | 'agents' | 'chat' | 'approvals' | 'tasks' | 'settings';

interface MainLayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export function MainLayout({ children, currentPage, onNavigate }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - hidden on mobile by default */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-background transition-all duration-300 md:static',
          isMobile && sidebarCollapsed && '-translate-x-full',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <Sidebar
          currentPage={currentPage}
          onNavigate={(page) => {
            onNavigate(page);
            if (isMobile) toggleSidebar();
          }}
          collapsed={sidebarCollapsed && !isMobile}
        />
      </aside>

      {/* Mobile overlay */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={toggleSidebar}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
