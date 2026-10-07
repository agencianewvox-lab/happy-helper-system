import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import Login from "./pages/Login";

import DailyMotivationalPopup from "./components/DailyMotivationalPopup";
import { WorkspaceLoading } from "./components/WorkspaceLoading";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const Anuncios = lazy(() => import("./pages/Anuncios"));
const Chat = lazy(() => import("./pages/Chat"));
const Pendencias = lazy(() => import("./pages/Pendencias"));
const Tarefas = lazy(() => import("./pages/Tarefas"));
const NpsPreditivo = lazy(() => import("./pages/NpsPreditivo"));
const NpsReal = lazy(() => import("./pages/NpsReal"));
const Agenda = lazy(() => import("./pages/Agenda"));
const PesquisaNps = lazy(() => import("./pages/PesquisaNps"));
const OnboardingClinica = lazy(() => import("./pages/OnboardingClinica"));
const PainelAdmin = lazy(() => import("./pages/PainelAdmin"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const MinhaConta = lazy(() => import("./pages/MinhaConta"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Jarvis = lazy(() => import("./pages/Jarvis"));
const WhatsappCentral = lazy(() => import("./pages/WhatsappCentral"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes  
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <WorkspaceLoading />;
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>
    <DailyMotivationalPopup />
    {children}
  </>;
}

function AppRoutes() {
  const { pathname } = useLocation();
  const { recoveryPending } = useAuth();
  if (recoveryPending && pathname !== "/redefinir-senha") {
    return <Navigate to="/redefinir-senha" replace />;
  }
  const customerForm = /^\/(onboardingnv|pesquisa-nps)(\/|$)/.test(pathname);
  return <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="newvox-workspace-theme" forcedTheme={customerForm ? 'light' : undefined} disableTransitionOnChange>
    <Toaster />
    <Sonner />
    <Suspense fallback={<div role="status" className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando seu workspace…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
        <Route path="/anuncios" element={<ProtectedRoute><Anuncios /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/pendencias" element={<ProtectedRoute><Pendencias /></ProtectedRoute>} />
        <Route path="/tarefas" element={<ProtectedRoute><Tarefas /></ProtectedRoute>} />
        <Route path="/nps" element={<ProtectedRoute><NpsPreditivo /></ProtectedRoute>} />
        <Route path="/nps-real" element={<ProtectedRoute><NpsReal /></ProtectedRoute>} />
        <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
        <Route path="/master/whatsapp" element={<ProtectedRoute><WhatsappCentral /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><PainelAdmin /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
        <Route path="/configuracoes/minha-conta" element={<ProtectedRoute><MinhaConta /></ProtectedRoute>} />
        <Route path="/jarvis" element={<ProtectedRoute><Jarvis /></ProtectedRoute>} />
        <Route path="/pesquisa-nps/:groupId/:surveyType?" element={<PesquisaNps />} />
        <Route path="/onboardingnv/:groupId/:surveyType?" element={<OnboardingClinica />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </ThemeProvider>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
