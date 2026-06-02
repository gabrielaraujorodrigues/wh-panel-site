import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateBot, getListBotsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Github, Play, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  gitUrl: z.string().url("Must be a valid URL").min(1, "Git URL is required"),
  command: z.string().min(1, "Start command is required"),
});

export default function NewBot() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createBot = useCreateBot();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      gitUrl: "",
      command: "npm start",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createBot.mutate(
      { data: values },
      {
        onSuccess: (bot) => {
          queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
          toast({
            title: "Instance deployed",
            description: `${bot.name} has been successfully created.`,
          });
          setLocation(`/bots/${bot.id}`);
        },
        onError: (err) => {
          toast({
            title: "Failed to deploy",
            description: err?.error || "An unknown error occurred.",
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
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deploy New Instance</h1>
          <p className="text-muted-foreground mt-1">Configure and deploy a new WhatsApp bot from a Git repository.</p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 pt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instance Name</FormLabel>
                    <FormControl>
                      <Input placeholder="my-wa-bot" className="font-mono bg-background" {...field} data-testid="input-name" />
                    </FormControl>
                    <FormDescription>
                      A unique name to identify this bot instance.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gitUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Git Repository URL</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Github className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="https://github.com/user/repo.git" className="pl-9 font-mono bg-background" {...field} data-testid="input-git-url" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      The public or accessible repository URL containing your bot code.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="command"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Command</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Play className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="npm start" className="pl-9 font-mono bg-background" {...field} data-testid="input-command" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Command to execute to start your bot (e.g., node index.js, npm run dev).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-muted/30 border-t border-border px-6 py-4">
              <Button type="submit" disabled={createBot.isPending} className="w-full sm:w-auto" data-testid="button-submit-bot">
                {createBot.isPending ? "Deploying..." : "Deploy Instance"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
