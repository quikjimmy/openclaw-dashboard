import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Task,
  TaskListResponse,
  TaskStats,
  TaskFilters,
} from '@openclaw-dashboard/shared';

export function useTasks(filters?: TaskFilters) {
  const params = new URLSearchParams();
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    statuses.forEach((s) => params.append('status', s));
  }
  if (filters?.agentId) params.set('agentId', filters.agentId);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const queryString = params.toString();
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api.get<TaskListResponse>(`/tasks${queryString ? `?${queryString}` : ''}`),
    refetchInterval: 10000, // Refresh every 10s
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get<Task>(`/tasks/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      // Refresh more frequently for running tasks
      const task = query.state.data as Task | undefined;
      if (task?.status === 'running' || task?.status === 'queued') {
        return 2000;
      }
      return false;
    },
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: ['tasks', 'stats'],
    queryFn: () => api.get<TaskStats>('/tasks/stats'),
    refetchInterval: 30000,
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
