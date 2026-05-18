import React, { useState, useEffect, useRef } from 'react';
import { useJarvis, JarvisMessage } from '@/hooks/useJarvis';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Navigate } from 'react-router-dom';
import { Bot, Send, Mic, MicOff, Terminal, Sparkles, User, Shield, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

function useMic(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript.trim();
      if (t) onResult(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return { listening, toggle };
}

export default function Jarvis() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isMaster, loading: profileLoading } = useProfile();
  const loading = authLoading || profileLoading;
  const { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus } = useJarvis();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { listening, toggle: toggleMic } = useMic((text) => {
    setInput(text);
    sendMessage(text);
    setInput('');
  });

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  if (loading) return null;
  if (!isMaster) return <Navigate to="/performance" replace />;

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <DashboardSidebar isAdmin={true} isMaster={true} onSignOut={signOut} />
        
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Header */}
          <header className="h-16 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6 shrink-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Bot className={cn("w-6 h-6 text-cyan-500", isSpeaking && "animate-pulse")} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-cyan-500">J.A.R.V.I.S.</h1>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-bold uppercase">
                    Master
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {isOnline ? 'Sistemas Online' : 'Jarvis Offline'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-xs font-medium">{user?.email}</span>
                <span className="text-[10px] text-muted-foreground">Administrador Master</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                <Shield className="w-4 h-4 text-cyan-500" />
              </div>
            </div>
          </header>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <ScrollArea className="flex-1 p-4 md:p-6">
              <div className="max-w-4xl mx-auto space-y-6 pb-20">
                {/* Initial Message */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                    <Bot className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="flex-1 space-y-2 max-w-[80%]">
                    <div className="bg-muted/30 border border-cyan-500/20 rounded-2xl p-4 text-sm leading-relaxed text-foreground shadow-sm">
                      {isOnline ? (
                        <>
                          <p className="font-semibold text-cyan-500 mb-1">Status: Sistemas Operacionais</p>
                          <p>Olá, Senhor. Tenho acesso aos dados do painel em tempo real. Posso consultar grupos, tarefas, pendências e métricas — e também executar comandos como criar tarefas. O que deseja?</p>
                        </>
                      ) : (
                        <p className="text-red-400">
                          Senhor, o JARVIS não está rodando. Inicie o aplicativo JARVIS.exe na sua máquina para ativar todas as funcionalidades.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {messages.map((msg, idx) => (
                  <div key={idx} className={cn("flex gap-4", msg.role === 'user' && "flex-row-reverse")}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                      msg.role === 'jarvis' 
                        ? "bg-cyan-500/20 border-cyan-500/30" 
                        : "bg-primary/20 border-primary/30"
                    )}>
                      {msg.role === 'jarvis' ? (
                        <Bot className="w-4 h-4 text-cyan-500" />
                      ) : (
                        <User className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className={cn(
                      "flex-1 space-y-1",
                      msg.role === 'user' ? "max-w-[70%] text-right" : "max-w-[80%]"
                    )}>
                      <div className={cn(
                        "rounded-2xl p-4 text-sm leading-relaxed shadow-sm",
                        msg.role === 'jarvis'
                          ? "bg-muted/30 border border-cyan-500/20 text-foreground"
                          : "bg-primary text-primary-foreground font-medium"
                      )}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">{msg.time}</span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                      <Bot className="w-4 h-4 text-cyan-500" />
                    </div>
                    <div className="bg-muted/30 border border-cyan-500/20 rounded-2xl p-4 flex gap-1 items-center shadow-sm">
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" />
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 md:p-6 border-t border-border/40 bg-background/95 backdrop-blur">
              <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-3">
                <Button 
                  type="button" 
                  size="icon" 
                  variant="outline"
                  onClick={toggleMic}
                  className={cn(
                    "rounded-full h-10 w-10 shrink-0 border-border/50",
                    listening && "bg-red-500/10 text-red-500 border-red-500/50 animate-pulse"
                  )}
                >
                  {listening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                
                <div className="relative flex-1 group">
                  <Input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isOnline ? "Comande o Jarvis..." : "Jarvis offline"}
                    disabled={!isOnline || isLoading}
                    className="h-10 pr-12 rounded-full border-border/50 bg-muted/20 focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500/50 transition-all placeholder:text-muted-foreground/50"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <div className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/30 font-mono pr-2">
                      <span className="px-1 border border-border/50 rounded">ENTER</span>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  size="icon" 
                  disabled={!input.trim() || isLoading || !isOnline}
                  className="rounded-full h-10 w-10 shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <div className="max-w-4xl mx-auto mt-2 px-14">
                <p className="text-[10px] text-muted-foreground/40 text-center md:text-left">
                  {isOnline 
                    ? "Jarvis operacional. Use comandos de voz ou texto para gerenciar o painel." 
                    : "Servidor Jarvis não detectado em localhost:3210."}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
