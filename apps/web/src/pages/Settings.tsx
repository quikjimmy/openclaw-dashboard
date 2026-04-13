import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/stores/connection';
import { useUIStore } from '@/stores/ui';
import { cn, formatDate } from '@/lib/utils';
import { Wifi, WifiOff, Moon, Sun, Monitor } from 'lucide-react';

export function Settings() {
  const {
    status,
    deviceId,
    gatewayUrl,
    lastError,
    connectedAt,
    setGatewayUrl,
  } = useConnectionStore();
  const { theme, setTheme } = useUIStore();

  const isConnected = status === 'connected';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your dashboard and connection settings
        </p>
      </div>

      {/* Connection settings */}
      <Card>
        <CardHeader>
          <CardTitle>Gateway Connection</CardTitle>
          <CardDescription>
            Configure the connection to your OpenClaw Gateway
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2',
                isConnected
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              {isConnected ? (
                <Wifi className="h-5 w-5" />
              ) : (
                <WifiOff className="h-5 w-5" />
              )}
              <span className="font-medium">
                {status === 'connected'
                  ? 'Connected'
                  : status === 'connecting'
                  ? 'Connecting...'
                  : status === 'authenticating'
                  ? 'Authenticating...'
                  : status === 'pairing_required'
                  ? 'Pairing Required'
                  : 'Disconnected'}
              </span>
            </div>

            {connectedAt && (
              <span className="text-sm text-muted-foreground">
                Connected since {formatDate(connectedAt)}
              </span>
            )}
          </div>

          {lastError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {lastError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Gateway URL</label>
            <div className="flex gap-2">
              <Input
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="ws://localhost:18789"
              />
              <Button variant="secondary">Reconnect</Button>
            </div>
          </div>

          {deviceId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Device ID</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">
                  {deviceId}
                </code>
                <Button variant="ghost" size="sm">
                  Copy
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the dashboard appearance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                onClick={() => setTheme('system')}
              >
                <Monitor className="mr-2 h-4 w-4" />
                System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Version</span>
            <Badge variant="secondary">0.1.0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              OpenClaw Dashboard
            </span>
            <a
              href="https://github.com/openclaw/openclaw"
              className="text-sm text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
