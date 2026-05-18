import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const JARVIS_URL = 'http://localhost:3210';

export type JarvisMessage = {
  role: 'user' | 'jarvis';
  content: string;
  time: string;
};

export function useJarvis() {
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);

  // Verifica se o Jarvis está rodando
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${JARVIS_URL}/api/health`, {
        signal: AbortSignal.timeout(2000)
      });
      setIsOnline(res.ok);
      return res.ok;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  // Busca contexto do painel para enriquecer o Jarvis
  const getPanelContext = async (): Promise<string> => {
    try {
      const [grupos, tarefas, pendencias] = await Promise.all([
        supabase.from('whatsapp_grupos')
          .select('nome, status, gestor_responsavel, plano')
          .limit(15),
        supabase.from('tasks')
          .select('title, assigned_to, status, due_date')
          .eq('status', 'pending')
          .limit(10),
        supabase.from('pending_demand_resolutions')
          .select('term, status')
          .eq('status', 'open')
          .limit(10),
      ]);

      const today = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      return `
=== CONTEXTO DO PAINEL NEW VOX (${today}) ===

GRUPOS DE WHATSAPP (${grupos.data?.length || 0} carregados):
${JSON.stringify(grupos.data || [], null, 2)}

TAREFAS PENDENTES (${tarefas.data?.length || 0}):
${JSON.stringify(tarefas.data || [], null, 2)}

PENDÊNCIAS ABERTAS (${pendencias.data?.length || 0}):
${JSON.stringify(pendencias.data || [], null, 2)}

=== FIM DO CONTEXTO ===
Use esses dados para responder perguntas sobre o painel. 
Você é o assistente master da New Vox. Trate o usuário como Senhor/Senhora.
`.trim();
    } catch {
      return 'Contexto do painel indisponível no momento.';
    }
  };

  // Executa ações diretas no Supabase
  const executeAction = async (text: string): Promise<string | null> => {
    const t = text.toLowerCase();

    // Criar tarefa: "adiciona tarefa para o Murillo: fazer relatório"
    const taskMatch = text.match(
      /adiciona?\s+(?:uma?\s+)?tarefa\s+(?:para?\s+[oa]?\s*)?(\w+)[:\-,]?\s*(.+)/i
    );
    if (taskMatch) {
      const responsavel = taskMatch[1];
      const titulo = taskMatch[2].trim();
      const { error } = await supabase.from('tasks').insert({
        title: titulo,
        assigned_to: responsavel,
        status: 'pending',
        created_by: 'JARVIS',
      });
      if (!error) return `✓ Tarefa criada para ${responsavel}: "${titulo}"`;
    }

    return null;
  };

  // TTS — faz o Jarvis falar
  const speak = async (text: string) => {
    try {
      setIsSpeaking(true);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const res = await fetch(`${JARVIS_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 500) }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) { setIsSpeaking(false); return; }

      // O servidor retorna o ID do arquivo TTS
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

  // Enviar mensagem
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const time = new Date().toLocaleTimeString('pt-BR').slice(0, 5);
    const userMsg: JarvisMessage = { role: 'user', content: text, time };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // 1. Tenta executar como ação no painel
      const actionResult = await executeAction(text);

      // 2. Busca contexto atual do painel
      const context = await getPanelContext();

      // 3. Monta o histórico com contexto injetado
      const systemMessage = context + (actionResult ? `\n\nAção já executada: ${actionResult}` : '');
      
      // 4. Chama o Jarvis local
      const online = await checkStatus();
      if (!online) {
        const offlineMsg: JarvisMessage = {
          role: 'jarvis',
          content: 'Senhor, o JARVIS não está rodando no momento. Inicie o aplicativo JARVIS na sua máquina.',
          time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
        };
        setMessages(prev => [...prev, offlineMsg]);
        setIsLoading(false);
        return;
      }

      const res = await fetch(`${JARVIS_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: [
            // Injeta contexto do painel como primeira mensagem do sistema
            { role: 'system', content: systemMessage },
            ...historyRef.current.slice(-10),
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();

      // O Jarvis pode retornar direto ou precisar de continuação (tool use)
      let reply = data?.response || data?.text || data?.content || '';
      
      // Se precisar de continuação (tool use)
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

      if (!reply) reply = actionResult || 'Processado, Senhor.';

      const jarvisMsg: JarvisMessage = {
        role: 'jarvis',
        content: reply,
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      };

      setMessages(prev => [...prev, jarvisMsg]);

      // Atualiza histórico local
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ].slice(-20);

      // Faz o Jarvis falar
      await speak(reply);

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'jarvis',
        content: 'Desculpe, Senhor. Houve uma falha na comunicação com o JARVIS.',
        time: new Date().toLocaleTimeString('pt-BR').slice(0, 5),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, checkStatus]);

  return { messages, isLoading, isOnline, isSpeaking, sendMessage, checkStatus };
}
