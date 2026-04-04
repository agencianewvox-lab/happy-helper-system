import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CheckCircle2, Frown, Meh, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PesquisaNps() {
  const { groupId } = useParams<{ groupId: string }>();
  const [groupName, setGroupName] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from("whatsapp_grupos")
      .select("nome")
      .eq("group_id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setGroupName(data.nome);
      });
  }, [groupId]);

  const handleSubmit = async () => {
    if (score === null) {
      setError("Por favor, selecione uma nota.");
      return;
    }
    if (!name.trim()) {
      setError("Por favor, informe seu nome.");
      return;
    }
    setLoading(true);
    setError("");

    const { error: insertError } = await supabase.from("nps_surveys" as any).insert({
      group_id: groupId,
      score,
      comment: comment.trim() || null,
      respondent_name: name.trim(),
      respondent_email: email.trim() || null,
    } as any);

    if (insertError) {
      setError("Erro ao enviar resposta. Tente novamente.");
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-card/80 backdrop-blur border border-border/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Obrigado!</h1>
          <p className="text-muted-foreground">
            Sua avaliação foi registrada com sucesso. Agradecemos pelo seu feedback!
          </p>
        </div>
      </div>
    );
  }

  const getScoreColor = (s: number) => {
    if (s <= 6) return "bg-red-500 text-white";
    if (s <= 8) return "bg-amber-500 text-white";
    return "bg-emerald-500 text-white";
  };

  const getScoreEmoji = () => {
    if (score === null) return null;
    if (score <= 6) return <Frown className="w-12 h-12 text-red-500" />;
    if (score <= 8) return <Meh className="w-12 h-12 text-amber-500" />;
    return <Smile className="w-12 h-12 text-emerald-500" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="bg-card/80 backdrop-blur border border-border/30 rounded-2xl p-8 max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Pesquisa de Satisfação</h1>
          {groupName && (
            <p className="text-muted-foreground text-sm">{groupName}</p>
          )}
          <p className="text-muted-foreground">
            Em uma escala de 0 a 10, o quanto você recomendaria nossos serviços?
          </p>
        </div>

        {/* Score selector */}
        <div className="space-y-3">
          <div className="flex justify-center gap-1.5 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => { setScore(i); setError(""); }}
                className={cn(
                  "w-10 h-10 rounded-lg font-bold text-sm transition-all duration-200 border-2",
                  score === i
                    ? cn(getScoreColor(i), "border-transparent scale-110 shadow-lg")
                    : "bg-muted/50 text-muted-foreground border-border/30 hover:border-primary/50 hover:scale-105"
                )}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>Nada provável</span>
            <span>Extremamente provável</span>
          </div>
          {score !== null && (
            <div className="flex justify-center pt-1">
              {getScoreEmoji()}
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite seu nome"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail (opcional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment">Comentário (opcional)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiência..."
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-12 text-base font-semibold"
          size="lg"
        >
          {loading ? "Enviando..." : "Enviar Avaliação"}
        </Button>

        <p className="text-[10px] text-muted-foreground text-center">
          Sua resposta é confidencial e nos ajuda a melhorar nossos serviços.
        </p>
      </div>
    </div>
  );
}
