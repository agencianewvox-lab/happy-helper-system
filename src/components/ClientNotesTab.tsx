import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Trash2, StickyNote } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

interface Note {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
}

interface Props {
  groupId: string;
}

export function ClientNotesTab({ groupId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { profile, isAdmin } = useProfile();

  const fetchNotes = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from("client_notes")
      .select("id, content, author_name, created_at")
      .eq("group_id", groupId)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (!error && data) setNotes(data);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSave = async () => {
    if (!newNote.trim() || !profile?.full_name) return;
    setSaving(true);
    const { error } = await supabase.from("client_notes").insert({
      group_id: groupId,
      content: newNote.trim(),
      author_name: profile.full_name,
    } as any);
    if (!error) {
      setNewNote("");
      fetchNotes();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("client_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-2">
        <Textarea
          placeholder="Escreva uma nota sobre o que foi feito, sugestões de melhoria..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[80px] text-sm"
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !newNote.trim()}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Adicionar Nota
        </Button>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhuma nota nos últimos 30 dias.
        </div>
      ) : (
        <ScrollArea className="max-h-[350px]">
          <div className="space-y-3 pr-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{note.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(note.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })} às {new Date(note.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {(isAdmin || profile?.full_name === note.author_name) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
