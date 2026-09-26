import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

import Login from "./pages/Login";

import DailyMotivationalPopup from "./components/DailyMotivationalPopup";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>
    <DailyMotivationalPopup />
    {children}
  </>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando seu workspace…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/pendencias" element={<ProtectedRoute><Pendencias /></ProtectedRoute>} />
          <Route path="/tarefas" element={<ProtectedRoute><Tarefas /></ProtectedRoute>} />
          <Route path="/nps" element={<ProtectedRoute><NpsPreditivo /></ProtectedRoute>} />
          <Route path="/nps-real" element={<ProtectedRoute><NpsReal /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
          
          <Route path="/master/whatsapp" element={<ProtectedRoute><WhatsappCentral /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><PainelAdmin /></ProtectedRoute>} />
          <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
          <Route path="/jarvis" element={<ProtectedRoute><Jarvis /></ProtectedRoute>} />
          <Route path="/pesquisa-nps/:groupId/:surveyType?" element={<PesquisaNps />} />
          <Route path="/onboardingnv/:groupId/:surveyType?" element={<OnboardingClinica />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
