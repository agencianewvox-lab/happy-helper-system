import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileVideo,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatLabels,
  localInput,
  socialApi,
  statusLabels,
  utcInput,
  type SocialAsset,
  type SocialClient,
  type SocialPost,
  type SocialStatus,
} from "@/lib/social";
type Details = {
  assets: SocialAsset[];
  comments: {
    id: string;
    body: string;
    created_at: string;
    author_id: string;
  }[];
  history: {
    id: string;
    version: number;
    status: SocialStatus;
    created_at: string;
  }[];
};
type Props = {
  initial: SocialPost | null;
  client: SocialClient;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};
export function SocialEditor({
  initial,
  client,
  userId,
  onClose,
  onSaved,
}: Props) {
  const [post, setPost] = useState(initial),
    [title, setTitle] = useState(initial?.title || ""),
    [format, setFormat] = useState<SocialPost["format"]>(
      initial?.format || "image",
    ),
    [briefing, setBriefing] = useState(initial?.briefing || ""),
    [caption, setCaption] = useState(initial?.caption || ""),
    [date, setDate] = useState(localInput(initial?.scheduled_at || null)),
    [assets, setAssets] = useState<SocialAsset[]>(initial?.assets || []),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [comment, setComment] = useState(""),
    [publication, setPublication] = useState("");
  const qc = useQueryClient();
  const details = useQuery({
    queryKey: ["social-details", userId, post?.id, post?.version],
    enabled: !!post,
    queryFn: () =>
      socialApi<Details>({
        action: "details",
        clientId: client.id,
        postId: post!.id,
      }),
    refetchOnMount: true,
  });
  const locked =
    post?.status === "published_manual" || post?.status === "cancelled";
  function close() {
    if (busy) return;
    if (
      dirty &&
      !window.confirm("Há alterações não salvas. Deseja sair sem salvar?")
    )
      return;
    onClose();
  }
  async function perform(action: string, status?: SocialStatus) {
    setBusy(true);
    try {
      const result = await socialApi<{ post: SocialPost }>({
        action,
        clientId: client.id,
        postId: post?.id,
        version: post?.version,
        status,
        publicationUrl: publication,
        content: {
          title,
          format,
          briefing,
          caption,
          scheduled_at: utcInput(date),
          assets,
        },
      });
      setPost(result.post);
      setDirty(false);
      onSaved();
      toast.success(
        action === "save"
          ? "Conteúdo salvo."
          : status === "published_manual"
            ? "Publicação manual registrada."
            : "Etapa atualizada.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      if (assets.length + files.length > 20)
        throw new Error("Máximo de 20 arquivos por conteúdo.");
      const uploaded: SocialAsset[] = [];
      for (const file of Array.from(files)) {
        if (
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "video/mp4",
            "video/quicktime",
          ].includes(file.type) ||
          file.size > 50 * 1024 * 1024 ||
          file.size === 0
        )
          throw new Error(
            "Use imagens JPG/PNG/WebP ou vídeos MP4/MOV de até 50 MB.",
          );
        const extension = (
          {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "video/mp4": "mp4",
            "video/quicktime": "mov",
          } as Record<string, string>
        )[file.type];
        const path = client.id + "/" + crypto.randomUUID() + "." + extension;
        const { error } = await supabase.storage
          .from("social-assets")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error)
          throw new Error(
            "Falha no upload. Confira sua permissão e tente novamente.",
          );
        const asset = {
          path,
          name: file.name,
          type: file.type,
          size: file.size,
        };
        uploaded.push(asset);
        // Preserve successful uploads even if a later file fails.
        setAssets((current) => [...current, asset]);
        setDirty(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }
  async function addComment() {
    if (!post || !comment.trim()) return;
    setBusy(true);
    try {
      await socialApi({
        action: "comment",
        clientId: client.id,
        postId: post.id,
        text: comment,
      });
      setComment("");
      await qc.invalidateQueries({
        queryKey: ["social-details", userId, post.id],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no comentário.");
    } finally {
      setBusy(false);
    }
  }
  const status = post?.status || "draft";
  const next: Partial<Record<SocialStatus, SocialStatus[]>> = {
    draft: ["production", "review"],
    production: ["review"],
    review: client.can_approve ? ["changes", "approved"] : [],
    changes: ["production", "review"],
    approved: client.can_approve ? ["review", "published_manual"] : ["review"],
    cancelled: ["draft"],
  };
  const cover = assets[0];
  const coverUrl =
    cover?.url || details.data?.assets.find((a) => a.path === cover?.path)?.url;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-6xl max-h-[94dvh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 border-b">
          <p className="text-[10px] tracking-[.22em] uppercase text-primary">
            Newvox / Estúdio editorial
          </p>
          <DialogTitle className="text-2xl">
            {post ? "Ficha do conteúdo" : "Um novo conteúdo começa aqui"}
          </DialogTitle>
          <DialogDescription>
            {client.nome} · {statusLabels[status]}
            {post ? " · Versão " + post.version : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="p-6 space-y-5">
            <fieldset disabled={busy || locked} className="space-y-5">
              <label className="block space-y-2 text-sm font-medium">
                Título interno
                <Input
                  value={title}
                  maxLength={160}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Ex.: O sorriso que transforma sua rotina"
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="space-y-2 text-sm font-medium">
                  Formato
                  <select
                    className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value as SocialPost["format"]);
                      setDirty(true);
                    }}
                  >
                    {Object.entries(formatLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Data planejada · Brasília
                  <Input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Planejamento editorial. Esta data ainda não dispara uma
                publicação automática.
              </p>
              <label className="block space-y-2 text-sm font-medium">
                Objetivo e briefing
                <Textarea
                  rows={3}
                  maxLength={10000}
                  value={briefing}
                  onChange={(e) => {
                    setBriefing(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Objetivo, público, ideia da arte e orientações de produção…"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Legenda
                <Textarea
                  rows={6}
                  maxLength={2200}
                  value={caption}
                  onChange={(e) => {
                    setCaption(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Escreva a legenda, chamada para ação e hashtags…"
                />
                <span className="block text-right text-xs text-muted-foreground">
                  {caption.length}/2.200
                </span>
              </label>
              <div className="rounded-xl border border-dashed p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Artes e vídeos · {assets.length}/20
                  </span>
                  <ImagePlus className="h-4 w-4 text-primary" />
                </div>
                <label className="text-xs text-muted-foreground block">
                  Enviar arquivos prontos · até 50 MB cada
                  <input
                    className="block mt-3 w-full text-xs"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                    onChange={(e) => {
                      void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {assets.map((a, i) => (
                  <div
                    className="flex items-center gap-2 text-xs rounded-lg bg-muted/50 p-2"
                    key={a.path}
                  >
                    <span className="text-muted-foreground w-5">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{a.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={i === 0}
                      aria-label={"Mover " + a.name + " para cima"}
                      onClick={() => {
                        setAssets((current) => {
                          const v = [...current];
                          [v[i - 1], v[i]] = [v[i], v[i - 1]];
                          return v;
                        });
                        setDirty(true);
                      }}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={i === assets.length - 1}
                      aria-label={"Mover " + a.name + " para baixo"}
                      onClick={() => {
                        setAssets((current) => {
                          const v = [...current];
                          [v[i + 1], v[i]] = [v[i], v[i + 1]];
                          return v;
                        });
                        setDirty(true);
                      }}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={"Remover " + a.name + " desta ficha"}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remover este arquivo da ficha? As versões anteriores serão preservadas.",
                          )
                        ) {
                          setAssets((current) =>
                            current.filter((x) => x.path !== a.path),
                          );
                          setDirty(true);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </fieldset>
            {!locked && (
              <Button
                className="w-full"
                disabled={busy || !title.trim()}
                onClick={() => void perform("save")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Salvar conteúdo
                {post?.status === "approved" && dirty
                  ? " e solicitar nova revisão"
                  : ""}
              </Button>
            )}
            {post && (
              <section className="border-t pt-4 space-y-3">
                <h3 className="font-semibold text-sm">Fluxo de aprovação</h3>
                {dirty ? (
                  <p className="text-xs text-amber-500">
                    Salve suas alterações antes de mudar a etapa. Alterações em
                    conteúdo aprovado exigem nova aprovação.
                  </p>
                ) : null}
                {status === "approved" && client.can_approve ? (
                  <label className="block text-xs space-y-2">
                    Já publicou pelo aplicativo? Informe o link para registrar.
                    <Input
                      value={publication}
                      onChange={(e) => setPublication(e.target.value)}
                      placeholder="https://www.instagram.com/p/…"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(next[status] || []).map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      disabled={
                        busy ||
                        dirty ||
                        (s === "published_manual" && !publication)
                      }
                      onClick={() => {
                        if (
                          s === "published_manual" &&
                          !window.confirm(
                            "Confirmar que esta versão já foi publicada manualmente no perfil correto?",
                          )
                        )
                          return;
                        void perform("transition", s);
                      }}
                    >
                      {s === "published_manual"
                        ? "Confirmar publicação manual"
                        : statusLabels[s]}
                    </Button>
                  ))}
                  {!["published_manual", "cancelled"].includes(status) ? (
                    <Button
                      variant="ghost"
                      disabled={busy || dirty}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Tem certeza que deseja cancelar este conteúdo? O histórico será preservado.",
                          )
                        )
                          void perform("transition", "cancelled");
                      }}
                    >
                      Cancelar conteúdo
                    </Button>
                  ) : null}
                </div>
                {post.publication_url ? (
                  <a
                    className="inline-flex text-sm text-primary gap-2"
                    href={post.publication_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir publicação
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </section>
            )}
          </div>
          <aside className="border-t lg:border-t-0 lg:border-l bg-muted/20 p-6 space-y-6">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-3">
                Prévia de composição
              </p>
              <div className="rounded-2xl border bg-card overflow-hidden max-w-sm mx-auto">
                <div className="p-4 text-sm font-semibold truncate">
                  {client.nome}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    Perfil ainda não conectado · {formatLabels[format]}
                  </span>
                </div>
                <div
                  className={
                    (format === "story" || format === "reel"
                      ? "aspect-[9/16] max-h-80"
                      : "aspect-square") +
                    " bg-gradient-to-br from-sky-500/10 via-muted to-indigo-500/10 grid place-items-center overflow-hidden"
                  }
                >
                  {coverUrl ? (
                    cover.type.startsWith("video") ? (
                      <video
                        className="w-full h-full object-contain"
                        src={coverUrl}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <img
                        className="w-full h-full object-contain"
                        src={coverUrl}
                        alt={cover.name}
                      />
                    )
                  ) : (
                    <div className="text-center p-6 text-muted-foreground">
                      <FileVideo className="h-8 w-8 mx-auto mb-3" />
                      <p className="text-xs">
                        {assets.length
                          ? "Salve para visualizar os arquivos enviados."
                          : "Sua arte ou vídeo aparece aqui."}
                      </p>
                    </div>
                  )}
                </div>
                <p className="p-4 text-sm whitespace-pre-wrap break-words">
                  {caption || "A legenda acompanha o conteúdo aqui."}
                </p>
                {assets.length > 1 ? (
                  <p className="px-4 pb-4 text-xs text-muted-foreground">
                    {assets.length} arquivos · ordem definida na ficha
                  </p>
                ) : null}
              </div>
              <p className="text-[11px] mt-3 text-muted-foreground">
                Prévia ilustrativa. A aparência final depende do Instagram.
              </p>
            </div>
            {post ? (
              <>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Revisão da equipe</h3>
                  {details.isError ? (
                    <p role="alert" className="text-xs text-destructive">
                      Não foi possível carregar os comentários.
                    </p>
                  ) : null}
                  {details.data?.comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sem comentários. Centralize as alterações aqui.
                    </p>
                  ) : null}
                  {details.data?.comments.map((c) => (
                    <div key={c.id} className="rounded-xl border bg-card p-3">
                      <p className="text-xs whitespace-pre-wrap break-words">
                        {c.body}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {c.author_id === userId ? "Você" : "Equipe"} ·{" "}
                        {new Date(c.created_at).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </p>
                    </div>
                  ))}
                  <label className="block text-xs space-y-2">
                    Comentário
                    <Textarea
                      rows={2}
                      maxLength={4000}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Descreva o ajuste ou alinhamento…"
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !comment.trim()}
                    onClick={() => void addComment()}
                  >
                    <Send className="h-3 w-3 mr-2" />
                    Adicionar comentário
                  </Button>
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    Histórico de versões
                  </h3>
                  {details.data?.history.map((h) => (
                    <div
                      key={h.id}
                      className="flex justify-between gap-2 text-xs py-2 border-b"
                    >
                      <span>
                        v{h.version} · {statusLabels[h.status]}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </span>
                    </div>
                  ))}
                </section>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Salve a primeira versão para iniciar revisão e histórico.
              </p>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
