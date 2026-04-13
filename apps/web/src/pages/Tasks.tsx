import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasks, useCancelTask } from '@/hooks/useTasks';
import { cn, formatRelativeTime, formatDate } from '@/lib/utils';
import { ListTodo, Square, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { Task, TaskStatus } from '@openclaw-dashboard/shared';

const statusIcons: Record<TaskStatus, typeof Clock> = {
  queued: Clock,
  running: ListTodo,
  waiting_approval: AlertCircle,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: Square,
  timed_out: Clock,
};

const statusColors: Record<TaskStatus, string> = {
  queued: 'text-blue-500',
  running: 'text-yellow-500',
  waiting_approval: 'text-orange-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-500',
  timed_out: 'text-red-500',
};

export function Tasks() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const { data, isLoading } = useTasks(
    statusFilter === 'all' ? undefined : { status: statusFilter }
  );
  const cancelTask = useCancelTask();

  const tasks = data?.tasks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Monitor running and completed tasks
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">
            {data?.running ?? 0} running
          </Badge>
          <Badge variant="outline">
            {data?.queued ?? 0} queued
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'running', 'queued', 'completed', 'failed'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <ListTodo className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No tasks</p>
              <p className="text-sm text-muted-foreground">
                Tasks will appear here when agents perform actions.
              </p>
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onCancel={() => cancelTask.mutate(task.id)}
              isCancelling={cancelTask.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onCancel,
  isCancelling,
}: {
  task: Task;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const StatusIcon = statusIcons[task.status];
  const canCancel = task.status === 'running' || task.status === 'queued';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <StatusIcon className={cn('h-5 w-5 mt-0.5', statusColors[task.status])} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">
                  {task.description ?? `Task ${task.id.slice(0, 8)}`}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {task.type}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Agent: {task.agentId}
              </p>

              {/* Progress */}
              {task.progress && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-32 rounded-full bg-secondary">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${(task.progress.current / task.progress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-muted-foreground">
                      {task.progress.current}/{task.progress.total}
                    </span>
                  </div>
                  {task.progress.message && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.progress.message}
                    </p>
                  )}
                </div>
              )}

              {/* Result */}
              {task.result && (
                <div className="mt-2 text-sm">
                  {task.result.success ? (
                    <span className="text-green-600">Completed successfully</span>
                  ) : (
                    <span className="text-red-600">
                      Failed: {task.result.error}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-muted-foreground">
              <p>Created: {formatRelativeTime(task.createdAt)}</p>
              {task.completedAt && (
                <p>Completed: {formatRelativeTime(task.completedAt)}</p>
              )}
            </div>

            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isCancelling}
              >
                <Square className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
