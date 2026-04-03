import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/pages/Chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  loading,
}: ChatSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30">
      <SidebarContent className="pt-2">
        {!collapsed ? (
          <div className="px-3 pb-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm"
              onClick={onNewChat}
            >
              <Plus className="w-4 h-4" />
              Novo Chat
            </Button>
          </div>
        ) : (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="icon" onClick={onNewChat}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.length === 0 && !collapsed && (
                  <p className="text-xs text-muted-foreground px-3 py-1">Nenhuma conversa</p>
                )}
                {conversations.map((convo) => (
                  <SidebarMenuItem key={convo.id}>
                    <SidebarMenuButton
                      onClick={() => onSelect(convo.id)}
                      className={cn(
                        "group/item",
                        activeId === convo.id && "bg-muted text-primary font-medium"
                      )}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      {!collapsed && (
                        <span className="truncate flex-1 text-xs">{convo.title}</span>
                      )}
                      {!collapsed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(convo.id);
                          }}
                          className="opacity-0 group-hover/item:opacity-100 text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
