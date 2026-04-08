import { OfficeUser } from "@/hooks/useOfficePresence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  users: OfficeUser[];
  currentUserId?: string;
  onClickUser: (u: OfficeUser) => void;
}

export default function OnlineUsersList({ users, currentUserId, onClickUser }: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Online ({users.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {users.length === 0 && (
          <p className="text-xs text-muted-foreground">Ninguém online ainda</p>
        )}
        {users.map(u => {
          const isSelf = u.user_id === currentUserId;
          return (
            <button
              key={u.id}
              onClick={() => !isSelf && onClickUser(u)}
              className={cn(
                "w-full flex items-center gap-2 p-1.5 rounded-md text-left transition-colors",
                isSelf ? "bg-primary/5" : "hover:bg-muted cursor-pointer"
              )}
            >
              <div className="relative">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: u.avatar_color }}
                >
                  {u.user_name.charAt(0)}
                </div>
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                  u.status === "online" && "bg-emerald-500",
                  u.status === "ocupado" && "bg-red-500",
                  u.status === "em_chamada" && "bg-amber-500",
                  u.status === "ausente" && "bg-muted-foreground",
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {u.user_name} {isSelf && <span className="text-muted-foreground">(você)</span>}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">{u.status.replace("_", " ")}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
