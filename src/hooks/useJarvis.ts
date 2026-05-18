import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const JARVIS_URL = 'http://localhost:3210';

export type JarvisMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  time: string;
};

export function useJarvis() {
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([]);

  const checkStatus = useCallback(async () => {
    try {
      await fetch(`${JARVIS_URL}/api/health`, {
        mode: 'no-cors',
        signal: AbortSignal.timeout(2000)
      });
      setIsOnline(true);
      return true;
    } catch {
      try {
        await fetch(`${JARVIS_URL}/`, {
          mode: 'no-cors',
          signal: AbortSignal.timeout(2000)
        });
        setIsOnline(true);
        return true;
      } catch {
        setIsOnline(false);
        return false;
      }
    }
  }, []);

  const getPanelContext = async (): Promise<string> => {
    try {
      const [grupos, tarefas, pendencias] = await Promise.all([
        supabase.from('whatsapp_grupos')
          .select('nome, status, gestor_responsavel, plano, created_at')
          .limit(20),
        supabase.from('tasks')
          .select('title, assigned_to, status, due_date')
          .eq('status', 'pending')
          .limit(15),
        supabase.from('pending_demand_resolutions')
          .select('term, status')
          .eq('status', 'open')
          .limit(10),
      ]);

      const today = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      return `
VOCÊ É O J.A.R.V.I.S. (Just A Rather Very Intelligent System), assistente pessoal avançado da New Vox.
Seu "cérebro" é alimentado pelo GPT-4o e sua interface é inspirada na tecnologia das Indústrias Stark.

DIRETRIZES:
1. Trate Alisson e Priscilla como seus mestres/criadores. Outros usuários master devem ser tratados com extremo respeito (Senhor/Senhora).
2. Use uma linguagem técnica, polida e prestativa, típica do Jarvis do Homem de Ferro.
3. Você tem acesso aos dados reais do painel New Vox.
4. Ao ser perguntado sobre a "saúde" de um grupo, analise o status e se há pendências abertas para ele.

CONTEXTO ATUAL (${today}):
GRUPOS DE WHATSAPP: ${JSON.stringify(grupos.data || [])}
TAREFAS PENDENTES: ${JSON.stringify(tarefas.data || [])}
PENDÊNCIAS: ${JSON.stringify(pendencias.data || [])}

COMANDOS ESPECIAIS:
- Para criar tarefas, o sistema já executa automaticamente se você responder no formato JSON: {"action": "create_task", "params": {"title": "...", "assigned_to": "..."}}
`.trim();
    } catch {
      return 'Contexto do painel indisponível.';
    }
  };

  const executeAction = async (aiReply: string): Promise<string | null> => {
    try {
      if (aiReply.includes('"action": "create_task"')) {
        const jsonMatch = aiReply.match(/\{"action":\s*"create_task".*?\}/);
        if (jsonMatch) {
          const { params } = JSON.parse(jsonMatch[0]);
          const { error } = await supabase.from('tasks').insert({
            title: params.title,
            assigned_to: params.assigned_to,
            status: 'pending',
            created_by: 'JARVIS',
          });
          if (!error) return `✓ Tarefa criada para ${params.assigned_to}: "${params.title}"`;
        }
      }
    } catch (e) {
      console.error("Action error:", e);
    }
    return null;
  };

  const speak = async (text: string) => {
    try {
      setIsSpeaking(true);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Limpa o texto de marcações JSON para a voz não ler o código
      const cleanText = text.replace(/\{"action":.*?\}/g, '').trim();

      const res = await fetch(`${JARVIS_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: cleanText,
          voice: 'onyx' // Voz mais imponente e humana da OpenAI (se suportado pelo backend local)
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) { setIsSpeaking(false); return; }

      const data = await res.json();
      if (data?.id) {
        const audio = new Audio(`${JARVIS_URL}/tts/${data.id}`);
        audioRef.current = audio;
        audio.onended = () => { setIsSpeaking(false); audioRef.current = null; };
        audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; };
        await audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch {
      setIsSpeaking(false);
    }
  };

  const sendMessage = useCallback(async (text: string, userName: string) => {
    if (!text.trim() || isLoading) return;

    const time = new Date().toLocaleTimeString('pt-BR').slice(0, 5);
    const userMsg: JarvisMessage = { role: 'user', content: text, time };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const online = await checkStatus();
      if (!online) {
        const offlineMsg: JarvisMessage = {
          role: 'assistant',
          content: 'Senhor, meu servidor central em localhost:3210 não está respondendo. Por favor, verifique se o executável do JARVIS está ativo.',
          time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
        };
        setMessages(prev => [...prev, offlineMsg]);
        setIsLoading(false);
        return;
      }

      const context = await getPanelContext();
      const personalizedSystem = context + `\nUSUÁRIO ATUAL: ${userName}`;

      const res = await fetch(`${JARVIS_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: [
            { role: 'system', content: personalizedSystem },
            ...historyRef.current.slice(-10),
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();
      let reply = data?.response || data?.text || data?.content || '';

      if (data?.sid && !reply) {
        const cont = await fetch(`${JARVIS_URL}/api/chat/continue/${data.sid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(30000),
        });
        const contData = await cont.json();
        reply = contData?.response || contData?.text || contData?.content || 'Processado, Senhor.';
      }

      if (!reply) reply = 'Senhor, encontrei uma instabilidade em meus módulos de processamento.';

      // Executa ações se o Jarvis decidiu criar algo
      const actionResult = await executeAction(reply);
      const displayReply = reply.replace(/\{"action":.*?\}/g, '').trim() + (actionResult ? `\n\n${actionResult}` : '');

      const jarvisMsg: JarvisMessage = {
        role: 'assistant',
        content: displayReply,
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ].slice(-20);

      await speak(displayReply);

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Desculpe, Senhor. Meus sistemas de comunicação falharam.',
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, checkStatus]);

  return { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus };
}
