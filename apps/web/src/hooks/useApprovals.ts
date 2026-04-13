import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Approval,
  ApprovalListResponse,
  ApprovalStats,
  ResolveApprovalRequest,
} from '@openclaw-dashboard/shared';

export function useApprovals(filter: 'pending' | 'resolved' | 'all' = 'pending') {
  return useQuery({
    queryKey: ['approvals', filter],
    queryFn: () => api.get<ApprovalListResponse>(`/approvals?filter=${filter}`),
    refetchInterval: filter === 'pending' ? 5000 : 30000, // More frequent for pending
  });
}

export function useApproval(approvalId: string | null) {
  return useQuery({
    queryKey: ['approval', approvalId],
    queryFn: () => api.get<Approval>(`/approvals/${approvalId}`),
    enabled: !!approvalId,
  });
}

export function useApprovalStats() {
  return useQuery({
    queryKey: ['approvals', 'stats'],
    queryFn: () => api.get<ApprovalStats>('/approvals/stats'),
    refetchInterval: 30000,
  });
}

export function useResolveApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      approvalId,
      ...data
    }: ResolveApprovalRequest & { approvalId: string }) =>
      api.post(`/approvals/${approvalId}/resolve`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
