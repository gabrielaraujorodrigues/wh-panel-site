import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetBot,
  useStartBot,
  useStopBot,
  useRestartBot,
  usePullBot,
  useInstallBotDeps,
  useSendTerminalInput,
  useDeleteBot,
  getGetBotQueryKey,
  getListBotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Terminal } from "@/components/terminal";
import {
  ArrowLeft,
  Play,
  Square,
  RefreshCw,
  GitPullRequest,
  Activity,
  Clock,
  Terminal as TerminalIcon,
  Package,
  Zap,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

export default function BotDetail() {
  const params = useParams();
  const botId = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [setupLog, setSetupLog] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: bot, isLoading } = useGetBot(botId, {
    query: {
      enabled: !!botId,
      refetchInterval: 3000,
      queryKey: getGetBotQueryKey(botId),
    },
  });

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const pullBot = usePullBot();
  const installDeps = useInstallBotDeps();
  const deleteBot = useDeleteBot();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetBotQueryKey(botId) });
    queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
  };

  const handleDelete = () => {
    deleteBot.mutate(
      { id: botId },
      {
        onSuccess: () => {
          toast({ title: "Servidor excluído", description: "Bot removido com sucesso." });
          queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
          navigate("/");
        },
        onError: () => {
          toast({ title: "Erro ao excluir", description: "Não foi possível remover o bot.", variant: "destructive" });
          setConfirmDelete(false);
        },
      }
    );
  };

  const handleAction = (action: ReturnType<typeof useStartBot>, label: string) => {
    action.mutate(
      { id: botId },
      {
        onSuccess: () => {
          toast({ title: `${label} OK`, description: `Comando executado com sucesso.` });
          invalidate();
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error ?? "Erro desconhecido";
          toast({ title: `Falha: ${label}`, description: msg, variant: "destructive" });
        },
      }
    );
  };

  // One-click: install deps then start
  const handleSetupAndStart = async () => {
    setIsSettingUp(true);
    setSetupLog("Instalando dependencias...");
    installDeps.mutate(
      { id: botId },
      {
        onSuccess: (result) => {
          setSetupLog(result.output ?? "Dependencias instaladas.");
          startBot.mutate(
            { id: botId },
            {
              onSuccess: () => {
                toast({ title: "Bot iniciado!", description: "Instalacao e inicio concluidos." });
                setSetupLog(null);
                setIsSettingUp(false);
                invalidate();
              },
              onError: (err: unknown) => {
                const msg = (err as { error?: string })?.error ?? "Erro ao iniciar";
                toast({ title: "Falha ao iniciar", description: msg, variant: "destructive" });
                setSetupLog(null);
                setIsSettingUp(false);
              },
            }
          );
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error ?? "Erro na instalacao";
          toast({ title: "Falha na instalacao", description: msg, variant: "destructive" });
          setSetupLog(null);
          setIsSettingUp(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">
        Bot nao encontrado.
      </div>
    );
  }

  const isRunning = bot.status === "running";
  const isStarting = bot.status === "starting";
  const isStopped = bot.status === "stopped";
  const isError = bot.status === "error";

  const statusBadge = isRunning ? (
    <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
      <Activity className="w-3 h-3 mr-1 animate-pulse" /> Rodando
    </Badge>
  ) : isStopped ? (
    <Badge className="bg-muted text-muted-foreground border-border" variant="outline">
      <Square className="w-3 h-3 mr-1" /> Parado
    </Badge>
  ) : isStarting ? (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30" variant="outline">
      <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Iniciando
    </Badge>
  ) : (
    <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">
      Erro
    </Badge>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold font-mono truncate">{bot.name}</h1>
            {statusBadge}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{bot.gitUrl}</p>
        </div>
      </div>

      {/* Setup progress banner */}
      {setupLog && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-4 py-3 font-mono text-xs text-yellow-300 flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
          <span className="truncate">{setupLog}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Controls */}
        <Card className="md:col-span-2 border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Controles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* One-click Setup & Start — shown when stopped */}
            {(isStopped || isError) && (
              <Button
                className="w-full h-11 text-sm font-semibold gap-2 bg-primary hover:bg-primary/90"
                disabled={isSettingUp}
                onClick={handleSetupAndStart}
                data-testid="btn-setup-start"
              >
                {isSettingUp ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isSettingUp ? "Configurando..." : "Instalar e Iniciar"}
              </Button>
            )}

            {/* Running controls */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                disabled={isRunning || isStarting || startBot.isPending || isSettingUp}
                onClick={() => handleAction(startBot, "Iniciar")}
                data-testid="btn-start"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" /> Iniciar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isStopped || stopBot.isPending}
                onClick={() => handleAction(stopBot, "Parar")}
                data-testid="btn-stop"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" /> Parar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isStopped || restartBot.isPending}
                onClick={() => handleAction(restartBot, "Reiniciar")}
                data-testid="btn-restart"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${restartBot.isPending ? "animate-spin" : ""}`} />
                Reiniciar
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                disabled={installDeps.isPending || isSettingUp}
                onClick={() => handleAction(installDeps as ReturnType<typeof useStartBot>, "Instalar Deps")}
                data-testid="btn-install"
              >
                <Package className="w-3.5 h-3.5 mr-1.5" /> Instalar Deps
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pullBot.isPending}
                onClick={() => handleAction(pullBot, "Git Pull")}
                data-testid="btn-pull"
              >
                <GitPullRequest className="w-3.5 h-3.5 mr-1.5" /> Git Pull
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Comando</div>
              <div className="font-mono text-xs bg-muted/40 px-3 py-2 rounded border border-border break-all">
                {bot.command}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">PID</div>
              <div className="font-mono text-sm text-primary">{bot.pid ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Criado em</div>
              <div className="text-xs flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {format(new Date(bot.createdAt), "dd/MM/yyyy HH:mm")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terminal */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
          <TerminalIcon className="w-4 h-4" /> Terminal ao Vivo
        </h3>
        <Terminal botId={botId} status={bot.status} />
      </div>

      {/* Zona de perigo — Excluir Servidor */}
      <div className="border border-destructive/30 rounded-lg p-4 space-y-3 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-semibold uppercase tracking-widest">Zona de Perigo</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Excluir remove permanentemente o bot, todos os arquivos e a sessão do WhatsApp. Esta ação não pode ser desfeita.
        </p>

        {!confirmDelete ? (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Excluir Servidor
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-destructive">
              ⚠️ Tem certeza? Isso apagará TUDO — arquivos, sessão e banco de dados.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteBot.isPending}
                onClick={handleDelete}
              >
                {deleteBot.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                {deleteBot.isPending ? "Excluindo..." : "Sim, excluir tudo"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteBot.isPending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
