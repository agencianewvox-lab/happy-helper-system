import { api, digest, PANEL, VERSION, tokenStorage } from "./shared.js";
import { microphonePermissionState } from "./media-permissions.js";
const $ = (id) => document.getElementById(id);
let actor = null,
  busy = false,
  state = {},
  captureActive = false,
  preparing = false;
let tabId = (await chrome.storage.session.get("selectedMeetTab"))
  .selectedMeetTab;
let transcriptKey = "",
  serverDetail = null,
  lastDetailAt = 0,
  detailLoading = false,
  polling = false;
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
function feedback(text, kind = "info") {
  $("feedback").textContent = text;
  $("feedback").hidden = !text;
  $("feedback").dataset.kind = kind;
}
async function command(action, extra = {}) {
  const value = await chrome.runtime.sendMessage({
    target: "background",
    action,
    ...extra,
  });
  if (value?.error) throw new Error(value.error);
  return value;
}
async function attempt(work, button, label) {
  if (busy) return;
  busy = true;
  const previous = button?.textContent;
  if (button) {
    button.textContent = label || "Aguarde…";
    button.disabled = true;
  }
  render();
  try {
    feedback("");
    await work();
  } catch (e) {
    feedback(e.message, "error");
  } finally {
    busy = false;
    if (button) {
      button.textContent = previous;
      button.disabled = false;
    }
    await poll();
  }
}
async function connect() {
  if (!$("device").value.trim())
    throw new Error("Dê um nome a este computador.");
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
    "Confira o código " +
      challenge.slice(0, 8).toUpperCase() +
      " no Painel, autorize e volte aqui para verificar o acesso.",
  );
}
async function check() {
  const data = await api("bootstrap");
  actor = data.actor;
  $("person").textContent = actor.name;
  $("login").hidden = true;
  $("workspace").hidden = false;
  const selected = $("client").value;
  $("client").replaceChildren(
    new Option("Selecione o cliente", ""),
    ...data.clients.map((c) => new Option(c.name, c.id)),
  );
  $("client").value = selected;
  feedback(
    "Acesso confirmado. Abra o Meet e clique no ícone da Newvox nessa aba.",
    "success",
  );
}
$("connect").onclick = () =>
  attempt(connect, $("connect"), "Abrindo autenticação…");
$("check").onclick = () => attempt(check, $("check"), "Validando acesso…");
$("configure-microphone").onclick = () => attempt(async () => {
  await command("microphone_setup");
  feedback("Autorize o microfone na janela de configuração. Depois volte aqui e clique em Iniciar reunião. A gravação ainda não começou.");
}, $("configure-microphone"), "Abrindo configuração…");
$("start").onclick = () =>
  attempt(
    async () => {
      if (!$("client").value || !$("title").value.trim())
        throw new Error("Selecione o cliente e informe o título.");
      if (!$("consent").checked)
        throw new Error("Confirme o aviso e a autorização dos participantes.");
      // Re-read selection in case this side panel was reopened after another window's action click.
      tabId =
        (await chrome.storage.session.get("selectedMeetTab")).selectedMeetTab ||
        tabId;
      if (!tabId)
        throw new Error(
          "Clique no ícone da extensão na aba do Meet antes de iniciar.",
        );
      if (await microphonePermissionState() !== "granted") {
        await command("microphone_setup");
        feedback("Primeiro autorize o microfone da Newvox na janela aberta. Depois volte e clique novamente em Iniciar reunião. Permitir apenas no Meet não é suficiente.");
        return;
      }
      await command("start", {
        tabId,
        clientId: $("client").value,
        title: $("title").value.trim(),
        consent: true,
        requestId: crypto.randomUUID(),
      });
      preparing = false;
      serverDetail = null;
      lastDetailAt = 0;
      feedback(
        "Registro iniciado. Áudio ativo; acompanhe as falas abaixo.",
        "success",
      );
    },
    $("start"),
    "Iniciando · autorizando áudio…",
  );
$("pause").onclick = () =>
  attempt(
    async () => {
      await command("pause");
      feedback(
        state.current?.paused
          ? "Registro retomado."
          : "Pausado. Áudio e novas falas não serão registrados até você retomar.",
        "success",
      );
    },
    $("pause"),
    "Atualizando…",
  );
