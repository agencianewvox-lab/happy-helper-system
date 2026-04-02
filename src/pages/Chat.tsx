import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Conversation = {
  id: string;
  folder: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const TEAM_MEMBERS = [
  "Jader",
  "Murillo",
  "Priscilla",
  "Alisson",
  "Joel",
  "Thais",
  "Daniella",
  "Victor Botto",
];

export default function Chat() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) setConversations(data);
    setLoading(false);
  };

  const createConversation = async (folder: string) => {
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ folder, title: "Nova conversa" })
      .select()
      .single();
    if (!error && data) {
      setConversations((prev) => [data, ...prev]);
      setActiveConversationId(data.id);
    }
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("ai_chat_messages").delete().eq("conversation_id", id);
    await supabase.from("ai_conversations").delete().eq("id", id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) setActiveConversationId(null);
  };

  const updateConversationTitle = async (id: string, title: string) => {
    await supabase.from("ai_conversations").update({ title }).eq("id", id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          teamMembers={TEAM_MEMBERS}
          onSelect={setActiveConversationId}
          onNewChat={createConversation}
          onDelete={deleteConversation}
          loading={loading}
        />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border/30 px-3 gap-2">
            <SidebarTrigger />
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || "Chat"
                : "Selecione ou crie uma conversa"}
            </span>
          </header>
          <ChatArea
            conversationId={activeConversationId}
            onTitleUpdate={(title) => {
              if (activeConversationId) updateConversationTitle(activeConversationId, title);
            }}
          />
        </div>
      </div>
    </SidebarProvider>
  );
}
