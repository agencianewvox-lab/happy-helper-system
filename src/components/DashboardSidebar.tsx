import { BarChart3, Brain, ListTodo, CalendarDays, Heart, Bot, LogOut, AlertCircle, ClipboardCheck, Shield } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";

interface DashboardSidebarProps {
  isAdmin: boolean;
  isMaster?: boolean;
  onSignOut: () => void;
}

const navItems = [
  { title: "Performance", url: "/performance", icon: BarChart3, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Chat IA", url: "/chat", icon: Brain, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Tarefas", url: "/tarefas", icon: ListTodo, adminOnly: false, masterOnly: false, badgeKey: "tarefas" as const },
  { title: "Agenda", url: "/agenda", icon: CalendarDays, adminOnly: false, masterOnly: false, badgeKey: "agenda" as const },
  { title: "Pendências", url: "/pendencias", icon: AlertCircle, adminOnly: false, masterOnly: false, badgeKey: "pendencias" as const },
  { title: "NPS Preditivo", url: "/nps", icon: Heart, adminOnly: true, masterOnly: false, badgeKey: null },
  { title: "NPS Real", url: "/nps-real", icon: ClipboardCheck, adminOnly: true, masterOnly: false, badgeKey: null },
  { title: "Painel Admin", url: "/admin", icon: Shield, adminOnly: false, masterOnly: true, badgeKey: null },
];

export function DashboardSidebar({ isAdmin, isMaster = false, onSignOut }: DashboardSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const badges = useSidebarBadges();

  const filteredItems = navItems.filter(item => {
    if (item.masterOnly && !isMaster) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      <SidebarContent className="pt-4">
        {/* Master badge */}
        {isMaster && !collapsed && (
          <div className="px-4 pb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30">
              <Shield className="w-3 h-3" />
              Master
            </span>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className={cn(collapsed && "sr-only")}>
            Navegação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const isActive = location.pathname === item.url;
                const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.url)}
                      tooltip={item.title}
                      className={cn(
                        "transition-colors cursor-pointer relative",
                        isActive && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <div className="relative">
                        <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                        {badgeCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5 animate-pulse">
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </div>
                      {!collapsed && (
                        <span className="flex items-center gap-2">
                          {item.title}
                          {badgeCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Logout at bottom */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onSignOut}
                  tooltip="Sair"
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <LogOut className="h-5 w-5" />
                  {!collapsed && <span>Sair</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
