import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import OfficeAvatar from "./OfficeAvatar";

interface DirectMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_user_name: string;
  content: string;
  read: boolean | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  currentUserId: string;
  currentUserName: string;
}

export default function DirectMessageDialog({ open, onClose, targetUserId, targetUserName, currentUserId, currentUserName }: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fetchDMs = async () => {
      const { data } = await supabase
        .from("office_direct_messages")
        .select("*")
        .or(`and(from_user_id.eq.${currentUserId},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${currentUserId})`)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as DirectMessage[]);

      // Mark as read
      await supabase
        .from("office_direct_messages")
        .update({ read: true })
        .eq("from_user_id", targetUserId)
        .eq("to_user_id", currentUserId)
        .eq("read", false);
    };
    fetchDMs();

    const channel = supabase
      .channel(`dm-${[currentUserId, targetUserId].sort().join("-")}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "office_direct_messages",
      }, (payload) => {
        const msg = payload.new as DirectMessage;
        if (
          (msg.from_user_id === currentUserId && msg.to_user_id === targetUserId) ||
          (msg.from_user_id === targetUserId && msg.to_user_id === currentUserId)
        ) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, currentUserId, targetUserId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    await supabase.from("office_direct_messages").insert({
      from_user_id: currentUserId,
      to_user_id: targetUserId,
      from_user_name: currentUserName,
      content: text.trim(),
    });
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <OfficeAvatar name={targetUserName} size="sm" showStatus={false} />
            Mensagem para {targetUserName.split(" ")[0]}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-64" ref={scrollRef}>
          <div className="space-y-2 p-2">
            {messages.map(msg => {
              const isSelf = msg.from_user_id === currentUserId;
              return (
                <div key={msg.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] rounded-lg px-3 py-1.5 text-sm",
                    isSelf ? "bg-primary/20" : "bg-muted/40",
                  )}>
                    <p>{msg.content}</p>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(msg.created_at), "HH:mm")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite..."
            className="text-sm h-9"
          />
          <Button type="submit" size="sm" className="h-9 w-9 p-0" disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
