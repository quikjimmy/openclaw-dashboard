import { Menu, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui';
import { useConnectionStore } from '@/stores/connection';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useUIStore();
  const { status } = useConnectionStore();

  const isConnected = status === 'connected';

  return (
    <header className="flex h-16 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1 text-sm',
            isConnected
              ? 'bg-green-500/10 text-green-600'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {isConnected ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
