import { useState } from "react";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Instagram,
} from "lucide-react";
import type { SocialAsset, SocialPost } from "@/lib/social";
export function InstagramPreview({
  assets,
  format,
  caption,
  username,
}: {
  assets: SocialAsset[];
  format: SocialPost["format"];
  caption: string;
  username: string;
}) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, assets.length - 1)),
    asset = assets[index];
  const vertical = format === "story" || format === "reel";
  return (
    <div className="mx-auto max-w-[350px]">
      <div className="rounded-[2rem] border-[5px] border-slate-800 bg-white text-slate-950 overflow-hidden shadow-xl">
        {!vertical ? (
          <div className="flex items-center gap-2 p-3 text-xs">
            <span className="rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-2 text-white">
              <Instagram size={16} />
            </span>
            <strong className="flex-1 truncate">{username}</strong>
            <MoreHorizontal size={18} />
          </div>
        ) : null}
        <div
          style={{
            aspectRatio: vertical
              ? "9 / 16"
              : format === "carousel"
                ? "1"
                : asset?.width && asset?.height
                  ? String(asset.width / asset.height)
                  : "1",
          }}
          className={
            (vertical ? "aspect-[9/16]" : "aspect-square") +
            " relative bg-slate-950 flex items-center justify-center"
          }
        >
          {asset?.url ? (
            asset.type.startsWith("video/") ? (
              <video
                src={asset.url}
                className="w-full h-full object-contain"
                controls
                preload="metadata"
              />
            ) : (
              <img
                src={asset.url}
                alt={asset.name}
                className="w-full h-full object-contain"
              />
            )
          ) : (
            <p className="text-sm text-white/60 p-8 text-center">
              Adicione a arte ou o vídeo para visualizar.
            </p>
          )}
          {vertical ? (
            <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/70 to-transparent text-white pointer-events-none">
              <div className="h-0.5 bg-white/70 mb-3" />
              <p className="text-xs font-semibold">{username}</p>
            </div>
          ) : null}
          {format === "reel" ? (
            <div className="absolute bottom-0 inset-x-0 p-4 pb-14 bg-gradient-to-t from-black/80 to-transparent text-white pointer-events-none">
              <strong className="text-sm">@{username}</strong>
              <p className="text-xs line-clamp-3 mt-2 whitespace-pre-wrap">
                {caption}
              </p>
            </div>
          ) : null}
          {assets.length > 1 ? (
            <>
              <span className="absolute right-3 top-3 bg-black/70 text-white rounded-full px-2 py-1 text-xs">
                {index + 1}/{assets.length}
              </span>
              <button
                aria-label="Arquivo anterior"
                disabled={index === 0}
                onClick={() => setSelected(index - 1)}
                className="absolute left-2 top-1/2 rounded-full bg-white/80 p-1 disabled:hidden"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                aria-label="Próximo arquivo"
                disabled={index === assets.length - 1}
                onClick={() => setSelected(index + 1)}
                className="absolute right-2 top-1/2 rounded-full bg-white/80 p-1 disabled:hidden"
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}
        </div>
        {!vertical ? (
          <div className="p-3 space-y-3">
            <div className="flex gap-3">
              <Heart size={21} />
              <MessageCircle size={21} />
              <Send size={21} />
              <Bookmark className="ml-auto" size={21} />
            </div>
            <p className="text-xs whitespace-pre-wrap break-words">
              <strong>{username} </strong>
              {caption || "Sua legenda aparece aqui."}
            </p>
            {assets.length > 1 ? (
              <div className="flex justify-center gap-1">
                {assets.map((a, i) => (
                  <span
                    key={a.path}
                    className={
                      "size-1.5 rounded-full " +
                      (i === index ? "bg-sky-500" : "bg-slate-300")
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Prévia do arquivo preparado. Controles, cortes de capa e elementos do
        aplicativo podem variar no Instagram. Stories não recebem a legenda como
        texto sobreposto.
      </p>
    </div>
  );
}