$("stop").onclick = () => {
  if (!busy) $("stop-confirm").showModal();
};
$("cancel-stop").onclick = () => $("stop-confirm").close();
$("confirm-stop").onclick = () => {
  $("stop-confirm").close();
  void attempt(
    async () => {
      await command("stop");
      feedback(
        "Captura encerrada. Confira o status de sincronização abaixo.",
        "success",
      );
    },
    $("stop"),
    "Salvando últimos trechos…",
  );
};
$("recover").onclick = () =>
  attempt(
    async () => {
      await command("recover");
      feedback("Sincronização verificada. Confira o status do registro.");
    },
    $("recover"),
    "Sincronizando…",
  );
$("enable-captions").onclick = () =>
  attempt(
    async () => {
      await command("enable_captions");
      feedback(
        "Se o Meet solicitar, escolha Português (Brasil) nas legendas. Se não ativar, use o botão CC no Meet.",
      );
    },
    $("enable-captions"),
    "Ativando…",
  );
$("new-meeting").onclick = () => {
  preparing = true;
  $("consent").checked = false;
  feedback("");
  render();
};
$("discard").onclick = () =>
  attempt(async () => {
    if (
      confirm(
        "Descartar os trechos não sincronizados deste computador? Não poderão ser recuperados. O histórico já enviado ao Painel será preservado.",
      )
    ) {
      await command("discard");
      feedback(
        "Pendência local removida; histórico do Painel preservado.",
        "success",
      );
    }
  }, $("discard"));
$("logout").onclick = () =>
  attempt(async () => {
    if (captureActive)
      throw new Error("Finalize e sincronize a reunião antes de sair.");
    let confirmed = false;
    try {
      await api("logout");
      confirmed = true;
    } finally {
      await tokenStorage().remove("credentials");
      actor = null;
      serverDetail = null;
      $("workspace").hidden = true;
      $("login").hidden = false;
      feedback(
        confirmed
          ? "Sessão encerrada."
          : "Acesso removido deste Chrome. Não foi possível confirmar a revogação no servidor; o Master pode bloquear o dispositivo.",
      );
    }
  }, $("logout"));
const elapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    String(Math.floor(s / 60)).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
};
function renderTranscript() {
  const current = state.current;
  const local = state.captions || [];
  const source =
    serverDetail?.id === current?.id
      ? serverDetail.utterances?.map((c) => ({ ...c, startMs: c.start_ms })) ||
        []
      : local;
  const query = $("search").value.trim().toLocaleLowerCase("pt-BR");
  const items = source.filter((c) =>
    (c.speaker + " " + c.text).toLocaleLowerCase("pt-BR").includes(query),
  );
  const key = JSON.stringify([
    query,
    current?.id,
    items.map((c) => [c.id, c.revision]),
  ]);
  if (key === transcriptKey) return;
  transcriptKey = key;
  const nodes = items.map((c) => {
    const section = document.createElement("article"),
      meta = document.createElement("div"),
      name = document.createElement("span"),
      time = document.createElement("time"),
      text = document.createElement("p");
    section.className = "utterance";
    meta.className = "utterance-meta";
    name.className = "speaker";
    name.textContent = c.speaker;
    text.textContent = c.text;
    time.textContent =
      elapsed(c.startMs) +
      " · " +
      new Date((current?.started || Date.now()) + c.startMs).toLocaleTimeString(
        "pt-BR",
        { hour: "2-digit", minute: "2-digit", second: "2-digit" },
      );
    meta.append(name, time);
    section.append(meta, text);
    return section;
  });
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = query
      ? "Nenhuma fala encontrada."
      : "Aguardando as legendas do Meet. Ative CC e fale com clareza; o áudio de apoio continua sendo registrado.";
    nodes.push(empty);
  }
  const scroll = $("transcript").scrollTop;
  $("transcript").replaceChildren(...nodes);
  $("transcript").scrollTop =
    $("follow").checked && !query ? $("transcript").scrollHeight : scroll;
}
$("search").oninput = renderTranscript;
function render() {
  const c = state.current;
  const own = actor && (!c || c.owner === actor.userId);
  if (!own) {
    for (const name of ["capture", "live", "completion", "controls"])
      $(name).hidden = true;
    $("start").disabled = busy || !!c;
    if (actor && c)
      feedback(
        "Há um registro local de outro usuário. Entre com a conta original para sincronizar.",
        "error",
      );
    return;
  }
  const recording = c?.status === "recording",
    syncing = c?.status === "syncing",
    done = c?.status === "processing";
  captureActive = !!(recording || syncing);
  $("start").disabled = busy || captureActive;
  $("configure-microphone").disabled = busy || captureActive;
  $("client").disabled =
    $("title").disabled =
    $("consent").disabled =
      busy || captureActive;
  $("logout").disabled = busy || captureActive;
  $("setup").hidden = captureActive || (done && !preparing);
  $("capture").hidden = !captureActive;
  $("controls").hidden = !captureActive;
  $("completion").hidden = !done || preparing;
  $("live").hidden = !c || preparing;
  $("recover").hidden = !c || done || recording;
  $("recover").disabled = busy;
  $("discard").hidden = !c || recording || done;
  $("discard").disabled = busy || syncing;
  $("enable-captions").hidden =
    !recording || c.paused || state.captionState === "enabled";
  $("status-pill").textContent = busy
    ? "Aguarde…"
    : syncing
      ? "Salvando"
      : recording
        ? c.paused
          ? "Pausado"
          : "Ao vivo"
        : done
          ? "Salvo"
          : "Pronto";
  $("status-pill").className =
    "pill" + (recording ? (c.paused ? " paused" : " recording") : "");
  if (!c) return;
  $("history").href = PANEL + "/reunioes?meeting=" + encodeURIComponent(c.id);
  $("capture-client").textContent = c.clientName || "";
  $("clock").textContent = elapsed((c.endedAt || Date.now()) - c.started);
  $("capture-title").textContent = syncing
    ? "Salvando no Painel…"
    : c.paused
      ? "Registro pausado"
      : "Gravando a reunião";
  $("record-dot").style.animationPlayState =
    c.paused || syncing ? "paused" : "running";
  if (!busy) $("pause").textContent = c.paused ? "▶ Retomar" : "Ⅱ Pausar";
  $("pause").disabled = $("stop").disabled = busy || !recording;
  $("microphone").textContent = state.micCaptured
    ? "Incluído no registro"
    : "Mudo / não verificado";
  $("level").value = state.audioLevel || 0;
  $("sync").textContent =
    (c.uploaded || 0) +
    " trechos de áudio salvos · " +
    (state.pending || 0) +
    " pendentes";
  const ready = serverDetail?.id === c.id && serverDetail.status === "ready";
  const failed =
    serverDetail?.id === c.id &&
    ["failed", "interrupted"].includes(serverDetail.status);
  $("completion-title").textContent = ready
    ? "Transcrição concluída"
    : failed
      ? "Registro salvo · atenção"
      : "Áudio e falas sincronizados";
  $("completion-message").textContent = ready
    ? "O histórico e os alinhamentos estão disponíveis no card do cliente. Revise antes de criar tarefas."
    : failed
      ? "O servidor precisa de atenção para concluir. Abra a reunião no Painel para ver as opções de recuperação."
      : "A captura terminou. O servidor está transcrevendo o áudio de apoio e organizando os alinhamentos. Você já pode seguir com seu trabalho.";
  $("caption-status").textContent = c.paused
    ? "Pausado · nenhuma nova fala é coletada."
    : done
      ? "Falas identificadas salvas. Áudio de apoio e histórico completo no Painel."
      : state.captionError ||
        (state.captionState !== "enabled"
          ? "Ative CC no Meet para acompanhar nomes e falas."
          : state.lastCaptionAt && Date.now() - state.lastCaptionAt < 20000
            ? "Recebendo falas · salvamento automático."
            : "Legendas ativas. Aguardando fala reconhecida; se estiver falando sem texto, confira o idioma/layout do Meet.");
  if (state.error && !busy) feedback(state.error, "error");
  renderTranscript();
}
async function poll() {
  if (polling) return;
  polling = true;
  try {
    state = (await command("status")) || {};
    if (!captureActive && !busy) {
      const permission = await microphonePermissionState();
      $("microphone-permission").textContent = permission === "granted" ? "Microfone autorizado para a Newvox." : permission === "denied" ? "Microfone bloqueado para a extensão. Abra a configuração para liberar." : "Autorize o microfone da extensão antes de iniciar.";
    }
    const c = state.current;
    if (
      actor &&
      c?.owner === actor.userId &&
      c?.status === "processing" &&
      Date.now() - lastDetailAt > 10000 &&
      !detailLoading
    ) {
      detailLoading = true;
      lastDetailAt = Date.now();
      void api("live_detail", { meetingId: c.id })
        .then((data) => {
          serverDetail = data;
          render();
        })
        .catch(() => {})
        .finally(() => {
          detailLoading = false;
        });
    }
    render();
  } catch {
    /* Explicit commands report actionable errors. */
  } finally {
    polling = false;
  }
}
setInterval(poll, 1000);
if ((await tokenStorage().get("credentials")).credentials)
  void attempt(check, $("check"), "Validando acesso…");
else void poll();
