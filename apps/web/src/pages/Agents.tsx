import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgents, useAgentAction } from '@/hooks/useAgents';
import { useUIStore } from '@/stores/ui';
import { cn } from '@/lib/utils';
import { Plus, Play, Square, RotateCw, Settings } from 'lucide-react';
import type { Agent, AgentStatus } from '@openclaw-dashboard/shared';

const statusColors: Record<AgentStatus, string> = {
  active: 'bg-green-500',
  inactive: 'bg-gray-400',
  error: 'bg-red-500',
  starting: 'bg-yellow-500',
  stopping: 'bg-yellow-500',
};

const statusLabels: Record<AgentStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  error: 'Error',
  starting: 'Starting',
  stopping: 'Stopping',
};

export function Agents() {
  const { data, isLoading } = useAgents();
  const { selectedAgentId, selectAgent } = useUIStore();
  const agentAction = useAgentAction();
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const agents = data?.agents ?? [];
  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    if (filter === 'active') return agent.status === 'active';
    return agent.status === 'inactive';
  });

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Manage and monitor your AI agents
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'active', 'inactive'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent list */}
        <div className="space-y-4 lg:col-span-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          ) : filteredAgents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No agents found. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={agent.id === selectedAgentId}
                onSelect={() => selectAgent(agent.id)}
                onAction={(action) => agentAction.mutate({ id: agent.id, action })}
                isActioning={agentAction.isPending}
              />
            ))
          )}
        </div>

        {/* Agent details */}
        <div className="lg:col-span-1">
          {selectedAgent ? (
            <AgentDetails agent={selectedAgent} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select an agent to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  selected,
  onSelect,
  onAction,
  isActioning,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
  onAction: (action: 'start' | 'stop' | 'restart') => void;
  isActioning: boolean;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/50',
        selected && 'ring-2 ring-primary'
      )}
      onClick={onSelect}
    >
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div
            className={cn('h-3 w-3 rounded-full', statusColors[agent.status])}
          />
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-muted-foreground">
              {agent.model.provider}/{agent.model.model}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{statusLabels[agent.status]}</Badge>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {agent.status === 'active' ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onAction('stop')}
                disabled={isActioning}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onAction('start')}
                disabled={isActioning}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAction('restart')}
              disabled={isActioning || agent.status !== 'active'}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentDetails({ agent }: { agent: Agent }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{agent.name}</CardTitle>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
          <div className="mt-1 flex items-center gap-2">
            <div
              className={cn('h-2 w-2 rounded-full', statusColors[agent.status])}
            />
            <span>{statusLabels[agent.status]}</span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Model</h4>
          <p className="mt-1">
            {agent.model.provider} / {agent.model.model}
          </p>
        </div>

        {agent.description && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Description
            </h4>
            <p className="mt-1 text-sm">{agent.description}</p>
          </div>
        )}

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Skills</h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.skills.length > 0 ? (
              agent.skills.map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No skills</span>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Channels</h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.channels.length > 0 ? (
              agent.channels.map((channel) => (
                <Badge key={channel} variant="outline">
                  {channel}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No channels</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
