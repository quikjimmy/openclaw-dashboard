import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApprovals, useResolveApproval } from '@/hooks/useApprovals';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Check, X, ShieldCheck, Terminal, AlertTriangle } from 'lucide-react';
import type { Approval, ApprovalAction, RiskLevel } from '@openclaw-dashboard/shared';

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

export function Approvals() {
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const { data, isLoading } = useApprovals(filter);
  const resolveApproval = useResolveApproval();

  const approvals = data?.approvals ?? [];
  const pendingCount = data?.pending ?? 0;

  const handleResolve = (approvalId: string, action: ApprovalAction) => {
    resolveApproval.mutate({ approvalId, action });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
          <p className="text-muted-foreground">
            Review and approve agent actions
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['pending', 'resolved', 'all'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Approval list */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <ShieldCheck className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No approvals</p>
              <p className="text-sm text-muted-foreground">
                {filter === 'pending'
                  ? 'All caught up! No pending approvals.'
                  : 'No approvals found.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onResolve={handleResolve}
              isResolving={resolveApproval.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  onResolve,
  isResolving,
}: {
  approval: Approval;
  onResolve: (id: string, action: ApprovalAction) => void;
  isResolving: boolean;
}) {
  const isPending = approval.status === 'pending';
  const risk = approval.request.risk ?? 'medium';

  return (
    <Card className={cn(isPending && 'border-yellow-500')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle className="text-lg">
              {approval.type === 'exec' ? 'Command Execution' : approval.type}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', riskColors[risk])} />
            <span className="text-sm capitalize">{risk} risk</span>
            <Badge
              variant={
                approval.status === 'approved'
                  ? 'success'
                  : approval.status === 'denied'
                  ? 'destructive'
                  : approval.status === 'pending'
                  ? 'warning'
                  : 'secondary'
              }
            >
              {approval.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Command preview */}
        {approval.request.command && (
          <div className="rounded-md bg-muted p-3 font-mono text-sm">
            <p className="text-xs text-muted-foreground mb-1">
              {approval.request.workingDir && `${approval.request.workingDir}$`}
            </p>
            <code>{approval.request.command}</code>
          </div>
        )}

        {/* Description */}
        {approval.request.description && (
          <p className="text-sm text-muted-foreground">
            {approval.request.description}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Agent: {approval.agentId}</span>
          <span>Created: {formatRelativeTime(approval.createdAt)}</span>
          {approval.expiresAt && (
            <span className="text-yellow-600">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Expires: {formatRelativeTime(approval.expiresAt)}
            </span>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2 pt-2 border-t">
            <Button
              onClick={() => onResolve(approval.id, 'allow-once')}
              disabled={isResolving}
              className="flex-1"
            >
              <Check className="mr-2 h-4 w-4" />
              Allow Once
            </Button>
            <Button
              variant="secondary"
              onClick={() => onResolve(approval.id, 'allow-always')}
              disabled={isResolving}
            >
              Allow Always
            </Button>
            <Button
              variant="destructive"
              onClick={() => onResolve(approval.id, 'deny')}
              disabled={isResolving}
            >
              <X className="mr-2 h-4 w-4" />
              Deny
            </Button>
          </div>
        )}

        {/* Resolution info */}
        {approval.resolution && (
          <div className="pt-2 border-t text-sm">
            <span className="text-muted-foreground">
              Resolved by {approval.resolution.resolvedBy ?? 'system'} (
              {approval.resolution.action})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
