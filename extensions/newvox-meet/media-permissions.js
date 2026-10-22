// Microphone permission belongs to the extension origin, not to meet.google.com.
export async function microphonePermissionState(
  permissions = navigator.permissions,
) {
  try {
    return (await permissions.query({ name: "microphone" })).state;
  } catch {
    return "unknown";
  }
}

export function mediaCaptureError(error, source = "microphone") {
  const name = error?.name || "",
    message = String(error?.message || error || "");
  if (source === "tab")
    return "Não foi possível capturar o áudio desta aba. Volte à reunião, clique no ícone da Newvox na barra do Chrome e tente iniciar novamente. Nenhum registro foi iniciado.";
  if (
    /NotAllowed|PermissionDenied|SecurityError/.test(name) ||
    /permission|denied|dismissed/i.test(message)
  )
    return "O Chrome não concluiu a autorização do microfone da extensão. Permitir no Meet não libera a Newvox. Clique em Configurar microfone e autorize na janela que abrir. Se estiver bloqueado, revise a permissão no Chrome e no Windows. Nenhuma reunião foi iniciada.";
  if (/NotFound|DevicesNotFound/.test(name))
    return "Nenhum microfone disponível. Conecte um microfone e tente novamente em Configurar microfone.";
  if (/NotReadable|TrackStart|Abort/.test(name))
    return "O Chrome não conseguiu abrir o microfone. Confira o dispositivo selecionado, o acesso do Chrome no Windows e se outro programa está usando o dispositivo exclusivamente.";
  return "Não foi possível verificar o microfone. Abra Configurar microfone e tente novamente. Nenhuma reunião foi iniciada.";
}

// Test only: no recorder, upload, credentials or meeting is created on this page.
export async function testMicrophone(mediaDevices = navigator.mediaDevices) {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  try {
    if (!stream.getAudioTracks().some((track) => track.readyState === "live"))
      throw new Error("Microfone indisponível");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
