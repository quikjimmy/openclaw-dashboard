import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '../stores/connection';
import { useNotificationStore } from '../stores/notifications';
import type { GatewayEvent } from '@openclaw-dashboard/shared';

export function useGatewayEvents() {
  const queryClient = useQueryClient();
  const setStatus = useConnectionStore((s) => s.setStatus);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setError = useConnectionStore((s) => s.setError);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Set up SSE connection
    const eventSource = new EventSource('/api/events/stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GatewayEvent | { type: 'connected' };

        if (data.type === 'connected') {
          setConnected();
          return;
        }

        // Handle different event types
        if (data.type === 'event') {
          handleGatewayEvent(data, queryClient, addNotification);
        }
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = () => {
      setError('Connection to server lost');
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [queryClient, setStatus, setConnected, setError, addNotification]);
}

function handleGatewayEvent(
  event: GatewayEvent,
  queryClient: ReturnType<typeof useQueryClient>,
  addNotification: (n: { type: 'info' | 'success' | 'warning' | 'error'; title: string; description?: string }) => void
) {
  switch (event.event) {
    case 'chat':
    case 'session.message':
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      break;

    case 'exec.approval.requested':
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      addNotification({
        type: 'warning',
        title: 'Approval Required',
        description: 'A new action requires your approval',
      });
      break;

    case 'exec.approval.resolved':
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      break;

    case 'sessions.changed':
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      break;

    case 'tick':
    case 'health':
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      break;

    default:
      // Unknown event, log it
      console.log('Unhandled gateway event:', event.event);
  }
}
