import { api, digest, PANEL, VERSION, tokenStorage } from "./shared.js";
const $ = (id) => document.getElementById(id);
let actor = null,
  busy = false;
let tabId = Number(new URLSearchParams(location.search).get("tab")),
  captureActive = false;
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    sender.id === chrome.runtime.id &&
    !sender.tab &&
    message.target === "controller" &&
    message.action === "select_tab" &&
    !captureActive
  )
    tabId = message.tabId;
});
$("history").href = PANEL + "/reunioes";
const feedback = (text) => {
  $("feedback").textContent = text;
};
async function command(action, extra = {}) {
  const value = await chrome.runtime.sendMessage({
    target: "background",
    action,
    ...extra,
  });
  if (value?.error) throw new Error(value.error);
  return value;
}
async function attempt(work) {
  if (busy) return;
  busy = true;
  try {
    feedback("");
    await work();
  } catch (e) {
    feedback(e.message);
  } finally {
    busy = false;
  }
}
async function connect() {
  if (!$("device").value.trim())
    throw new Error(
      "Dê um nome a este computador para identificá-lo no painel.",
    );
  const existing = await chrome.storage.local.get("deviceId"),
    deviceId = existing.deviceId || crypto.randomUUID();
  await chrome.storage.local.set({ deviceId });
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const challenge = await digest(secret);
  await tokenStorage().set({ credentials: { deviceId, secret } });
  const fragment = new URLSearchParams({
    deviceId,
    challenge,
    label: $("device").value.trim(),
    version: VERSION,
  });
  await chrome.tabs.create({ url: PANEL + "/reunioes/conectar#" + fragment });
  feedback(
    `Confira o código ${challenge.slice(0, 8).toUpperCase()} no painel, autorize esta instalação e depois clique em ‘Já autorizei’.`,
  );
}
async function check() {
  const data = await api("bootstrap");
  actor = data.actor;
  $("person").textContent = actor.name;
  $("login").hidden = true;
  $("workspace").hidden = false;
  $("client").replaceChildren(
    new Option("Selecione o cliente", ""),
    ...data.clients.map((c) => new Option(c.name, c.id)),
  );
  feedback(
    "Acesso validado. Escolha o cliente e confirme o aviso aos participantes.",
  );
}
$("connect").onclick = () => attempt(connect);
$("check").onclick = () => attempt(check);
$("start").onclick = () =>
  attempt(async () => {
    if (!$("client").value || !$("title").value.trim())
      throw new Error("Selecione o cliente e informe o título.");
    if (!$("consent").checked)
      throw new Error("Confirme o aviso e a autorização dos participantes.");
    // The permission prompt must be shown in a visible extension page, never an offscreen document.
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    mic.getTracks().forEach((t) => t.stop());
    await command("start", {
      tabId,
      clientId: $("client").value,
      title: $("title").value.trim(),
      consent: true,
      requestId: crypto.randomUUID(),
    });
  });
$("pause").onclick = () => attempt(() => command("pause"));
$("stop").onclick = () => attempt(() => command("stop"));
$("recover").onclick = () => attempt(() => command("recover"));
$("discard").onclick = () =>
  attempt(async () => {
    if (
      confirm(
        "Excluir os trechos ainda não sincronizados deste computador? Eles não poderão ser recuperados. O histórico já enviado ao painel será preservado. Use somente se já finalizou o registro parcial no painel ou não precisa destes trechos.",
      )
    ) {
      await command("discard");
      feedback(
        "Pendência local removida. O histórico do painel foi preservado.",
      );
    }
  });
$("logout").onclick = () =>
  attempt(async () => {
    let confirmed = false;
    try {
      await command("stop");
      await api("logout");
      confirmed = true;
    } finally {
      await tokenStorage().remove("credentials");
      actor = null;
      $("workspace").hidden = true;
      $("login").hidden = false;
      feedback(
        confirmed
          ? "Sessão encerrada."
          : "Acesso removido deste Chrome. Sem conexão para confirmar a revogação no servidor; o Master pode bloquear o dispositivo.",
      );
    }
  });
setInterval(async () => {
  try {
    const state = await command("status"),
      current = state.current;
    if (
      current &&
      actor &&
      current.owner !== actor.userId &&
      current.status !== "processing"
    ) {
      feedback(
        "Existe um registro pendente de outro usuário. Entre com a conta original para sincronizar.",
      );
      $("capture").hidden = true;
      $("start").disabled = true;
      return;
    }
    const active = current && ["recording", "syncing"].includes(current.status);
    captureActive = !!active;
    $("capture").hidden = !active;
    $("start").disabled = !!active;
    $("client").disabled = !!active;
    $("title").disabled = !!active;
    $("consent").disabled = !!active;
    $("recover").hidden =
      !state.pending &&
      current?.status !== "syncing" &&
      current?.status !== "recording";
    $("discard").hidden =
      !current ||
      current.status === "recording" ||
      current.status === "processing";
    if (current) {
      $("capture-client").textContent = current.clientName || "";
      const seconds = Math.floor((Date.now() - current.started) / 1000);
      $("clock").textContent =
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      $("capture-title").textContent =
        current.status === "syncing"
          ? "Sincronizando"
          : current.paused
            ? "Pausado"
            : "Capturando áudio";
      $("pause").textContent = current.paused ? "Retomar" : "Pausar";
      $("pause").disabled = current.status !== "recording";
      $("stop").disabled = current.status !== "recording";
      $("microphone").textContent = state.micCaptured
        ? "Incluído"
        : "Silenciado / não verificado";
      $("level").value = state.audioLevel || 0;
      $("sync").textContent =
        `${current.uploaded || 0} trecho(s) confirmado(s) no servidor · ${state.pending} aguardando envio`;
      if (current.status === "processing")
        feedback(
          current.partial
            ? "Registro parcial sincronizado. Confira no painel se há lacunas ou trechos que precisam de atenção."
            : "Áudio sincronizado. A transcrição e os alinhamentos aparecerão no card do cliente após o processamento.",
        );
    }
    if (state.error) feedback(state.error);
  } catch {
    /* Background may be starting. Explicit commands report their own errors. */
  }
}, 1500);
if ((await tokenStorage().get("credentials")).credentials) void attempt(check);
