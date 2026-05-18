import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALISSON_WEBHOOK_URL = "https://bot-n8n.1lxz8u.easypanel.host/webhook/b833f73e-af8f-4231-85de-1ec473e52dcd";
const TEAM_WEBHOOK_MAP: Record<string, string> = {
  "Murillo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
  "Murilo": "https://bot-n8n.1lxz8u.easypanel.host/webhook/1b00c3d7-3482-4543-b0d5-50b27a74e733",
  "Priscilla": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
  "Priscila": "https://bot-n8n.1lxz8u.easypanel.host/webhook/cb1e3596-01ff-4cd2-a3a6-32433c8b8ca5",
  "Netto": "https://bot-n8n.1lxz8u.easypanel.host/webhook/2ee4657c-1125-4337-8c80-1977daa94bd3",
  "Jader": "https://bot-n8n.1lxz8u.easypanel.host/webhook/fb54db1e-c06c-4b55-bf2f-49a80c40943e",
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
      console.error('Chave OpenAI não configurada');
      throw new Error('Chave OpenAI não configurada')
    }

    // 1. ChatGPT Chat Completion with Tool Calling
    console.log('Chamando OpenAI Chat Completion...');
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

    const chatData = await chatResponse.json()
    let reply = chatData.choices[0].message.content
    const toolCalls = chatData.choices[0].message.tool_calls

    const executedActions: string[] = []

    if (toolCalls) {
      for (const toolCall of toolCalls) {
        if (toolCall.function.name === "send_whatsapp_message") {
          const args = JSON.parse(toolCall.function.arguments)
          const webhookUrl = args.recipient_name.toLowerCase() === "alisson" 
            ? ALISSON_WEBHOOK_URL 
            : TEAM_WEBHOOK_MAP[args.recipient_name];

          if (webhookUrl) {
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: args.text }),
            })
            executedActions.push(`✓ Mensagem enviada para ${args.recipient_name} via WhatsApp.`)
          }
        } else if (toolCall.function.name === "send_group_message") {
          const args = JSON.parse(toolCall.function.arguments)
          // Usamos o webhook do Alisson que tem permissão para enviar em grupos
          await fetch(ALISSON_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: args.text, groupId: args.group_id }),
          })
          executedActions.push(`✓ Mensagem enviada para o grupo ${args.group_id}.`)
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

    const audioBlob = await ttsResponse.blob()
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(await audioBlob.arrayBuffer())))

    return new Response(
      JSON.stringify({ 
        reply, 
        audio: `data:audio/mp3;base64,${audioBase64}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
