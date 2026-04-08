import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { getAvatarColor } from "@/lib/avatarUtils";

export interface OfficeUser {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_color: string | null;
  avatar_color: string;
  room_id: string | null;
  status: string;
  status_message: string | null;
  mic_enabled: boolean | null;
  cam_enabled: boolean | null;
  last_seen: string;
  joined_room_at: string | null;
}

export interface OfficeRoom {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  cor: string | null;
  capacidade_max: number | null;
  voz_ativa_padrao: boolean | null;
  ordem: number | null;
  ativo: boolean | null;
  locked_by: string | null;
  locked_by_name: string | null;
}

export function useOfficePresence() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [rooms, setRooms] = useState<OfficeRoom[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const currentStatusRef = useRef("online");

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from("office_rooms")
      .select("*")
      .eq("ativo", true)
      .order("ordem");
    if (data) setRooms(data as OfficeRoom[]);
    return data;
  }, []);

  // Fetch all online users
  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("office_presence")
      .select("*")
      .gte("last_seen", new Date(Date.now() - 120000).toISOString());
    if (data) setUsers(data as OfficeUser[]);
  }, []);

  // Upsert own presence
  const upsertPresence = useCallback(async (updates: Record<string, any> = {}) => {
    if (!user || !profile) return;
    const color = getAvatarColor(profile.full_name);
    await supabase
      .from("office_presence")
      .upsert({
        user_id: user.id,
        user_name: profile.full_name,
        avatar_color: color,
        user_avatar_color: color,
        x: 0, y: 0,
        last_seen: new Date().toISOString(),
        ...updates,
      }, { onConflict: "user_id" });
  }, [user, profile]);

  // Join office (on mount)
  useEffect(() => {
    if (!user || !profile) return;

    const init = async () => {
      const roomsData = await fetchRooms();
      const recepcao = roomsData?.find(r => r.nome === "Recepção");
      const roomId = recepcao?.id || null;

      await upsertPresence({
        status: "online",
        room_id: roomId,
        joined_room_at: new Date().toISOString(),
      });
      setCurrentRoomId(roomId);
      setIsConnected(true);

      // System message
      if (roomId) {
        await supabase.from("office_messages").insert({
          room_id: roomId,
          user_id: user.id,
          user_name: profile.full_name,
          user_avatar_color: getAvatarColor(profile.full_name),
          content: `${profile.full_name} entrou na sala`,
          tipo: "system",
        });
      }

      await fetchUsers();
    };

    init();

    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      upsertPresence({ status: currentStatusRef.current });
    }, 15000);

    return () => {
      clearInterval(heartbeatRef.current);
      clearTimeout(idleTimerRef.current);
      if (user) {
        supabase.from("office_presence").delete().eq("user_id", user.id).then(() => {});
      }
    };
  }, [user, profile]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("office-presence-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "office_presence" }, fetchUsers)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers]);

  // Idle detection
  useEffect(() => {
    const resetIdle = () => {
      if (currentStatusRef.current === "away") {
        currentStatusRef.current = "online";
        upsertPresence({ status: "online" });
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (currentStatusRef.current === "online") {
          currentStatusRef.current = "away";
          upsertPresence({ status: "away" });
        }
      }, 300000); // 5 min
    };

    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keydown", resetIdle);
    resetIdle();

    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keydown", resetIdle);
    };
  }, [upsertPresence]);

  // Switch room
  const switchRoom = useCallback(async (roomId: string | null) => {
    if (!user) return;
    setCurrentRoomId(roomId);
    await upsertPresence({
      room_id: roomId,
      joined_room_at: roomId ? new Date().toISOString() : null,
    });

    // System message for entering room
    if (roomId && profile) {
      await supabase.from("office_messages").insert({
        room_id: roomId,
        user_id: user.id,
        user_name: profile.full_name,
        user_avatar_color: getAvatarColor(profile.full_name),
        content: `${profile.full_name} entrou na sala`,
        tipo: "system",
      });
    }
  }, [user, profile, upsertPresence]);

  // Update status
  const updateStatus = useCallback(async (status: string) => {
    currentStatusRef.current = status;
    await upsertPresence({ status });
  }, [upsertPresence]);

  // Update status message
  const updateStatusMessage = useCallback(async (msg: string) => {
    await upsertPresence({ status_message: msg || null });
  }, [upsertPresence]);

  // Toggle mic
  const toggleMic = useCallback(async (enabled: boolean) => {
    await upsertPresence({ mic_enabled: enabled });
  }, [upsertPresence]);

  return {
    users,
    rooms,
    currentRoomId,
    switchRoom,
    updateStatus,
    updateStatusMessage,
    toggleMic,
    isConnected,
    currentUserId: user?.id,
    fetchRooms,
  };
}
