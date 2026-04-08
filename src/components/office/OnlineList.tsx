import { OfficeUser, OfficeRoom } from "@/hooks/useOfficePresence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import OfficeAvatar from "./OfficeAvatar";

interface Props {
  users: OfficeUser[];
  rooms: OfficeRoom[];
  currentUserId?: string;
  onClickUser: (u: OfficeUser) => void;
}

export default function OnlineList({ users, rooms, currentUserId, onClickUser }: Props) {
  const roomMap = new Map(rooms.map(r => [r.id, r.nome]));

  const sorted = [...users].sort((a, b) => {
    if (a.status === "offline" && b.status !== "offline") return 1;
    if (a.status !== "offline" && b.status === "offline") return -1;
    return a.user_name.localeCompare(b.user_name);
  });

  const onlineCount = users.filter(u => u.status !== "offline").length;

  return (
    <Card className="border-border/30 bg-card/60 h-full flex flex-col">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
          <Users className="w-3.5 h-3.5" />
          Pessoas ({onlineCount})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-1 pb-1">
        <ScrollArea className="h-full">
          <div className="space-y-0.5 px-2">
            {sorted.map(u => {
              const isSelf = u.user_id === currentUserId;
              const roomName = u.room_id ? roomMap.get(u.room_id) : null;

              return (
                <button
                  key={u.id}
                  onClick={() => !isSelf && onClickUser(u)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors",
                    isSelf ? "bg-primary/5" : "hover:bg-muted/50 cursor-pointer",
                  )}
                >
                  <OfficeAvatar name={u.user_name} size="sm" status={u.status} statusMessage={u.status_message} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {u.user_name.split(" ")[0]} {isSelf && <span className="text-muted-foreground">(você)</span>}
                    </p>
                    {roomName && (
                      <p className="text-[9px] text-muted-foreground truncate">Na {roomName}</p>
                    )}
                  </div>
                  {u.mic_enabled && (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
