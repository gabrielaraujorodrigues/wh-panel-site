import { useListBots } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Server, Play, Square, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: bots, isLoading } = useListBots({ query: { refetchInterval: 5000 } });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline"><Activity className="w-3 h-3 mr-1" /> Running</Badge>;
      case "stopped":
        return <Badge className="bg-muted text-muted-foreground border-border" variant="outline"><Square className="w-3 h-3 mr-1" /> Stopped</Badge>;
      case "starting":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20" variant="outline"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Starting</Badge>;
      case "error":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage your active WhatsApp bot instances.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/bots/new" data-testid="button-new-instance">
            <Plus className="w-4 h-4 mr-2" />
            Deploy Bot
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-border bg-card">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-1/2 mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="flex justify-between mt-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : bots && bots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map((bot) => (
            <Card key={bot.id} className="border-border bg-card hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-medium font-mono truncate max-w-[180px]">{bot.name}</CardTitle>
                    <CardDescription className="text-xs font-mono truncate">{bot.command}</CardDescription>
                  </div>
                  {getStatusBadge(bot.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-xs text-muted-foreground mb-4 font-mono truncate">
                  {bot.gitUrl}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground font-mono">
                    PID: {bot.pid || '---'}
                  </div>
                  <Button variant="secondary" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/bots/${bot.id}`} data-testid={`link-manage-${bot.id}`}>
                      Manage
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
              <Server className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No bots deployed</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-6">
              You haven't deployed any WhatsApp bot instances yet. Create your first instance from a Git repository.
            </p>
            <Button asChild>
              <Link href="/bots/new" data-testid="button-empty-new-instance">
                <Plus className="w-4 h-4 mr-2" />
                Deploy your first bot
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
