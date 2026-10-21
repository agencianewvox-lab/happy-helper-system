import { api, VERSION } from "./shared.js";
import { putChunk, allChunks, countChunks, deleteChunk } from "./queue.js";
import { putCaption, allCaptions, ackCaption, deleteCaption } from "./queue.js";
let captionWrites = Promise.resolve(),
  captionFlush = null,
  captionTimer = null;
let liveCaptions = new Map(),
  captionState = "waiting",
  lastCaptionAt = 0,
  captionError = "";
async function captionsControl(control) {
  if (!current) return;
  const result = await bridge("captions_control", {
    control,
    tabId: current.tabId,
    meetingId: current.id,
    started: current.started,
  });
  if (result?.error) {
    captionError = result.error;
    if (control === "stop") current.partial = true;
  }
}
async function pendingCaptions() {
  return (await allCaptions()).filter(
    (c) => c.meetingId === current?.id && c.owner === current?.owner,
  );
}
function flushCaptions() {
  if (captionFlush) return captionFlush;
  if (!current) return Promise.resolve();
  captionFlush = (async () => {
    await captionWrites;
    const items = await pendingCaptions();
    for (let offset = 0; offset < items.length;) {
      const batch = [];
      let bytes = 0;
      while (offset < items.length && batch.length < 5) {
        const size = new TextEncoder().encode(JSON.stringify(items[offset])).length;
        if (batch.length && bytes + size > 24000) break;
        batch.push(items[offset++]); bytes += size;
      }
      await api("captions", {
        meetingId: current.id,
        items: batch.map(({ id, speaker, text, startMs, endMs, revision }) => ({
          id,
          speaker,
          text,
          startMs,
          endMs,
          revision,
        })),
      });
      for (const item of batch) await ackCaption(item);
    }
    captionError = "";
  })()
    .catch((e) => {
      captionError = "Falas aguardando sincronização: " + e.message;
      throw e;
    })
    .finally(() => {
      captionFlush = null;
    });
  return captionFlush;
}
let current = null,
  recorder = null,
  context = null,
  tabStream = null,
  micStream = null,
  micGain = null,
  mixed = null;
let heartbeat = null,
  watchdog = null,
  rotate = null,
  flushPromise = null,
  finishing = false,
  stopping = false;
let starting = false;
let writes = Promise.resolve(),
  partDone = Promise.resolve();
let micState = { muted: null, at: 0, room: null },
  lastVerified = 0,
  lastMeetVerified = 0,
  error = "",
  audioLevel = 0;
