import { useEffect, useRef, useCallback, useState } from "react";
import { OfficeUser } from "@/hooks/useOfficePresence";
import { cn } from "@/lib/utils";

const MAP_COLS = 16;
const MAP_ROWS = 10;

// Room definitions
const ROOMS: { name: string; x1: number; y1: number; x2: number; y2: number; color: string; icon: string }[] = [
  { name: "Sala de Reunião A", x1: 0, y1: 0, x2: 3, y2: 3, color: "hsl(var(--primary) / 0.08)", icon: "🏢" },
  { name: "Sala de Reunião B", x1: 0, y1: 6, x2: 3, y2: 9, color: "hsl(var(--accent) / 0.15)", icon: "🏢" },
  { name: "Área de Descanso", x1: 12, y1: 0, x2: 15, y2: 3, color: "hsl(120 40% 50% / 0.08)", icon: "☕" },
  { name: "Área Criativa", x1: 12, y1: 6, x2: 15, y2: 9, color: "hsl(280 40% 50% / 0.08)", icon: "🎨" },
];

// Desk positions (where avatars sit)
const DESKS: { x: number; y: number; label: string }[] = [
  { x: 5, y: 2, label: "Mesa 1" }, { x: 7, y: 2, label: "Mesa 2" },
  { x: 9, y: 2, label: "Mesa 3" }, { x: 11, y: 2, label: "Mesa 4" },
  { x: 5, y: 5, label: "Mesa 5" }, { x: 7, y: 5, label: "Mesa 6" },
  { x: 9, y: 5, label: "Mesa 7" }, { x: 11, y: 5, label: "Mesa 8" },
  { x: 5, y: 8, label: "Mesa 9" }, { x: 7, y: 8, label: "Mesa 10" },
  { x: 9, y: 8, label: "Mesa 11" }, { x: 11, y: 8, label: "Mesa 12" },
];

interface Props {
  users: OfficeUser[];
  myPosition: { x: number; y: number };
  currentUserId?: string;
  onMove: (dx: number, dy: number) => void;
  onClickTile: (x: number, y: number) => void;
  onClickUser: (u: OfficeUser) => void;
  nearbyUser: OfficeUser | null;
}

function getRoomAt(x: number, y: number) {
  return ROOMS.find(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
}

function getDeskAt(x: number, y: number) {
  return DESKS.find(d => d.x === x && d.y === y);
}

export { MAP_COLS, MAP_ROWS, ROOMS, DESKS, getRoomAt };

export default function OfficeMap({ users, myPosition, currentUserId, onMove, onClickTile, onClickUser, nearbyUser }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard movement
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowUp": case "w": case "W": e.preventDefault(); onMove(0, -1); break;
        case "ArrowDown": case "s": case "S": e.preventDefault(); onMove(0, 1); break;
        case "ArrowLeft": case "a": case "A": e.preventDefault(); onMove(-1, 0); break;
        case "ArrowRight": case "d": case "D": e.preventDefault(); onMove(1, 0); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onMove]);

  const getUserAt = (x: number, y: number) => users.filter(u => u.x === x && u.y === y);

  return (
    <div ref={containerRef} className="relative w-full overflow-auto rounded-xl border border-border/50 bg-card shadow-lg">
      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `repeat(${MAP_COLS}, minmax(56px, 1fr))`,
          gridTemplateRows: `repeat(${MAP_ROWS}, 56px)`,
        }}
      >
        {Array.from({ length: MAP_ROWS * MAP_COLS }).map((_, i) => {
          const x = i % MAP_COLS;
          const y = Math.floor(i / MAP_COLS);
          const room = getRoomAt(x, y);
          const desk = getDeskAt(x, y);
          const tileUsers = getUserAt(x, y);
          const isMe = myPosition.x === x && myPosition.y === y;
          const isRoomBorderTop = room && y === room.y1;
          const isRoomBorderLeft = room && x === room.x1;
          const isRoomLabel = room && x === room.x1 && y === room.y1;

          return (
            <div
              key={i}
              onClick={() => {
                const clickedUser = tileUsers.find(u => u.user_id !== currentUserId);
                if (clickedUser) {
                  onClickUser(clickedUser);
                } else {
                  onClickTile(x, y);
                }
              }}
              className={cn(
                "relative flex items-center justify-center border border-border/10 cursor-pointer transition-all duration-150 select-none",
                "hover:bg-primary/5",
                desk && "bg-muted/40",
                isMe && "ring-2 ring-primary/50 ring-inset",
              )}
              style={{
                backgroundColor: room ? room.color : undefined,
                borderTopWidth: isRoomBorderTop ? 2 : undefined,
                borderTopColor: isRoomBorderTop ? "hsl(var(--primary) / 0.3)" : undefined,
                borderLeftWidth: isRoomBorderLeft ? 2 : undefined,
                borderLeftColor: isRoomBorderLeft ? "hsl(var(--primary) / 0.3)" : undefined,
              }}
            >
              {/* Room label */}
              {isRoomLabel && (
                <span className="absolute top-0.5 left-1 text-[8px] font-medium text-muted-foreground whitespace-nowrap z-10">
                  {room.icon} {room.name}
                </span>
              )}

              {/* Desk icon */}
              {desk && tileUsers.length === 0 && !isMe && (
                <div className="flex flex-col items-center gap-0.5 opacity-30">
                  <span className="text-lg">🪑</span>
                  <span className="text-[7px] text-muted-foreground">{desk.label}</span>
                </div>
              )}

              {/* Users on tile */}
              {tileUsers.map(u => {
                const isSelf = u.user_id === currentUserId;
                const isNearby = nearbyUser?.user_id === u.user_id;
                return (
                  <div
                    key={u.id}
                    className={cn(
                      "absolute flex flex-col items-center transition-all duration-300 z-20",
                      isNearby && "scale-110",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md border-2",
                        isSelf ? "border-primary animate-pulse" : "border-card",
                        u.status === "ocupado" && "opacity-70",
                        u.status === "em_chamada" && "ring-2 ring-emerald-400 ring-offset-1",
                      )}
                      style={{ backgroundColor: u.avatar_color }}
                    >
                      {u.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className={cn(
                      "text-[8px] font-medium mt-0.5 px-1 rounded bg-card/90 text-foreground whitespace-nowrap",
                      isSelf && "font-bold text-primary"
                    )}>
                      {u.user_name.split(" ")[0]}
                    </span>
                    {u.status !== "online" && (
                      <span className="text-[7px] text-muted-foreground">
                        {u.status === "ocupado" ? "🔴" : u.status === "em_chamada" ? "📞" : "💤"}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Current user if no db record yet */}
              {isMe && !tileUsers.some(u => u.user_id === currentUserId) && (
                <div className="absolute flex flex-col items-center z-20">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shadow-md border-2 border-primary animate-pulse">
                    ?
                  </div>
                  <span className="text-[8px] font-bold text-primary mt-0.5">Você</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
