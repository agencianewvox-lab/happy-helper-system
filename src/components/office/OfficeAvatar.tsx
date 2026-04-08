import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor } from "@/lib/avatarUtils";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  status?: string;
  micEnabled?: boolean;
  showStatus?: boolean;
  statusMessage?: string | null;
  onClick?: () => void;
  className?: string;
}

const sizes = {
  sm: "w-6 h-6 text-[9px]",
  md: "w-10 h-10 text-sm",
  lg: "w-20 h-20 text-xl",
  xl: "w-[120px] h-[120px] text-3xl",
};

const statusColors: Record<string, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  busy: "bg-red-500",
  offline: "bg-muted-foreground/50",
};

const statusRings: Record<string, string> = {
  online: "ring-emerald-500/40",
  away: "ring-amber-500/40",
  busy: "ring-red-500/40",
  offline: "",
};

export default function OfficeAvatar({ name, size = "md", status = "online", micEnabled, showStatus = true, statusMessage, onClick, className }: Props) {
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  const isLarge = size === "lg" || size === "xl";

  const avatar = (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full font-bold text-white select-none transition-all",
        sizes[size],
        status === "offline" && "opacity-40",
        status !== "offline" && statusRings[status] && `ring-2 ${statusRings[status]}`,
        onClick && "cursor-pointer hover:scale-105",
        className,
      )}
      style={{ backgroundColor: color }}
      onClick={onClick}
    >
      {initials}

      {/* Status dot */}
      {showStatus && size !== "sm" && (
        <div className={cn(
          "absolute rounded-full border-2 border-card",
          statusColors[status] || statusColors.online,
          size === "md" ? "w-2.5 h-2.5 -bottom-0.5 -right-0.5" :
          size === "lg" ? "w-4 h-4 bottom-0 right-0" :
          "w-5 h-5 bottom-1 right-1",
        )} />
      )}

      {/* Mic indicator */}
      {micEnabled !== undefined && isLarge && (
        <div className={cn(
          "absolute rounded-full flex items-center justify-center border-2 border-card",
          micEnabled ? "bg-emerald-500" : "bg-muted",
          size === "lg" ? "w-5 h-5 bottom-0 left-0" : "w-6 h-6 bottom-1 left-1",
        )}>
          {micEnabled ? <Mic className="w-3 h-3 text-white" /> : <MicOff className="w-3 h-3 text-muted-foreground" />}
        </div>
      )}
    </div>
  );

  if (statusMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{avatar}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{statusMessage}</TooltipContent>
      </Tooltip>
    );
  }

  return avatar;
}
