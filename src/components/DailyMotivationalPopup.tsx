import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";

const MESSAGES: Record<number, { title: string; body: string }[]> = {
  0: [ // Domingo
    { title: "Descanse para conquistar! 🌟", body: "Aproveite esse momento para recarregar. As grandes vitórias vêm de quem sabe equilibrar esforço e descanso." },
    { title: "Domingo de reflexão 💭", body: "Olhe para trás e veja o quanto já evoluiu. Cada passo dado te trouxe até aqui — e o melhor ainda está por vir." },
  ],
  1: [ // Segunda
    { title: "Semana nova, energia nova! 💪", body: "Enfrente as dificuldades como aprendizado e esteja preparado para as oportunidades que virão. Essa semana é sua!" },
    { title: "Bora começar forte! 🔥", body: "Cada segunda-feira é uma nova chance de fazer diferente. Foque no que importa e os resultados vão aparecer." },
    { title: "O começo define o ritmo! 🏃", body: "A forma como você começa a semana determina como ela termina. Comece com intenção, termine com orgulho." },
  ],
  2: [ // Terça
    { title: "Consistência é o segredo! 🎯", body: "Não é sobre ser perfeito, é sobre ser consistente. Continue fazendo o seu melhor — os resultados são consequência." },
    { title: "Foco no processo! ⚡", body: "Os grandes resultados não vêm de um dia épico, mas de vários dias bons seguidos. Hoje é mais um deles." },
    { title: "Terça de evolução! 📈", body: "Você não precisa ser o melhor do mundo. Só precisa ser melhor que ontem. E isso está nas suas mãos." },
  ],
  3: [ // Quarta
    { title: "Metade da semana, força total! 🚀", body: "Você já chegou até aqui. Agora é hora de acelerar e transformar esforço em resultado concreto." },
    { title: "Meio de semana, coração inteiro! ❤️", body: "Cuide dos seus clientes como se fossem parceiros. A relação que você constrói hoje é o que sustenta o amanhã." },
    { title: "Quarta é dia de ajustar a rota! 🧭", body: "Avalie o que funcionou até agora e o que precisa mudar. Pequenos ajustes fazem grandes diferenças." },
  ],
  4: [ // Quinta
    { title: "Quase lá, não desacelere! ⭐", body: "Os melhores profissionais mantêm o ritmo quando os outros já estão cansados. Seja esse profissional." },
    { title: "Quinta é dia de colher frutos! 🌱", body: "O que você plantou nos primeiros dias da semana começa a dar resultado agora. Continue regando." },
    { title: "Excelência nos detalhes! 🔍", body: "A diferença entre bom e extraordinário está nos detalhes. Revise, ajuste, surpreenda." },
  ],
  5: [ // Sexta
    { title: "Sexta-feira de ouro! 🏆", body: "Feche a semana com chave de ouro. Resolva o que ficou pendente e entre no fim de semana com a consciência leve." },
    { title: "Última chance da semana! 💎", body: "O que você fizer hoje determina como vai se sentir no fim de semana. Dê o seu melhor e descanse com orgulho." },
    { title: "Termine como campeão! 🥇", body: "Campeões não relaxam na reta final. Faça da sexta o dia mais produtivo da semana." },
  ],
  6: [ // Sábado
    { title: "Sábado produtivo! 🌟", body: "Se está aqui, é porque tem garra. Aproveite o momento com foco e depois descanse merecidamente." },
    { title: "Dedicação faz a diferença! 💪", body: "Enquanto outros descansam, você constrói. Essa dedicação extra é o que separa os bons dos excepcionais." },
  ],
};

function getSeededIndex(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

export default function DailyMotivationalPopup() {
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date().getDay();
  const firstName = profile?.full_name?.split(" ")[0] || "Campeão";

  useEffect(() => {
    if (!profile) return;
    const key = `motivational_shown_${profile.user_id}`;
    const lastShown = localStorage.getItem(key);
    if (lastShown !== today) {
      setOpen(true);
      localStorage.setItem(key, today);
    }
  }, [profile, today]);

  const dayMessages = MESSAGES[dayOfWeek] || MESSAGES[1];
  const seed = `${today}-${profile?.user_id || "x"}`;
  const idx = getSeededIndex(seed, dayMessages.length);
  const msg = dayMessages[idx];

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center">
          <DialogTitle className="text-2xl">{msg.title}</DialogTitle>
          <DialogDescription className="text-base pt-3 leading-relaxed">
            <span className="font-semibold text-foreground">{firstName}</span>, {msg.body}
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => setOpen(false)} className="mt-4 w-full text-base py-5">
          Vamos lá 🚀
        </Button>
      </DialogContent>
    </Dialog>
  );
}
