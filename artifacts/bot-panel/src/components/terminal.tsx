import { useEffect, useRef, useState } from "react";
import { useGetBotLogs, useSendTerminalInput } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TerminalSquare, Send } from "lucide-react";

interface TerminalProps {
  botId: number;
  status: string;
}

export function Terminal({ botId, status }: TerminalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: initialLogs } = useGetBotLogs(botId, { 
    query: { 
      enabled: !!botId,
      refetchInterval: isConnected ? false : 3000,
    } 
  });
  
  const sendInput = useSendTerminalInput();

  // Load initial logs
  useEffect(() => {
    if (initialLogs?.logs && !isConnected) {
      setLogs(initialLogs.logs.split('\n').filter(Boolean));
    }
  }, [initialLogs, isConnected]);

  // WebSocket Connection
  useEffect(() => {
    if (status === "running" || status === "starting") {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/bots/${botId}/terminal`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            setLogs(prev => [...prev, ...msg.data.split('\n').filter(Boolean)]);
          } else if (msg.type === "exit") {
            setLogs(prev => [...prev, `[System] Process exited with code ${msg.code}`]);
          }
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      ws.onclose = () => setIsConnected(false);

      return () => {
        ws.close();
      };
    }
  }, [botId, status]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "running") return;
    
    // Echo local input optimistically
    setLogs(prev => [...prev, `> ${input}`]);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: input + '\n' }));
    } else {
      sendInput.mutate({ id: botId, data: { text: input + '\n' } });
    }
    
    setInput("");
  };

  return (
    <div className="flex flex-col h-[500px] border border-border rounded-md bg-[#0a0a0a] overflow-hidden font-mono text-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/30 border-b border-border text-xs">
        <div className="flex items-center text-muted-foreground">
          <TerminalSquare className="w-4 h-4 mr-2" />
          Terminal
        </div>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-primary' : 'bg-muted-foreground'}`} />
          <span className="text-muted-foreground uppercase">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 text-gray-300 space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-muted-foreground italic">No logs available.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{log}</div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex border-t border-border bg-background p-2 gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2.5 text-primary font-bold">{'>'}</span>
          <Input 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Send input to terminal..." 
            className="bg-transparent border-none pl-8 font-mono focus-visible:ring-0 shadow-none text-primary focus-visible:ring-offset-0"
            disabled={status !== "running" && status !== "starting"}
            data-testid="input-terminal"
          />
        </div>
        <Button 
          type="submit" 
          size="icon" 
          variant="ghost" 
          disabled={status !== "running" && status !== "starting" || !input.trim()}
          data-testid="button-terminal-send"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
