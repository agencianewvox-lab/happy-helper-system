import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";

export interface OfficeUser {
  id: string;
  user_id: string;
  user_name: string;
  x: number;
  y: number;
  status: string;
  avatar_color: string;
  current_room: string | null;
  last_seen: string;
}

const AVATAR_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

function pickColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function useOfficePresence() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [myPosition, setMyPosition] = useState({ x: 5, y: 5 });
  const [isConnected, setIsConnected] = useState(false);
  const presenceId = useRef<string | null>(null);

  // Upsert own presence
  const upsertPresence = useCallback(async (x: number, y: number, status = "online", room: string | null = null) => {
    if (!user || !profile) return;
    const { data, error } = await supabase
      .from("office_presence")
      .upsert({
        user_id: user.id,
        user_name: profile.full_name,
        x, y, status,
        avatar_color: pickColor(profile.full_name),
        current_room: room,
        last_seen: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (!error && data) presenceId.current = data.id;
  }, [user, profile]);

  // Join office
  useEffect(() => {
    if (!user || !profile) return;
    const startX = 3 + Math.floor(Math.random() * 6);
    const startY = 3 + Math.floor(Math.random() * 4);
    setMyPosition({ x: startX, y: startY });
    upsertPresence(startX, startY);
    setIsConnected(true);

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      upsertPresence(myPosition.x, myPosition.y);
    }, 15000);

    return () => {
      clearInterval(heartbeat);
      // Remove on unmount
      if (user) {
        supabase.from("office_presence").delete().eq("user_id", user.id).then(() => {});
      }
    };
  }, [user, profile]);

  // Fetch all users
  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("office_presence")
      .select("*")
      .gte("last_seen", new Date(Date.now() - 60000).toISOString());
    if (data) setUsers(data as OfficeUser[]);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("office-presence-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "office_presence" }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers]);

  // Move avatar
  const move = useCallback(async (dx: number, dy: number, mapWidth: number, mapHeight: number) => {
    if (!user) return;
    setMyPosition(prev => {
      const nx = Math.max(0, Math.min(mapWidth - 1, prev.x + dx));
      const ny = Math.max(0, Math.min(mapHeight - 1, prev.y + dy));
      upsertPresence(nx, ny);
      return { x: nx, y: ny };
    });
  }, [user, upsertPresence]);

  const moveTo = useCallback(async (x: number, y: number) => {
    if (!user) return;
    setMyPosition({ x, y });
    upsertPresence(x, y);
  }, [user, upsertPresence]);

  const updateStatus = useCallback(async (status: string) => {
    if (!user) return;
    upsertPresence(myPosition.x, myPosition.y, status);
  }, [user, myPosition, upsertPresence]);

  return { users, myPosition, move, moveTo, updateStatus, isConnected, currentUserId: user?.id };
}
