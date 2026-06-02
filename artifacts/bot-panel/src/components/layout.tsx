import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Terminal, LayoutDashboard, PlusCircle, Settings, Server } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <nav className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border font-mono text-sm font-semibold tracking-tight text-primary">
          <Server className="w-4 h-4 mr-2" />
          WH-PANEL
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Instances
          </div>
          
          <Link href="/" className={`flex items-center px-2 py-2 text-sm rounded-md transition-colors ${location === '/' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`} data-testid="link-dashboard">
            <LayoutDashboard className="w-4 h-4 mr-3" />
            Dashboard
          </Link>
          
          <Link href="/bots/new" className={`flex items-center px-2 py-2 text-sm rounded-md transition-colors ${location === '/bots/new' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`} data-testid="link-new-bot">
            <PlusCircle className="w-4 h-4 mr-3" />
            New Instance
          </Link>
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center text-xs text-muted-foreground">
            <Settings className="w-4 h-4 mr-2" />
            System Status: <span className="text-primary ml-1">Online</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
