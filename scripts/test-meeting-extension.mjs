import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  microphoneState,
  parseMeetUrl,
} from "../extensions/newvox-meet/shared.js";
const source = (
  await readFile(
    new URL("../extensions/newvox-meet/offscreen.js", import.meta.url),
    "utf8",
  )
).replace(/^import .*;\r?\n/gm, "");
const turn = () => new Promise((resolve) => setImmediate(resolve));
const meetStateSource = await readFile(
  new URL("../extensions/newvox-meet/meet-state.js", import.meta.url),
  "utf8",
);
test("Meet DOM signal requires an active call, never just the lobby microphone", () => {
  for (const [labels, expected] of [
    [["Desativar microfone"], null],
    [["Sair da chamada", "Desativar microfone"], false],
    [["Leave call", "Turn on microphone"], true],
    [["Você saiu da reunião"], null],
  ]) {
    let message;
    vm.runInNewContext(meetStateSource, {
      document: {
        documentElement: {},
        querySelectorAll: () =>
          labels.map((label) => ({
            getClientRects: () => [{}],
            getAttribute: () => label,
          })),
      },
      MutationObserver: class {
        observe() {}
      },
      setInterval() {},
      setTimeout() {},
      clearTimeout() {},
      chrome: {
        runtime: {
          sendMessage(value) {
            message = value;
            return Promise.resolve();
          },
        },
      },
    });
    assert.equal(message.muted, expected);
  }
});
function harness({ delayWrite = false } = {}) {
  const id = "fake-extension",
    owner = "user-1",
    mid = "meeting-1",
    calls = [],
    queue = new Map(),
    timers = [],
    recorders = [],
    gains = [];
  let listener, saved, releaseWrite;
  const captions = new Map();
  const writeGate = delayWrite
    ? new Promise((resolve) => {
        releaseWrite = resolve;
      })
    : Promise.resolve();
  class Recorder {
    constructor() {
      this.state = "inactive";
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    pause() {
      assert.equal(this.state, "recording");
      this.state = "paused";
    }
    resume() {
      assert.equal(this.state, "paused");
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob([new Uint8Array(64)]) });
        this.onstop();
      });
    }
  }
  const stream = () => ({ getTracks: () => [{ stop() {}, onended: null }] });
  class Audio {
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createMediaStreamDestination() {
      return { stream: stream() };
    }
    createMediaStreamSource() {
      return {
        connect(node) {
          return node;
        },
      };
    }
    createGain() {
      const value = {
        gain: { value: 0 },
        connect(node) {
          return node;
        },
      };
      gains.push(value);
      return value;
    }
    createAnalyser() {
      return {
        fftSize: 256,
        getByteTimeDomainData(data) {
          data.fill(128);
        },
      };
    }
  }
  const api = async (action, payload, form) => {
    calls.push({ action, payload, form });
    if (action === "bootstrap") return { actor: { userId: owner } };
    if (action === "start") {
      assert.equal(payload.requestId, "request-1");
      return { id: mid, client_name: "Cliente de teste" };
    }
    return { ok: true };
  };
  const chrome = {
    runtime: {
      id,
      getURL: (path) => "chrome-extension://" + id + "/" + path,
      onMessage: {
        addListener(fn) {
          listener = fn;
        },
      },
      async sendMessage(m) {
        assert.equal(m.target, "offscreen-bridge");
        if (m.action === "load") return { unfinished: saved };
        if (m.action === "persist") {
          saved = structuredClone(m.current);
          return { ok: true };
        }
        if (m.action === "badge") return { ok: true };
        if (m.action === "captions_control") return { ok: true };
        throw new Error("Unexpected bridge");
      },
    },
  };
  vm.runInNewContext(source, {
    api,
    VERSION: "1.0.0",
    putChunk: async (item) => {
      await writeGate;
      queue.set(item.key, item);
    },
    allChunks: async () => [...queue.values()],
    countChunks: async () => queue.size,
    deleteChunk: async (key) => queue.delete(key),
    putCaption: async (item) => captions.set(item.key, item),
    allCaptions: async () => [...captions.values()],
    ackCaption: async (item) => {
      if (captions.get(item.key)?.revision === item.revision)
        captions.delete(item.key);
    },
    deleteCaption: async (key) => captions.delete(key),
    chrome,
    MediaRecorder: Recorder,
    AudioContext: Audio,
    navigator: { mediaDevices: { getUserMedia: async () => stream() } },
    Blob,
    FormData,
    Date,
    Math,
    Promise,
    Uint8Array,
    TextEncoder,
    Error,
    setTimeout: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => {
      if (t) t.cleared = true;
    },
    setInterval: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearInterval: (t) => {
      if (t) t.cleared = true;
    },
  });
  function send(action, extra = {}) {
    return new Promise((resolve, reject) => {
      const result = listener(
        { target: "offscreen", action, ...extra },
        { id, url: chrome.runtime.getURL("background.js") },
        (v) => (v?.error ? reject(new Error(v.error)) : resolve(v)),
      );
      if (result !== true) resolve(undefined);
    });
  }
  return {
    send,
    calls,
    queue,
    timers,
    recorders,
    gains,
    releaseWrite,
    get saved() {
      return saved;
    },
    contentCommand() {
      return listener(
        { target: "offscreen", action: "start" },
        { id, tab: { id: 1 }, url: "https://meet.google.com/abc-defg-hij" },
        () => {
          throw new Error("Content script was accepted");
        },
      );
    },
    start: () =>
      send("start", {
        clientId: "client-1",
        title: "Reunião",
        requestId: "request-1",
        room: "abc-defg-hij",
        tabId: 1,
        streamId: "tab",
        consent: true,
      }),
  };
}
test("Meet URL and mute parser fail closed", () => {
  assert.equal(
    parseMeetUrl("https://meet.google.com/abc-defg-hij?authuser=1"),
    "abc-defg-hij",
  );
  assert.equal(parseMeetUrl("https://meet.google.com.evil/abc-defg-hij"), null);
  assert.equal(microphoneState(["Desativar microfone (Ctrl+D)"]), false);
  assert.equal(microphoneState(["Ativar microfone"]), true);
  assert.equal(microphoneState(["Turn off microphone"]), false);
  assert.equal(microphoneState(["unknown"]), null);
  assert.equal(
    microphoneState(["Ativar microfone", "Desativar microfone"]),
    null,
  );
});
test("content scripts cannot start capture", () => {
  const h = harness();
  assert.equal(h.contentCommand(), undefined);
  assert.equal(h.calls.length, 0);
});
test("stop waits for durable final chunk before server finalization", async () => {
  const h = harness({ delayWrite: true });
  await h.start();
  const stop = h.send("stop");
  await turn();
  assert.equal(
    h.calls.some((c) => c.action === "stop"),
    false,
  );
  h.releaseWrite();
  await stop;
  assert.deepEqual(
    h.calls
      .filter((c) => ["upload_chunk", "stop"].includes(c.action))
      .map((c) => c.action),
    ["upload_chunk", "stop"],
  );
  assert.equal(h.saved.status, "processing");
  assert.equal(h.saved.seq, 1);
  assert.equal(h.queue.size, 0);
});
test("pause survives rotation and resumed microphone respects Meet mute", async () => {
  const h = harness();
  await h.start();
  await h.send("pause");
  assert.equal(h.recorders.at(-1).state, "paused");
  h.timers.find((t) => t.ms === 60000 && !t.cleared).fn();
  await turn();
  assert.equal(h.recorders.at(-1).state, "paused");
  await h.send("pause");
  await h.send("meet_state", { tabId: 1, room: "abc-defg-hij", muted: false });
  h.timers.find((t) => t.ms === 100 && !t.cleared).fn();
  assert.equal(h.gains[0].gain.value, 1);
  await h.send("meet_state", { tabId: 1, room: "abc-defg-hij", muted: true });
  assert.equal(h.gains[0].gain.value, 0);
  await h.send("stop");
  assert.equal(h.saved.seq, 2);
  assert.equal(h.calls.filter((c) => c.action === "upload_chunk").length, 2);
});
test("closing the Meet stops and marks the record partial", async () => {
  const h = harness();
  await h.start();
  await h.send("tab_closed", { tabId: 1 });
  for (let i = 0; i < 5; i++) await turn();
  assert.equal(h.saved.status, "processing");
  assert.equal(h.saved.partial, true);
});
test("consent and one active recording are enforced locally", async () => {
  const h = harness();
  await assert.rejects(h.send("start", { consent: false }), /Avise/);
  await h.start();
  await assert.rejects(h.start(), /andamento/);
  await h.send("stop");
});
test("captions are accepted only for the active tab and synced before stop", async () => {
  const h = harness(); await h.start();
  const cue = {id:"00000000-0000-4000-8000-000000000001",speaker:"Ana",text:"Alinhamento",startMs:0,endMs:10,revision:1};
  const payload = {tabId:1,room:"abc-defg-hij",meetingId:"meeting-1",items:[cue],captionState:"enabled"};
  assert.equal((await h.send("captions",{...payload,tabId:2})).active,false);
  await h.send("captions",payload);
  assert.equal((await h.send("status")).captions.length,1);
  await h.send("pause");
  await h.send("captions",{...payload,items:[{...cue,id:"00000000-0000-4000-8000-000000000002",text:"Pausa privada"}]});
  assert.equal((await h.send("status")).captions.length,1);
  await h.send("pause"); await h.send("stop");
  const captionIndex=h.calls.findIndex(c=>c.action==="captions");
  assert.ok(captionIndex>=0 && captionIndex<h.calls.findIndex(c=>c.action==="stop"));
  assert.equal(JSON.stringify(h.calls).includes("Pausa privada"),false);
});
test("versioned side panel replaces popup windows", async () => {
  const manifest=JSON.parse(await readFile(new URL("../extensions/newvox-meet/manifest.json",import.meta.url),"utf8"));
  const background=await readFile(new URL("../extensions/newvox-meet/background.js",import.meta.url),"utf8");
  assert.equal(manifest.side_panel.default_path,"recorder.html");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(background.includes("chrome.sidePanel.open"));
  assert.ok(!background.includes("chrome.windows.create"));
});
