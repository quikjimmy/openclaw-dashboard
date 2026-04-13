import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Session,
  SessionListResponse,
  Message,
  ChatHistoryResponse,
  SendMessageRequest,
} from '@openclaw-dashboard/shared';

export function useSessions(agentId?: string) {
  return useQuery({
    queryKey: ['sessions', agentId],
    queryFn: () => {
      const params = agentId ? `?agentId=${agentId}` : '';
      return api.get<SessionListResponse>(`/chat/sessions${params}`);
    },
  });
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<Session>(`/chat/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useChatHistory(sessionId: string | null, cursor?: string) {
  return useQuery({
    queryKey: ['chat', sessionId, cursor],
    queryFn: () => {
      const params = cursor ? `?cursor=${cursor}` : '';
      return api.get<ChatHistoryResponse>(`/chat/history/${sessionId}${params}`);
    },
    enabled: !!sessionId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageRequest) =>
      api.post<Message>('/chat/send', data),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      api.post<Session>('/chat/sessions', { agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
