import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendWhatsApp, lookupTeamPhone } from "../_shared/evolution.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map lowercase recipient → profile full_name variants used to look up profiles.telefone
const RECIPIENT_LOOKUP: Record<string, string[]> = {
  "alisson": ["Alisson"],
  "murillo": ["Murillo", "Murilo Araújo"],
  "murilo": ["Murillo", "Murilo Araújo"],
  "priscilla": ["Priscilla", "Priscilla Borges"],
  "priscila": ["Priscilla", "Priscilla Borges"],
  "netto": ["Netto", "Netto Monge"],
  "jader": ["Jader", "Jader Costa"],
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, history, userName } = await req.json()
    console.log(`Recebendo comando de ${userName}: ${message}`);

    const openAiKey = Deno.env.get('openai')
    if (!openAiKey) {
      console.error('Erro: Chave OpenAI não encontrada no ambiente');
      return new Response(
        JSON.stringify({ error: 'Configuração ausente: Chave OpenAI não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. ChatGPT Chat Completion with Tool Calling
    console.log('Chamando OpenAI...');
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          ...history,
          { role: 'user', content: message }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "send_whatsapp_message",
              description: "Envia uma mensagem via WhatsApp para um membro da equipe (Murillo, Netto, Priscilla, Jader) ou para o próprio Alisson.",
              parameters: {
                type: "object",
                properties: {
                  recipient_name: { type: "string", description: "Nome do destinatário (Murillo, Netto, Priscilla, Alisson)" },
                  text: { type: "string", description: "Conteúdo da mensagem" },
                },
                required: ["recipient_name", "text"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "send_group_message",
              description: "Envia uma mensagem via WhatsApp para um grupo de cliente específico usando o ID do grupo.",
              parameters: {
                type: "object",
                properties: {
                  group_id: { type: "string", description: "O ID do grupo de WhatsApp do cliente" },
                  text: { type: "string", description: "Conteúdo da mensagem" },
                },
                required: ["group_id", "text"],
              },
            },
          }
        ],
        tool_choice: "auto",
        temperature: 0.7,
      }),
    })

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error('Erro OpenAI Chat:', errorText);
      return new Response(
        JSON.stringify({ error: `Erro na API da OpenAI: ${chatResponse.status}`, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const chatData = await chatResponse.json()
    
    if (!chatData.choices || chatData.choices.length === 0) {
      console.error('Resposta inesperada da OpenAI:', JSON.stringify(chatData));
      return new Response(
        JSON.stringify({ error: 'Resposta inesperada da OpenAI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let reply = chatData.choices[0].message.content
    const toolCalls = chatData.choices[0].message.tool_calls

    const executedActions: string[] = []

    if (toolCalls) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      console.log(`Executando ${toolCalls.length} chamadas de ferramenta...`);
      for (const toolCall of toolCalls) {
        try {
          if (toolCall.function.name === "send_whatsapp_message") {
            const args = JSON.parse(toolCall.function.arguments)
            const recipient = args.recipient_name.toLowerCase();
            const variants = RECIPIENT_LOOKUP[recipient];

            if (!variants) {
              executedActions.push(`✗ Destinatário ${args.recipient_name} não configurado.`)
              continue;
            }

            const phone = await lookupTeamPhone(supabase, variants);
            if (!phone) {
              executedActions.push(`✗ Telefone de ${args.recipient_name} não cadastrado no perfil.`)
              continue;
            }

            const result = await sendWhatsApp(phone, args.text);
            if (result.ok) {
              executedActions.push(`✓ Mensagem enviada para ${args.recipient_name} via WhatsApp.`)
            } else {
              executedActions.push(`✗ Falha ao enviar para ${args.recipient_name} (${result.status}).`)
            }
          } else if (toolCall.function.name === "send_group_message") {
            const args = JSON.parse(toolCall.function.arguments)
            const result = await sendWhatsApp(args.group_id, args.text);
            if (result.ok) {
              executedActions.push(`✓ Mensagem enviada para o grupo ${args.group_id}.`)
            } else {
              executedActions.push(`✗ Falha ao enviar para o grupo ${args.group_id} (${result.status}).`)
            }
          }
        } catch (toolError) {
          console.error(`Erro ao executar ferramenta ${toolCall.function.name}:`, toolError);
          executedActions.push(`✗ Erro ao executar ${toolCall.function.name}.`)
        }
      }

      
      if (!reply) {
        reply = executedActions.join("\n") || "Comando executado, Senhor."
      } else {
        reply += "\n\n" + executedActions.join("\n")
      }
    }

    // 2. OpenAI TTS
    const cleanSpeech = reply.replace(/\{"action":.*?\}/g, '').trim()
    console.log('Gerando áudio TTS...');
    
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'onyx',
        input: cleanSpeech,
      }),
    })

    let audioBase64 = null;
    if (ttsResponse.ok) {
      const audioBlob = await ttsResponse.blob()
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      audioBase64 = btoa(binary);
      console.log('Áudio gerado com sucesso.');
    } else {
      console.error('Erro ao gerar áudio TTS:', await ttsResponse.text());
    }

    return new Response(
      JSON.stringify({ 
        reply, 
        audio: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro fatal no Jarvis Brain:', error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