async function bridge(action, extra = {}) {
  const value = await chrome.runtime.sendMessage({
    target: "offscreen-bridge",
    action,
    ...extra,
  });
  if (value?.error) throw new Error(value.error);
  return value;
}
async function savedMeeting() {
  return (await bridge("load")).unfinished;
}
async function pending() {
  return (await allChunks()).filter(
    (c) => c.owner === current?.owner && c.meetingId === current?.id,
  );
}
async function persist() {
  await bridge("persist", { current });
}
function flush() {
  if (flushPromise) return flushPromise;
  if (!current) return Promise.resolve();
  flushPromise = (async () => {
    try {
      // Drain again after each batch: a recorder stop may enqueue while an upload is in flight.
      while (true) {
        await writes;
        const batch = (await pending()).sort((a, b) => a.seq - b.seq);
        if (!batch.length) break;
        for (const item of batch) {
          const form = new FormData();
          form.append("action", "upload_chunk");
          for (const key of ["meetingId", "seq", "durationMs", "offsetMs"])
            form.append(key, String(item[key]));
          form.append("file", item.blob, "part-" + item.seq + ".webm");
          await api("upload_chunk", {}, form);
          await deleteChunk(item.key);
          current.uploaded = Math.max(current.uploaded || 0, item.seq + 1);
          await persist();
        }
      }
      if (!recorder && !finishing && current.ended) {
        await flushCaptions();
        if ((await pendingCaptions()).length) await flushCaptions();
        await api("stop", {
          meetingId: current.id,
          expectedChunks: current.seq,
          partial: current.partial === true,
        });
        current.status = "processing";
        await persist();
      }
      error = "";
    } catch (e) {
      error = e.message;
      if ([401, 403].includes(e.status) && recorder) void stop(true);
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}
function recordPart() {
  if (!current || stopping) return;
  const chunks = [],
    start = Date.now(),
    offsetMs = Math.min(14400000, start - current.started);
  recorder = new MediaRecorder(mixed.stream, {
    mimeType: "audio/webm;codecs=opus",
    audioBitsPerSecond: 64000,
  });
  const instance = recorder;
  let resolvePart;
  partDone = new Promise((resolve) => {
    resolvePart = resolve;
  });
  instance.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  instance.onerror = () => {
    error = "Falha na captura. Os trechos já salvos serão preservados.";
    void stop(true);
  };
  instance.onstop = () => {
    clearTimeout(rotate);
    recorder = null;
    const blob = new Blob(chunks, { type: "audio/webm" });
    if (blob.size > 32 && current.seq < 240) {
      const seq = current.seq++,
        item = {
          key: current.id + ":" + seq,
          owner: current.owner,
          meetingId: current.id,
          seq,
          offsetMs,
          durationMs: Math.min(75000, Math.max(1, Date.now() - start)),
          blob,
        };
      writes = writes
        .then(() => putChunk(item))
        .then(persist)
        .catch(() => {
          error =
            "Falha ao salvar áudio local. Registro incompleto; confira o espaço do computador.";
          current.partial = true;
          void stop(true);
        });
    } else current.partial = true;
    const thisWrite = writes;
    if (!stopping && current.seq < 240) recordPart();
    thisWrite.finally(() => {
      resolvePart();
      void flush();
      if (!stopping && current.seq >= 240) void stop(true);
    });
  };
  instance.start();
  if (current.paused) instance.pause();
  rotate = setTimeout(() => {
    if (instance.state !== "inactive") instance.stop();
  }, 60000);
}
async function start(message) {
  if (recorder || finishing)
    throw new Error("Já existe um registro em andamento.");
  const saved = await savedMeeting();
  if (saved && saved.status !== "processing")
    throw new Error("Sincronize o registro pendente antes de iniciar outro.");
  if (message.consent !== true)
    throw new Error(
      "Avise os participantes e confirme a autorização antes de iniciar.",
    );
  const bootstrap = await api("bootstrap");
  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: message.streamId,
        },
      },
      video: false,
    });
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    context = new AudioContext();
    await context.resume();
    mixed = context.createMediaStreamDestination();
    const remote = context.createMediaStreamSource(tabStream);
    remote.connect(mixed);
    remote.connect(context.destination);
    micGain = context.createGain();
    micGain.gain.value = 0;
    context.createMediaStreamSource(micStream).connect(micGain).connect(mixed);
    const meter = context.createAnalyser();
    meter.fftSize = 256;
    context.createMediaStreamSource(mixed.stream).connect(meter);
    const meeting = await api("start", {
      clientId: message.clientId,
      requestId: message.requestId,
      title: message.title,
      meetCode: message.room,
      consent: true,
      version: VERSION,
    });
    current = {
      id: meeting.id,
      owner: bootstrap.actor.userId,
      clientName: meeting.client_name,
      tabId: message.tabId,
      room: message.room,
      started: Date.now(),
      seq: 0,
      uploaded: 0,
      status: "recording",
      paused: false,
      ended: false,
    };
    lastVerified = Date.now();
    lastMeetVerified = Date.now();
    error = "";
    captionError = "";
    captionState = "waiting";
    lastCaptionAt = 0;
    liveCaptions = new Map();
    captionWrites = Promise.resolve();
    stopping = false;
    writes = Promise.resolve();
    await persist();
    recordPart();
    await captionsControl("start");
    captionTimer = setInterval(
      () => void flushCaptions().catch(() => {}),
      5000,
    );
    for (const track of tabStream.getTracks())
      track.onended = () => {
        void stop(true);
      };
    heartbeat = setInterval(async () => {
      try {
        await api("heartbeat", {
          meetingId: current.id,
          paused: current.paused,
        });
        lastVerified = Date.now();
        void flush();
      } catch (e) {
        error = e.message;
        if ([401, 403, 409].includes(e.status)) void stop(true);
      }
    }, 15000);
    watchdog = setInterval(() => {
      const verified =
        micState.muted !== null &&
        Date.now() - micState.at < 1500 &&
        micState.room === current.room;
      if (verified) lastMeetVerified = Date.now();
      if (micGain)
        micGain.gain.value =
          !current.paused && verified && micState.muted === false ? 1 : 0;
      const data = new Uint8Array(meter.fftSize);
      meter.getByteTimeDomainData(data);
      audioLevel = Math.round(
        (Math.max(...data.map((v) => Math.abs(v - 128))) / 128) * 100,
      );
      if (
        Date.now() - lastVerified > 45000 ||
        Date.now() - lastMeetVerified > 15000 ||
        Date.now() - current.started >= 4 * 3600000
      ) {
        error =
          "Captura interrompida: não foi possível confirmar a sessão/controles do Meet, ou o limite de 4h foi atingido.";
        void stop(true);
      }
    }, 100);
    await bridge("badge", { text: "REC" });
    return { ok: true };
  } catch (e) {
    if (current && recorder) await stop(true);
    else release();
    throw e;
  }
}
function release() {
  clearTimeout(rotate);
  clearInterval(heartbeat);
  clearInterval(watchdog);
  clearInterval(captionTimer);
  for (const stream of [tabStream, micStream])
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
  void context?.close();
  context = null;
  micGain = null;
  tabStream = null;
  micStream = null;
  audioLevel = 0;
  void bridge("badge", { text: "" });
}
async function stop(partial = false) {
  if (!current || finishing || current.ended) return;
  finishing = true;
  stopping = true;
  await captionsControl("stop");
  await captionWrites;
  current.partial = !!current.partial || partial;
  current.ended = true;
  current.endedAt = Date.now();
  current.status = "syncing";
  clearTimeout(rotate);
  try {
    const done = partDone;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    await done;
    await writes;
  } finally {
    release();
    finishing = false;
    await persist();
  }
  await flush();
  // An older in-flight batch may have finished while the final part was being persisted.
  if (current.status !== "processing") await flush();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only the service worker may control capture. A Meet content script cannot issue commands.
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    (sender.url && sender.url !== chrome.runtime.getURL("background.js")) ||
    message.target !== "offscreen"
  )
    return;
  if (message.action === "meet_state") {
    if (message.tabId === current?.tabId) {
      micState = { muted: message.muted, at: Date.now(), room: message.room };
      if (micGain && message.muted !== false) micGain.gain.value = 0;
    }
    return;
  }
  if (["tab_closed", "navigation"].includes(message.action)) {
    if (
      message.tabId === current?.tabId &&
      (message.action === "tab_closed" || message.room !== current.room)
    )
      void stop(true);
    return;
  }
  (async () => {
    if (message.action === "captions") {
      if (
        !current ||
        current.ended ||
        current.status !== "recording" ||
        message.tabId !== current.tabId ||
        message.room !== current.room ||
        message.meetingId !== current.id
      )
        return { active: false };
      if (current.paused) return { active: true, ok: false };
      if (!Array.isArray(message.items) || message.items.length > 10)
        throw new Error("Legendas inválidas.");
      captionState =
        message.captionState === "enabled" ? "enabled" : "unavailable";
      for (const item of message.items) {
        if (
          !/^[0-9a-f-]{36}$/.test(item.id || "") ||
          typeof item.speaker !== "string" ||
          !item.speaker.trim() ||
          item.speaker.length > 160 ||
          typeof item.text !== "string" ||
          !item.text.trim() ||
          item.text.length > 4000 ||
          ![item.startMs, item.endMs, item.revision].every(Number.isInteger) ||
          item.startMs < 0 ||
          item.endMs < item.startMs ||
          item.endMs >
            Math.min(14400000, Date.now() - current.started + 10000) ||
          item.revision < 1 ||
          item.revision > 100000
        )
          continue;
        const previous = liveCaptions.get(item.id);
        if (previous && previous.revision >= item.revision) continue;
        const saved = {
          ...item,
          key: current.id + ":" + item.id,
          meetingId: current.id,
          owner: current.owner,
        };
        captionWrites = captionWrites
          .catch(() => {})
          .then(() => putCaption(saved))
          .then(() => {
            liveCaptions.set(item.id, item);
            while (liveCaptions.size > 200)
              liveCaptions.delete(liveCaptions.keys().next().value);
          });
        lastCaptionAt = Date.now();
      }
      await captionWrites;
      return { ok: true, active: true };
    }
    if (message.action === "enable_captions") {
      await captionsControl("enable");
      return { ok: true };
    }
    if (message.action === "start") {
      if (starting) throw new Error("O registro já está iniciando. Aguarde.");
      starting = true;
      try { return await start(message); } finally { starting = false; }
    }
    if (message.action === "stop") {
      await stop();
      return { ok: true };
    }
    if (message.action === "pause") {
      if (!recorder) throw new Error("Não há captura ativa.");
      // Flush the current visible cue before changing the capture gate.
      if (!current.paused) await captionsControl("pause");
      current.paused = !current.paused;
      if (current.paused) {
        recorder.pause();
        if (micGain) micGain.gain.value = 0;
      } else {
        recorder.resume();
        await captionsControl("resume");
      }
      await persist();
      await api("heartbeat", { meetingId: current.id, paused: current.paused });
      return { ok: true };
    }
    if (message.action === "recover") {
      const auth = await api("bootstrap"),
        saved = await savedMeeting();
      if (!saved) return { ok: true };
      if (saved.owner !== auth.actor.userId)
        throw new Error(
          "Os trechos pendentes pertencem a outro usuário. Entre com a conta original.",
        );
      if (!recorder) {
        current = {
          ...saved,
          ended: true,
          partial: saved.ended ? saved.partial : true,
          status: "syncing",
        };
        const local = await pending();
        current.seq = Math.max(current.seq, ...local.map((c) => c.seq + 1));
        await persist();
        await flush();
      }
      return { ok: true };
    }
    if (message.action === "discard") {
      if (recorder || finishing || flushPromise || captionFlush)
        throw new Error(
          "Encerre a captura e aguarde os envios antes de descartar.",
        );
      const auth = await api("bootstrap"),
        saved = current || (await savedMeeting());
      if (saved && saved.owner !== auth.actor.userId)
        throw new Error("Entre com a conta que criou o registro.");
      current = saved;
      if (current) {
        for (const item of await pending()) await deleteChunk(item.key);
        for (const item of await pendingCaptions())
          await deleteCaption(item.key);
      }
      current = null;
      error = "";
      await persist();
      return { ok: true };
    }
    if (message.action === "status")
      return {
        current: current || (await savedMeeting()),
        error,
        audioLevel,
        micCaptured: !!micGain && micGain.gain.value > 0,
        pending: await countChunks(),
        captions: [...liveCaptions.values()],
        captionState,
        lastCaptionAt,
        captionError,
      };
    throw new Error("Ação inválida.");
  })().then(respond, (e) => respond({ error: e.message }));
  return true;
});
