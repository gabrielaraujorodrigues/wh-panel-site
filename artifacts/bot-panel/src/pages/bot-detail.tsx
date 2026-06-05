import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetBot,
  useGetSystemInfo,
  useStartBot,
  useStopBot,
  useRestartBot,
  usePullBot,
  useInstallBotDeps,
  useSendTerminalInput,
  useUpdateBot,
  useDeleteBot,
  getGetBotQueryKey,
  getListBotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Terminal } from "@/components/terminal";
import {
  ArrowLeft, Play, Square, RefreshCw, GitPullRequest,
  Activity, Clock, Terminal as TerminalIcon, Package,
  Zap, Trash2, AlertTriangle, ShieldCheck, Cpu, KeyRound,
} from "lucide-react";
import { format } from "date-fns";

const INSTALL_OPTIONS = [
  "npm install --legacy-peer-deps --ignore-engines",
  "npm install --legacy-peer-deps",
  "npm install",
  "yarn install --ignore-engines --network-timeout 60000",
  "pnpm install --ignore-workspace",
];

export default function BotDetail() {
  const params = useParams();
  const botId = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [setupLog, setSetupLog] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editInstallCmd, setEditInstallCmd] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);

  const { data: bot, isLoading } = useGetBot(botId, {
    query: {
      enabled: !!botId,
      refetchInterval: (query) => {
        const s = (query.state.data as { status?: string } | undefined)?.status;
        return s === "running" || s === "starting" ? 2000 : 8000;
      },
      queryKey: getGetBotQueryKey(botId),
    },
  });

  const { data: sysInfo } = useGetSystemInfo({ query: { staleTime: 60000 } });

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const pullBot = usePullBot();
  const installDeps = useInstallBotDeps();
  const updateBot = useUpdateBot();
  const deleteBot = useDeleteBot();
  const _sendInput = useSendTerminalInput();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetBotQueryKey(botId) });
    queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
  };

  const handleDelete = () => {
    deleteBot.mutate({ id: botId }, {
      onSuccess: () => {
        toast({ title: "Bot excluído", description: "Bot removido com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
        navigate("/");
      },
      onError: () => {
        toast({ title: "Erro ao excluir", variant: "destructive" });
        setConfirmDelete(false);
      },
    });
  };

  const handleAction = (action: ReturnType<typeof useStartBot>, label: string) => {
    action.mutate({ id: botId }, {
      onSuccess: () => { toast({ title: `${label} concluído` }); invalidate(); },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error ?? "Erro desconhecido";
        toast({ title: `Falha: ${label}`, description: msg, variant: "destructive" });
      },
    });
  };

  const handleToggleAutoRestart = (checked: boolean) => {
    updateBot.mutate({ id: botId, data: { autoRestart: checked } }, {
      onSuccess: () => { toast({ title: checked ? "Auto-restart ativado" : "Auto-restart desativado" }); invalidate(); },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    });
  };

  const handleSaveInstallCmd = () => {
    if (editInstallCmd === null) return;
    updateBot.mutate({ id: botId, data: { installCommand: editInstallCmd } }, {
      onSuccess: () => { toast({ title: "Comando salvo" }); setEditInstallCmd(null); invalidate(); },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    });
  };

  const handleSaveToken = () => {
    if (editToken === null) return;
    updateBot.mutate({ id: botId, data: { gitToken: editToken } }, {
      onSuccess: () => { toast({ title: "Token salvo" }); setEditToken(null); invalidate(); },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    });
  };

  const handleSetupAndStart = async () => {
    setIsSettingUp(true);
    setSetupLog("Instalando dependências...");
    installDeps.mutate({ id: botId }, {
      onSuccess: (result) => {
        setSetupLog(result.output ?? "Instalado.");
        startBot.mutate({ id: botId }, {
          onSuccess: () => {
            toast({ title: "Bot iniciado!" });
            setSetupLog(null);
            setIsSettingUp(false);
            invalidate();
          },
          onError: (err: unknown) => {
            toast({ title: "Falha ao iniciar", description: (err as { error?: string })?.error, variant: "destructive" });
            setSetupLog(null);
            setIsSettingUp(false);
          },
        });
      },
      onError: (err: unknown) => {
        toast({ title: "Falha na instalação", description: (err as { error?: string })?.error, variant: "destructive" });
        setSetupLog(null);
        setIsSettingUp(false);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!bot) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">Bot não encontrado.</div>;
  }

  const isRunning = bot.status === "running";
  const isStarting = bot.status === "starting";
  const isStopped = bot.status === "stopped";

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
    <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">Erro</Badge>
  );

  const currentInstallCmd = editInstallCmd ?? bot.installCommand ?? "npm install --legacy-peer-deps --ignore-engines";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold font-mono truncate">{bot.name}</h1>
            {statusBadge}
            {bot.autoRestart && (
              <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                <ShieldCheck className="w-3 h-3 mr-1" /> Auto-restart
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{bot.gitUrl}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Cpu className="w-3.5 h-3.5 text-primary" />
        <span>Ambiente:</span>
        <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs">
          Node.js {sysInfo?.nodeVersion ?? "v24"}
        </Badge>
      </div>

      {setupLog && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-4 py-3 font-mono text-xs text-yellow-300 flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
          <span className="truncate">{setupLog}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Controles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(isStopped || bot.status === "error") && (
              <Button
                className="w-full h-11 text-sm font-semibold gap-2"
                disabled={isSettingUp}
                onClick={handleSetupAndStart}
              >
                {isSettingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isSettingUp ? "Configurando..." : "Instalar e Iniciar"}
              </Button>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm"
                disabled={isRunning || isStarting || startBot.isPending || isSettingUp}
                onClick={() => handleAction(startBot, "Iniciar")} data-testid="btn-start">
                <Play className="w-3.5 h-3.5 mr-1.5" /> Iniciar
              </Button>
              <Button variant="secondary" size="sm"
                disabled={isStopped || stopBot.isPending}
                onClick={() => handleAction(stopBot, "Parar")} data-testid="btn-stop">
                <Square className="w-3.5 h-3.5 mr-1.5" /> Parar
              </Button>
              <Button variant="outline" size="sm"
                disabled={isStopped || restartBot.isPending}
                onClick={() => handleAction(restartBot, "Reiniciar")} data-testid="btn-restart">
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${restartBot.isPending ? "animate-spin" : ""}`} />
                Reiniciar
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm"
                disabled={installDeps.isPending || isSettingUp}
                onClick={() => handleAction(installDeps as ReturnType<typeof useStartBot>, "Instalar Deps")}>
                <Package className="w-3.5 h-3.5 mr-1.5" /> Instalar Deps
              </Button>
              <Button variant="outline" size="sm"
                disabled={pullBot.isPending}
                onClick={() => handleAction(pullBot, "Git Pull")}>
                <GitPullRequest className="w-3.5 h-3.5 mr-1.5" /> Git Pull
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <Label htmlFor="auto-restart" className="text-sm font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Auto-restart
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Reinicia automaticamente se o bot cair</p>
              </div>
              <Switch id="auto-restart" checked={bot.autoRestart} onCheckedChange={handleToggleAutoRestart} disabled={updateBot.isPending} />
            </div>
          </CardContent>
        </Card>

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

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Package className="w-3.5 h-3.5" /> Instalação de Dependências
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {INSTALL_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setEditInstallCmd(opt)}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                  currentInstallCmd === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={currentInstallCmd}
              onChange={e => setEditInstallCmd(e.target.value)}
              className="font-mono text-sm bg-background flex-1"
              placeholder="npm install --legacy-peer-deps --ignore-engines"
            />
            {editInstallCmd !== null && editInstallCmd !== (bot.installCommand ?? "npm install --legacy-peer-deps --ignore-engines") && (
              <Button size="sm" onClick={handleSaveInstallCmd} disabled={updateBot.isPending}>
                Salvar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Use <code className="text-primary">--legacy-peer-deps --ignore-engines</code> para compatibilidade com Node 24 (comum em bots baileys).
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" /> Token do GitHub (Repos Privados)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="password"
              value={editToken ?? (bot.gitToken || "")}
              onChange={e => setEditToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm bg-background flex-1"
            />
            {editToken !== null && editToken !== (bot.gitToken ?? "") && (
              <Button size="sm" onClick={handleSaveToken} disabled={updateBot.isPending}>
                Salvar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Necessário para Git Pull em repositórios privados. O token é usado apenas no servidor — nunca exposto.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
          <TerminalIcon className="w-4 h-4" /> Terminal ao Vivo
        </h3>
        <Terminal botId={botId} status={bot.status} />
      </div>

      <div className="border border-destructive/30 rounded-lg p-4 space-y-3 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-semibold uppercase tracking-widest">Zona de Perigo</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Excluir remove permanentemente o bot, todos os arquivos e a sessão do WhatsApp.
        </p>
        {!confirmDelete ? (
          <Button
            variant="outline" size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir Servidor
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-destructive">Tem certeza? Isso apaga TUDO.</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={deleteBot.isPending} onClick={handleDelete}>
                {deleteBot.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                {deleteBot.isPending ? "Excluindo..." : "Sim, excluir tudo"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleteBot.isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
