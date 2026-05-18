import React, { useState, useEffect, useRef } from 'react';
import { useJarvis, JarvisMessage } from '@/hooks/useJarvis';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Navigate } from 'react-router-dom';
import { Bot, Send, Mic, MicOff, User, Shield, Activity, Zap, Cpu } from 'lucide-react';
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
  const { profile, isMaster, loading: profileLoading } = useProfile();
  const loading = authLoading || profileLoading;
  const { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus } = useJarvis();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Senhor';

  const { listening, toggle: toggleMic } = useMic((text) => {
    setInput(text);
    sendMessage(text, userName);
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
    sendMessage(input, userName);
    setInput('');
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#020817] text-cyan-50 overflow-hidden font-sans">
        <DashboardSidebar isAdmin={true} isMaster={true} onSignOut={signOut} />
        
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          {/* Background Tech Grids/Effects */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,186,255,0.1),transparent_70%)]" />
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem]" />
          </div>

          {/* Header Stark Style */}
          <header className="h-20 border-b border-cyan-500/20 bg-[#020817]/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 z-20 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={cn(
                  "absolute -inset-1 rounded-full blur-sm bg-cyan-500/50",
                  isSpeaking && "animate-pulse"
                )} />
                <div className="relative p-3 bg-cyan-950/50 rounded-full border border-cyan-500/30">
                  <Bot className={cn("w-7 h-7 text-cyan-400", isSpeaking && "animate-pulse")} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-black tracking-[0.2em] text-cyan-400 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">J.A.R.V.I.S.</h1>
                  <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] tracking-widest font-bold uppercase py-0.5">
                    MK-II PROTOCOL
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Activity className={cn("w-3 h-3", isOnline ? "text-cyan-400 animate-pulse" : "text-red-500")} />
                  <span className="text-[10px] text-cyan-500/60 uppercase tracking-widest font-bold">
                    {isOnline ? 'Sistemas Operacionais: Online' : 'Alerta: Núcleo Desconectado'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden lg:flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cyan-400/80 tracking-wide uppercase italic">Protocolo de Segurança: Ativo</span>
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="text-[10px] text-cyan-500/40 uppercase font-mono tracking-tighter mt-0.5">Autorização Master: {userName}</span>
              </div>
              <div className="h-10 w-px bg-cyan-500/20" />
              <div className="flex gap-2">
                 <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/20">
                    <Zap className="w-4 h-4 text-cyan-400" />
                 </div>
                 <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/20">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                 </div>
              </div>
            </div>
          </header>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden relative flex flex-col z-10">
            <ScrollArea className="flex-1 px-4 md:px-8 py-6">
              <div className="max-w-5xl mx-auto space-y-8 pb-20">
                {/* Initial Welcome */}
                <div className="flex gap-5">
                  <div className="w-10 h-10 rounded-lg bg-cyan-950/50 flex items-center justify-center shrink-0 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                    <Bot className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="bg-cyan-950/20 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-5 shadow-2xl">
                       <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                         <div className="w-1 h-3 bg-cyan-500" /> Módulo de Saudação
                       </h3>
                       <p className="text-sm leading-relaxed text-cyan-100/90 font-medium italic">
                        {isOnline 
                          ? `Bem-vindo de volta, ${userName}. Carregando todos os módulos de análise do Painel New Vox. Como posso auxiliá-lo nesta jornada hoje?`
                          : `Sinto muito, ${userName}. Estou operando apenas em modo de emergência. Por favor, reinicie meu núcleo local em localhost:3210.`}
                       </p>
                    </div>
                  </div>
                </div>

                {messages.map((msg, idx) => (
                  <div key={idx} className={cn("flex gap-5", msg.role === 'user' && "flex-row-reverse")}>
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-300",
                      msg.role === 'assistant' 
                        ? "bg-cyan-950/50 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]" 
                        : "bg-blue-950/50 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                    )}>
                      {msg.role === 'assistant' ? (
                        <Bot className="w-5 h-5 text-cyan-400" />
                      ) : (
                        <User className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div className={cn(
                      "flex-1 space-y-2",
                      msg.role === 'user' ? "max-w-[75%] text-right" : "max-w-[85%]"
                    )}>
                      <div className={cn(
                        "rounded-xl p-5 text-sm leading-relaxed shadow-lg backdrop-blur-sm border transition-all",
                        msg.role === 'assistant'
                          ? "bg-cyan-950/30 border-cyan-500/20 text-cyan-50"
                          : "bg-blue-600/10 border-blue-500/30 text-blue-50 font-medium"
                      )}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      <span className="text-[10px] text-cyan-500/40 font-mono px-2 uppercase tracking-tighter">{msg.time} • Módulo {msg.role === 'assistant' ? 'J.A.R.V.I.S.' : 'Usuário'}</span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="w-10 h-10 rounded-lg bg-cyan-950/50 flex items-center justify-center shrink-0 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                      <Bot className="w-5 h-5 text-cyan-400 animate-pulse" />
                    </div>
                    <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl p-5 flex gap-2 items-center">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest ml-2">Analisando Dados...</span>
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Futuristic Input Area */}
            <div className="p-6 border-t border-cyan-500/20 bg-[#020817]/95 backdrop-blur-2xl relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
               {/* UI Accents */}
               <div className="absolute top-0 left-0 w-16 h-[2px] bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
               <div className="absolute top-0 right-0 w-16 h-[2px] bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)]" />

              <form onSubmit={handleSend} className="max-w-5xl mx-auto flex items-center gap-4 relative">
                <div className="absolute -left-12 hidden xl:block">
                   <div className="flex flex-col gap-1 items-center opacity-40">
                      <div className="w-[1px] h-8 bg-cyan-500" />
                      <div className="text-[8px] font-bold text-cyan-500 uppercase vertical-text tracking-widest py-2">input.stream</div>
                      <div className="w-[1px] h-8 bg-cyan-500" />
                   </div>
                </div>

                <Button 
                  type="button" 
                  size="icon" 
                  variant="outline"
                  onClick={toggleMic}
                  className={cn(
                    "rounded-xl h-12 w-12 shrink-0 border-cyan-500/30 bg-cyan-950/20 transition-all duration-300",
                    listening && "bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse",
                    !listening && "hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                  )}
                >
                  {listening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                
                <div className="relative flex-1 group">
                  <Input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isOnline ? `Aguardando seus comandos, ${userName}...` : "Núcleo Offline"}
                    disabled={!isOnline || isLoading}
                    className="h-12 px-6 rounded-xl border-cyan-500/30 bg-cyan-950/30 text-cyan-100 placeholder:text-cyan-500/30 focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500/50 transition-all font-medium tracking-wide shadow-inner"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 font-mono text-[10px] font-bold text-cyan-400 opacity-50 uppercase tracking-tighter">
                      Enter
                    </kbd>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  size="icon" 
                  disabled={!input.trim() || isLoading || !isOnline}
                  className="rounded-xl h-12 w-12 shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </form>
              <div className="max-w-5xl mx-auto mt-4 px-16 flex justify-between items-center text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-500/30 italic">
                <span>Engenharia de Dados: New Vox mk-II</span>
                <span className="animate-pulse">Sincronização Ativa</span>
                <span>Stark Industries OS v4.2.0</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}