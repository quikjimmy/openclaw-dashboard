import { useNotificationStore } from '@/stores/notifications';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export function Toaster() {
  const { notifications, removeNotification } = useNotificationStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all',
            'bg-background text-foreground',
            notification.type === 'error' && 'border-destructive',
            notification.type === 'warning' && 'border-yellow-500',
            notification.type === 'success' && 'border-green-500'
          )}
        >
          <div className="flex-1">
            <p className="text-sm font-semibold">{notification.title}</p>
            {notification.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {notification.description}
              </p>
            )}
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
