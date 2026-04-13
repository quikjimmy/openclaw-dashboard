import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  ShieldCheck,
  ListTodo,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApprovals } from '@/hooks/useApprovals';

type Page = 'dashboard' | 'agents' | 'chat' | 'approvals' | 'tasks' | 'settings';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed?: boolean;
}

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ currentPage, onNavigate, collapsed }: SidebarProps) {
  const { data: approvals } = useApprovals('pending');
  const pendingCount = approvals?.pending ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-lg text-primary-foreground">O</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold">OpenClaw</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              currentPage === item.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'approvals' && pendingCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                    {pendingCount}
                  </span>
                )}
              </>
            )}
            {collapsed && item.id === 'approvals' && pendingCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        {!collapsed && (
          <p className="text-xs text-muted-foreground">
            OpenClaw Dashboard v0.1.0
          </p>
        )}
      </div>
    </div>
  );
}
