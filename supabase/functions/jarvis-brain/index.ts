import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, history, userName } = await req.json()
    const openAiKey = Deno.env.get('openai')

    if (!openAiKey) {
      throw new Error('Chave OpenAI não configurada')
    }

    // 1. ChatGPT Chat Completion
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
        temperature: 0.7,
      }),
    })

    const chatData = await chatResponse.json()
    const reply = chatData.choices[0].message.content

    // 2. OpenAI TTS (Text-to-Speech)
    // Limpamos JSON do texto para a voz
    const cleanSpeech = reply.replace(/\{"action":.*?\}/g, '').trim()
    
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
