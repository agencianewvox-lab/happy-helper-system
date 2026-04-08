import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { OfficeRoom } from "@/hooks/useOfficePresence";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  rooms: OfficeRoom[];
  onRefresh: () => void;
}

export default function RoomAdminModal({ open, onClose, rooms, onRefresh }: Props) {
  const [editing, setEditing] = useState<OfficeRoom | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [icone, setIcone] = useState("🏢");
  const [cor, setCor] = useState("blue");
  const [capacidade, setCapacidade] = useState(10);
  const [vozAtiva, setVozAtiva] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setNome("");
    setDescricao("");
    setIcone("🏢");
    setCor("blue");
    setCapacidade(10);
    setVozAtiva(false);
  };

  const editRoom = (room: OfficeRoom) => {
    setEditing(room);
    setNome(room.nome);
    setDescricao(room.descricao || "");
    setIcone(room.icone || "🏢");
    setCor(room.cor || "blue");
    setCapacidade(room.capacidade_max || 10);
    setVozAtiva(room.voz_ativa_padrao || false);
  };

  const save = async () => {
    if (!nome.trim()) return;
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      icone,
      cor,
      capacidade_max: capacidade,
      voz_ativa_padrao: vozAtiva,
    };

    if (editing) {
      await supabase.from("office_rooms").update(payload).eq("id", editing.id);
      toast({ title: "Sala atualizada" });
    } else {
      await supabase.from("office_rooms").insert({ ...payload, ordem: rooms.length });
      toast({ title: "Sala criada" });
    }
    resetForm();
    onRefresh();
  };

  const deleteRoom = async (id: string) => {
    await supabase.from("office_rooms").update({ ativo: false }).eq("id", id);
    toast({ title: "Sala desativada" });
    onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>⚙ Configurar Salas</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-auto">
          {rooms.map(room => (
            <div key={room.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
              <span>{room.icone}</span>
              <span className="text-sm flex-1">{room.nome}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editRoom(room)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRoom(room.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t border-border/30 pt-3 space-y-3">
          <p className="text-xs font-medium">{editing ? `Editar: ${editing.nome}` : "Nova Sala"}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} className="text-sm h-8" />
            <Input placeholder="Ícone (emoji)" value={icone} onChange={e => setIcone(e.target.value)} className="text-sm h-8" />
            <Input placeholder="Descrição" value={descricao} onChange={e => setDescricao(e.target.value)} className="col-span-2 text-sm h-8" />
            <Input placeholder="Cor (blue, emerald...)" value={cor} onChange={e => setCor(e.target.value)} className="text-sm h-8" />
            <Input type="number" placeholder="Capacidade" value={capacidade} onChange={e => setCapacidade(Number(e.target.value))} className="text-sm h-8" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={vozAtiva} onCheckedChange={setVozAtiva} />
            <Label className="text-xs">Voz ativa por padrão</Label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} className="text-xs">
              {editing ? "Salvar" : <><Plus className="w-3 h-3 mr-1" /> Criar</>}
            </Button>
            {editing && (
              <Button size="sm" variant="ghost" onClick={resetForm} className="text-xs">Cancelar</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
