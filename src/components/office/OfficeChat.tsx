import { useState, useRef, useEffect } from "react";
import { OfficeMessage } from "@/hooks/useOfficeMessages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor } from "@/lib/avatarUtils";
import { format } from "date-fns";

interface Props {
  messages: OfficeMessage[];
  onSend: (content: string) => void;
  currentUserId?: string;
  loading?: boolean;
}

export default function OfficeChat({ messages, onSend, currentUserId, loading }: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-3" ref={scrollRef}>
        <div className="space-y-2 py-3">
          {messages.map(msg => {
            if (msg.tipo === "system") {
              return (
                <div key={msg.id} className="text-center">
                  <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const isSelf = msg.user_id === currentUserId;
            const color = msg.user_avatar_color || getAvatarColor(msg.user_name);

            return (
              <div key={msg.id} className={cn("flex gap-2 items-start", isSelf && "flex-row-reverse")}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {getInitials(msg.user_name)}
                </div>
                <div className={cn("max-w-[75%]", isSelf && "text-right")}>
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    {!isSelf && <span className="text-[11px] font-medium">{msg.user_name.split(" ")[0]}</span>}
                    <span className="text-[9px] text-muted-foreground">
                      {format(new Date(msg.created_at), "HH:mm")}
                    </span>
                  </div>
                  <div className={cn(
                    "rounded-lg px-3 py-1.5 text-sm inline-block",
                    isSelf ? "bg-primary/20 text-foreground" : "bg-muted/40 text-foreground",
                  )}>
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border/30">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="bg-background/50 border-border/30 focus:border-primary text-sm h-9"
          />
          <Button type="submit" size="sm" className="h-9 w-9 p-0 shrink-0" disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
