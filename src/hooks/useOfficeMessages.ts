import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OfficeMessage {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_avatar_color: string | null;
  content: string;
  tipo: string;
  created_at: string;
}

export function useOfficeMessages(roomId: string | null) {
  const [messages, setMessages] = useState<OfficeMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async (limit = 100) => {
    if (!roomId) { setMessages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("office_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (data) setMessages(data as OfficeMessage[]);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`office-room-${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "office_messages",
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as OfficeMessage]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const sendMessage = useCallback(async (
    content: string,
    userId: string,
    userName: string,
    avatarColor: string,
    tipo = "text"
  ) => {
    if (!roomId || !content.trim()) return;
    await supabase.from("office_messages").insert({
      room_id: roomId,
      user_id: userId,
      user_name: userName,
      user_avatar_color: avatarColor,
      content: content.trim(),
      tipo,
    });
  }, [roomId]);

  return { messages, sendMessage, loading, fetchMore: () => fetchMessages(500) };
}
