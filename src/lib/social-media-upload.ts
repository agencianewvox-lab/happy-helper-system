import { Upload } from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import type { SocialAsset, SocialPost } from "@/lib/social";
export async function prepareMedia(
  file: File,
  format: SocialPost["format"],
): Promise<{ file: File; width: number; height: number; duration?: number }> {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ].includes(file.type) ||
    file.size === 0
  )
    throw new Error("Use JPG, PNG, WebP, MP4 ou MOV.");
  if (file.size > 1024 * 1024 * 1024)
    throw new Error("O arquivo ultrapassa 1 GB.");
  if (file.type.startsWith("image/")) {
    const image = await createImageBitmap(file);
    try {
      const original = image.width / image.height;
      const ratio =
        format === "story" || format === "reel"
          ? 9 / 16
          : format === "carousel"
            ? 1
            : Math.max(0.8, Math.min(1.91, original));
      const width = 1080,
        height = Math.round(width / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("Seu navegador não conseguiu preparar esta imagem.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width / image.width, height / image.height);
      const w = image.width * scale,
        h = image.height * scale;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Falha ao preparar imagem.")),
          "image/jpeg",
          0.92,
        ),
      );
      return {
        file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
        }),
        width,
        height,
      };
    } finally {
      image.close();
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "Não foi possível ler o vídeo. Exporte MP4 com H.264 e áudio AAC.",
            ),
          ),
        15000,
      );
      v.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      v.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Vídeo incompatível. Use MP4 H.264 com áudio AAC."));
      };
    });
    if (
      !Number.isFinite(v.duration) ||
      v.duration < 3 ||
      v.duration > (format === "reel" ? 900 : 60)
    )
      throw new Error(
        "Use vídeo de 3 a " +
          (format === "reel" ? "900" : "60") +
          " segundos para este formato.",
      );
    if (v.videoWidth > 1920)
      throw new Error(
        "Exporte o vídeo com largura de até 1920 pixels (1080 recomendado).",
      );
    if (format === "story" && file.size > 100 * 1024 * 1024)
      throw new Error("Stories aceitam vídeos de até 100 MB.");
    return {
      file,
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function uploadSocialFile(
  clientId: string,
  file: File,
  format: SocialPost["format"],
  onProgress: (n: number) => void,
): Promise<SocialAsset> {
  const prepared = await prepareMedia(file, format),
    f = prepared.file;
  const path =
    clientId +
    "/" +
    crypto.randomUUID() +
    "." +
    (f.type === "image/jpeg"
      ? "jpg"
      : f.type === "video/quicktime"
        ? "mov"
        : "mp4");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre novamente para enviar os arquivos.");
  const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(
    ".",
  )[0];
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(f, {
      endpoint:
        "https://" +
        project +
        ".storage.supabase.co/storage/v1/upload/resumable",
      headers: { authorization: "Bearer " + session.access_token },
      metadata: {
        bucketName: "social-assets",
        objectName: path,
        contentType: f.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
      onError: (error) =>
        reject(
          new Error(
            "originalResponse" in error &&
              error.originalResponse?.getStatus() === 413
              ? "O limite global do Storage impediu este envio. O administrador precisa ajustar o limite de arquivos do projeto."
              : "O upload não concluiu após as tentativas de retomada. Confira a conexão e tente novamente.",
          ),
        ),
    });
    upload.start();
  });
  return {
    path,
    name: f.name,
    type: f.type,
    size: f.size,
    width: prepared.width,
    height: prepared.height,
    duration: prepared.duration,
    url: URL.createObjectURL(f),
  };
}
