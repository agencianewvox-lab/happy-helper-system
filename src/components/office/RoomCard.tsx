import { cn } from "@/lib/utils";
import { OfficeRoom, OfficeUser } from "@/hooks/useOfficePresence";
import OfficeAvatar from "./OfficeAvatar";

interface Props {
  room: OfficeRoom;
  users: OfficeUser[];
  isActive: boolean;
  onClick: () => void;
}

const corMap: Record<string, string> = {
  blue: "border-blue-500/30 hover:border-blue-500/50",
  purple: "border-purple-500/30 hover:border-purple-500/50",
  emerald: "border-emerald-500/30 hover:border-emerald-500/50",
  pink: "border-pink-500/30 hover:border-pink-500/50",
  amber: "border-amber-500/30 hover:border-amber-500/50",
  red: "border-red-500/30 hover:border-red-500/50",
};

const corActiveBg: Record<string, string> = {
  blue: "bg-blue-500/5",
  purple: "bg-purple-500/5",
  emerald: "bg-emerald-500/5",
  pink: "bg-pink-500/5",
  amber: "bg-amber-500/5",
  red: "bg-red-500/5",
};

export default function RoomCard({ room, users, isActive, onClick }: Props) {
  const count = users.length;
  const max = room.capacidade_max || 10;
  const cor = room.cor || "blue";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all",
        "bg-card/60 hover:bg-card/80",
        corMap[cor] || corMap.blue,
        isActive && "border-primary ring-1 ring-primary/30",
        isActive && (corActiveBg[cor] || corActiveBg.blue),
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">{room.icone || "🏢"}</span>
        <span className="text-sm font-medium flex-1 truncate">{room.nome}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{count}/{max}</span>
      </div>

      {room.descricao && (
        <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">{room.descricao}</p>
      )}

      {count > 0 && (
        <div className="flex items-center -space-x-1.5">
          {users.slice(0, 4).map(u => (
            <OfficeAvatar key={u.id} name={u.user_name} size="sm" showStatus={false} />
          ))}
          {count > 4 && (
            <span className="ml-2 text-[10px] text-muted-foreground">+{count - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}
