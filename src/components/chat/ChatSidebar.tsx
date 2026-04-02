import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/pages/Chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  teamMembers: string[];
  onSelect: (id: string) => void;
  onNewChat: (folder: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}

export function ChatSidebar({
  conversations,
  activeId,
  teamMembers,
  onSelect,
  onNewChat,
  onDelete,
  loading,
}: ChatSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // Group conversations by folder
  const grouped = teamMembers.reduce<Record<string, Conversation[]>>((acc, member) => {
    acc[member] = conversations.filter((c) => c.folder === member);
    return acc;
  }, {});

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30">
      <SidebarContent className="pt-2">
        {/* New chat button */}
        {!collapsed && (
          <div className="px-3 pb-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm"
              onClick={() => onNewChat(teamMembers[0])}
            >
              <Plus className="w-4 h-4" />
              Novo Chat
            </Button>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="icon" onClick={() => onNewChat(teamMembers[0])}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          teamMembers.map((member) => {
            const memberConvos = grouped[member] || [];
            if (collapsed && memberConvos.length === 0) return null;

            return (
              <SidebarGroup key={member} defaultOpen={memberConvos.some((c) => c.id === activeId)}>
                <SidebarGroupLabel className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    {!collapsed && member}
                  </span>
                  {!collapsed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewChat(member);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {memberConvos.length === 0 && !collapsed && (
                      <p className="text-xs text-muted-foreground px-3 py-1">Nenhuma conversa</p>
                    )}
                    {memberConvos.map((convo) => (
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
            );
          })
        )}
      </SidebarContent>
    </Sidebar>
  );
}
