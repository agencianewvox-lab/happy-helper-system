import { BarChart3, Megaphone, ListTodo, CalendarDays, Heart, LogOut, AlertCircle, ClipboardCheck, Shield, Settings, Home, Smartphone, Instagram } from "lucide-react";
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
import newvoxLogo from "@/assets/newvox-logo.jpg";
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { ThemePreference } from "@/components/ThemePreference";
import { useProfile } from "@/hooks/useProfile";

interface DashboardSidebarProps {
  isAdmin: boolean;
  isMaster?: boolean;
  onSignOut: () => void;
}

const navItems = [
  { title: "Início", url: "/", icon: Home, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Performance", url: "/performance", icon: BarChart3, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Anúncios", url: "/anuncios", icon: Megaphone, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Relatórios", url: "/relatorios", icon: ClipboardCheck, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Social Media", url: "/social", icon: Instagram, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "Tarefas", url: "/tarefas", icon: ListTodo, adminOnly: false, masterOnly: false, badgeKey: "tarefas" as const },
  { title: "Agenda", url: "/agenda", icon: CalendarDays, adminOnly: false, masterOnly: false, badgeKey: "agenda" as const },
  { title: "Pendências", url: "/pendencias", icon: AlertCircle, adminOnly: false, masterOnly: false, badgeKey: "pendencias" as const },
  
  { title: "Saúde da carteira", url: "/nps", icon: Heart, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "NPS Real", url: "/nps-real", icon: ClipboardCheck, adminOnly: false, masterOnly: false, badgeKey: null },
  { title: "WhatsApp central", url: "/master/whatsapp", icon: Smartphone, adminOnly: false, masterOnly: true, badgeKey: null },
  { title: "Acesso Master", url: "/admin", icon: Shield, adminOnly: false, masterOnly: true, badgeKey: null },
  { title: "Equipe e acessos", url: "/configuracoes?aba=equipe", icon: Shield, adminOnly: false, masterOnly: true, badgeKey: null },
  { title: "Configurações", url: "/configuracoes", icon: Settings, adminOnly: false, masterOnly: true, badgeKey: null },
  { title: "Minha conta", url: "/configuracoes/minha-conta", icon: Settings, adminOnly: false, masterOnly: false, badgeKey: null },
];

export function DashboardSidebar({ isAdmin, isMaster = false, onSignOut }: DashboardSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const badges = useSidebarBadges();
  const { profile } = useProfile();

  const filteredItems = navItems.filter(item => {
    if (profile?.role === "social_media" && !["/social", "/configuracoes/minha-conta"].includes(item.url)) return false;
    if (item.masterOnly && !isMaster) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="workspace-sidebar border-r border-border/70">
      <SidebarContent className="pt-5 px-2">
        <div className="flex items-center gap-3 px-3 pb-5"><img src={newvoxLogo} alt="New Vox" className="h-9 w-9 rounded-xl" />{!collapsed && <div><p className="font-semibold tracking-tight">new vox</p><p className="text-[9px] tracking-[.2em] text-muted-foreground">WORKSPACE</p></div>}</div>
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
            Operação & relacionamento
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
                      isActive={isActive}
                      className={cn(
                        "transition-colors cursor-pointer relative",
                        isActive && (item.title === "JARVIS" 
                          ? "bg-cyan-500/10 text-cyan-500 font-medium" 
                          : "bg-primary/10 text-primary font-medium")
                      )}
                    >
                      <div className="relative">
                        <item.icon className={cn(
                          "h-5 w-5", 
                          isActive 
                            ? (item.title === "JARVIS" ? "text-cyan-500" : "text-primary") 
                            : "text-muted-foreground"
                        )} />
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
            <div className={cn("mb-4 flex flex-col gap-2 border-t border-border/70 pt-4", collapsed ? "items-center" : "px-2")}>
              {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Aparência</span>}
              <ThemePreference toggleOnly={collapsed} />
            </div>
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
