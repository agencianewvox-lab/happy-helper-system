import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIAS = ["Clientes / Operação", "Clínicas", "Internos / Gestão"];
const GESTORES = ["Murilo Araújo", "Netto Monge", "Jader Costa"];

export function AddClientDialog() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    group_id: "",
    categoria: "",
    gestor_responsavel: "",
  });

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome do grupo é obrigatório");
      return;
    }
    
    setSaving(true);
    
    // If no Group ID is provided, create a placeholder based on the name
    const finalGroupId = form.group_id.trim() || 
      `placeholder-${form.nome.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    const { error } = await supabase.from("whatsapp_grupos").insert({
      nome: form.nome.trim(),
      group_id: finalGroupId,
      categoria: form.categoria || null,
      gestor_responsavel: form.gestor_responsavel || null,
    } as any);
    
    setSaving(false);
    
    if (error) {
      toast.error("Erro ao adicionar cliente: " + error.message);
    } else {
      toast.success(form.group_id.trim() 
        ? "Cliente adicionado com sucesso!" 
        : "Cliente adicionado! O ID será vinculado automaticamente na primeira mensagem.");
      setForm({ nome: "", group_id: "", categoria: "", gestor_responsavel: "" });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Nome do Grupo *</Label>
            <Input
              placeholder="Ex: MKT NV - Nome do Cliente"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <Label>Group ID (WhatsApp) *</Label>
            <Input
              placeholder="Ex: 120363012345678@g.us"
              value={form.group_id}
              onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Gestor Responsável</Label>
            <Select value={form.gestor_responsavel} onValueChange={(v) => setForm({ ...form, gestor_responsavel: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar gestor" />
              </SelectTrigger>
              <SelectContent>
                {GESTORES.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Adicionar Cliente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
