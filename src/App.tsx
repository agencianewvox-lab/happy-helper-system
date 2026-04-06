import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Performance from "./pages/Performance";
import Chat from "./pages/Chat";
import Pendencias from "./pages/Pendencias";
import Tarefas from "./pages/Tarefas";
import NpsPreditivo from "./pages/NpsPreditivo";
import NpsReal from "./pages/NpsReal";
import Agenda from "./pages/Agenda";
import PesquisaNps from "./pages/PesquisaNps";
import PainelAdmin from "./pages/PainelAdmin";
import Configuracoes from "./pages/Configuracoes";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import DailyMotivationalPopup from "./components/DailyMotivationalPopup";

const queryClient = new QueryClient();

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
          <Route path="/admin" element={<ProtectedRoute><PainelAdmin /></ProtectedRoute>} />
          <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
          <Route path="/pesquisa-nps/:groupId/:surveyType?" element={<PesquisaNps />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
