import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateBot, useGetSystemInfo, getListBotsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Github, Play, ArrowLeft, ShieldCheck, KeyRound, Package, Cpu } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

const INSTALL_OPTIONS = [
  { label: "npm install --legacy-peer-deps  (recomendado)", value: "npm install --legacy-peer-deps" },
  { label: "npm install", value: "npm install" },
  { label: "yarn install", value: "yarn install" },
  { label: "pnpm install", value: "pnpm install" },
];

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(50),
  gitUrl: z.string().min(1, "URL do Git é obrigatória"),
  gitToken: z.string().optional(),
  command: z.string().min(1, "Comando de início é obrigatório"),
  installCommand: z.string().optional(),
  autoRestart: z.boolean().default(true),
});

export default function NewBot() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBot = useCreateBot();
  const { data: sysInfo } = useGetSystemInfo({ query: { staleTime: 60000 } });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      gitUrl: "",
      gitToken: "",
      command: "node index.js",
      installCommand: "npm install --legacy-peer-deps",
      autoRestart: true,
    },
  });

  // Auto-detect start command based on known bot patterns
  const gitUrl = form.watch("gitUrl");
  useEffect(() => {
    if (gitUrl.includes("jordan-bot") || gitUrl.includes("whatsapp") || gitUrl.includes("baileys")) {
      form.setValue("command", "node jordan-bot.js");
    }
  }, [gitUrl, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createBot.mutate(
      {
        data: {
          name: values.name,
          gitUrl: values.gitUrl,
          command: values.command,
          autoRestart: values.autoRestart,
          gitToken: values.gitToken || undefined,
          installCommand: values.installCommand || undefined,
        },
      },
      {
        onSuccess: (bot) => {
          queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
          toast({
            title: "Instância implantada!",
            description: `${bot.name} criado. O repositório está sendo clonado em segundo plano.`,
          });
          setLocation(`/bots/${bot.id}`);
        },
        onError: (err) => {
          toast({
            title: "Falha ao implantar",
            description: (err as { error?: string })?.error || "Erro desconhecido.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nova Instância</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure e implante um bot WhatsApp a partir de um repositório Git.
          </p>
        </div>
      </div>

      {/* Node info banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5 text-sm">
        <Cpu className="w-4 h-4 text-primary shrink-0" />
        <span className="text-muted-foreground">Ambiente:</span>
        <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs">
          Node.js {sysInfo?.nodeVersion ?? process.version ?? "v24"}
        </Badge>
        <span className="text-muted-foreground text-xs">· {sysInfo?.platform ?? "linux"}</span>
      </div>

      <Card className="border-border bg-card">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-5 pt-6">

              {/* Name */}
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Instância</FormLabel>
                  <FormControl>
                    <Input placeholder="jordan-bot-oficial" className="font-mono bg-background" {...field} data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Git URL */}
              <FormField control={form.control} name="gitUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do Repositório Git</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Github className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="https://github.com/usuario/repositorio"
                        className="pl-9 font-mono bg-background"
                        {...field}
                        data-testid="input-git-url"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>URL pública ou privada do repositório.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Git Token */}
              <FormField control={form.control} name="gitToken" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    Token do GitHub <span className="text-muted-foreground text-xs font-normal">(apenas repos privados)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="font-mono bg-background"
                      {...field}
                      data-testid="input-git-token"
                    />
                  </FormControl>
                  <FormDescription>
                    Necessário somente para repositórios privados. Gere em GitHub → Settings → Developer settings → Personal access tokens.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Command */}
              <FormField control={form.control} name="command" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comando de Início</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Play className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="node index.js" className="pl-9 font-mono bg-background" {...field} data-testid="input-command" />
                    </div>
                  </FormControl>
                  <FormDescription>Ex: node jordan-bot.js, npm start, bash start.sh</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Install Command */}
              <FormField control={form.control} name="installCommand" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    Comando de Instalação
                  </FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {INSTALL_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => field.onChange(opt.value)}
                            className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                              field.value === opt.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                            }`}
                          >
                            {opt.value}
                          </button>
                        ))}
                      </div>
                      <Input
                        placeholder="npm install --legacy-peer-deps"
                        className="font-mono bg-background text-sm"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Usado ao clicar em "Instalar Deps". Use <code className="text-primary">--legacy-peer-deps</code> se houver conflito de dependências.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Auto-restart */}
              <FormField control={form.control} name="autoRestart" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-2 text-base">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      Auto-restart
                    </FormLabel>
                    <FormDescription>
                      Reinicia automaticamente se o bot cair ou travar. Recomendado.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />

            </CardContent>
            <CardFooter className="bg-muted/30 border-t border-border px-6 py-4">
              <Button type="submit" disabled={createBot.isPending} className="w-full sm:w-auto" data-testid="button-submit-bot">
                {createBot.isPending ? "Implantando..." : "Implantar Instância"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
