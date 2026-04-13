import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAgents } from '@/hooks/useAgents';
import { useApprovalStats } from '@/hooks/useApprovals';
import { useTaskStats } from '@/hooks/useTasks';
import { useSessions } from '@/hooks/useChat';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, MessageSquare, ShieldCheck, ListTodo } from 'lucide-react';

export function Dashboard() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: approvalStats, isLoading: approvalsLoading } = useApprovalStats();
  const { data: taskStats, isLoading: tasksLoading } = useTaskStats();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();

  const activeAgents = agents?.agents.filter((a) => a.status === 'active').length ?? 0;
  const totalAgents = agents?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor and manage your OpenClaw instance
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Agents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{activeAgents}</div>
                <p className="text-xs text-muted-foreground">
                  {totalAgents} total, {activeAgents} active
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chat Sessions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{sessions?.total ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Active conversations
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Approvals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {approvalsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {approvalStats?.pending ?? 0}
                  {(approvalStats?.pending ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      Action needed
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {approvalStats?.approvedToday ?? 0} approved today
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running Tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{taskStats?.running ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {taskStats?.queued ?? 0} queued, {taskStats?.completedToday ?? 0} completed today
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity section - placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Activity feed will appear here once connected to OpenClaw Gateway.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
