import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useSessions, useChatHistory, useSendMessage } from '@/hooks/useChat';
import { useAgents } from '@/hooks/useAgents';
import { useUIStore } from '@/stores/ui';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Send, Plus, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Message, Session } from '@openclaw-dashboard/shared';

export function Chat() {
  const { selectedSessionId, selectSession, selectedAgentId, selectAgent } = useUIStore();
  const { data: sessionsData, isLoading: sessionsLoading } = useSessions();
  const { data: chatData, isLoading: chatLoading } = useChatHistory(selectedSessionId);
  const { data: agentsData } = useAgents();
  const sendMessage = useSendMessage();

  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessions = sessionsData?.sessions ?? [];
  const messages = chatData?.messages ?? [];
  const agents = agentsData?.agents ?? [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim() || !selectedAgentId) return;

    sendMessage.mutate({
      agentId: selectedAgentId,
      sessionId: selectedSessionId ?? undefined,
      content: message,
    });
    setMessage('');
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sessions sidebar */}
      <div className="w-64 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <Button variant="ghost" size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {sessionsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sessions yet. Start a conversation with an agent.
            </p>
          ) : (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                selected={session.id === selectedSessionId}
                onClick={() => {
                  selectSession(session.id);
                  selectAgent(session.agentId);
                }}
              />
            ))
          )}
        </div>

        {/* Agent selector for new chat */}
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Start new chat</h3>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selectedAgentId ?? ''}
            onChange={(e) => {
              selectAgent(e.target.value || null);
              selectSession(null);
            }}
          >
            <option value="">Select an agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat area */}
      <Card className="flex flex-1 flex-col">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-lg">
            {selectedSession
              ? `Chat with ${agents.find((a) => a.id === selectedSession.agentId)?.name ?? 'Agent'}`
              : selectedAgentId
              ? `New chat with ${agents.find((a) => a.id === selectedAgentId)?.name ?? 'Agent'}`
              : 'Select a session or agent'}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-auto p-4">
            {chatLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-3/4" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {selectedAgentId
                  ? 'Send a message to start the conversation'
                  : 'Select a session or agent to start chatting'}
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={!selectedAgentId || sendMessage.isPending}
              />
              <Button
                onClick={handleSend}
                disabled={!message.trim() || !selectedAgentId || sendMessage.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SessionCard({
  session,
  selected,
  onClick,
}: {
  session: Session;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent',
        selected && 'border-primary bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">
          Session {session.id.slice(0, 8)}
        </span>
        <Badge variant="secondary" className="text-xs">
          {session.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {session.lastMessageAt
          ? formatRelativeTime(session.lastMessageAt)
          : formatRelativeTime(session.createdAt)}
      </p>
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary'
        )}
      >
        <div className="prose prose-sm dark:prose-invert">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        <p className="mt-1 text-xs opacity-70">
          {formatRelativeTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
