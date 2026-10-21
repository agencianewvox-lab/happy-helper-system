(() => {
  // Versioned, deliberately narrow DOM adapter. Never reads chat, tiles or arbitrary page text.
  // Meet's caption DOM is not a public API: an unrecognized layout must fail visibly, not guess speakers.
  const normalize = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  function rows(root = document) {
    return [...root.querySelectorAll(".nMcdL")].flatMap((node) => {
      const name = node.querySelector(".NWpY1d"),
        text = node.querySelector(".ygicle");
      if (!name || !text || !node.getClientRects().length) return [];
      const speaker = normalize(name.textContent),
        value = normalize(text.textContent);
      return speaker && speaker.length <= 160 && value && value.length <= 4000
        ? [{ node, speaker, text: value }]
        : [];
    });
  }
  const buttons = () =>
    [
      ...document.querySelectorAll(
        'button[aria-label], [role="button"][aria-label]',
      ),
    ].filter((b) => b.getClientRects().length);
  const captionButton = (on) =>
    buttons().find((b) =>
      (on
        ? /^(ativar|mostrar|turn on|show) (as )?(legendas|captions)/i
        : /^(desativar|ocultar|turn off|hide) (as )?(legendas|captions)/i
      ).test(b.getAttribute("aria-label") || ""),
    );
  let session = null,
    enabled = false,
    pending = new Map(),
    seen = new Map(),
    sendPromise = null;
  function baseline() {
    seen = new Map(
      rows().map((r) => [
        r.node,
        { speaker: r.speaker, text: r.text, baseline: true },
      ]),
    );
  }
  function scan() {
    if (!enabled || !session) return;
    const now = Math.max(0, Math.min(14400000, Date.now() - session.started));
    const present = new Set();
    for (const row of rows()) {
      present.add(row.node);
      let old = seen.get(row.node);
      if (old?.speaker === row.speaker && old.text === row.text) continue;
      // Existing captions at start/resume belong to before capture/while paused. Never import them.
      if (
        old?.baseline &&
        old.speaker === row.speaker &&
        row.text.startsWith(old.text)
      ) {
        const suffix = row.text.slice(old.text.length).trim();
        if (!suffix) continue;
        old.prefix = old.text;
        old.baseline = false;
        old.text = "";
      }
      const text =
        old?.prefix && row.text.startsWith(old.prefix)
          ? row.text.slice(old.prefix.length).trim()
          : row.text;
      if (!text) continue;
      const same =
        old &&
        !old.baseline &&
        old.id &&
        old.speaker === row.speaker &&
        (text.startsWith(old.value || "") ||
          (now - old.endMs < 3000 &&
            text.slice(0, 12) === (old.value || "").slice(0, 12)));
      const cue = {
        id: same ? old.id : crypto.randomUUID(),
        speaker: row.speaker,
        text,
        startMs: same ? old.startMs : now,
        endMs: now,
        revision: same ? old.revision + 1 : 1,
      };
      seen.set(row.node, {
        ...cue,
        text: row.text,
        value: text,
        prefix: old?.prefix,
      });
      pending.set(cue.id, cue);
    }
    for (const node of seen.keys()) if (!present.has(node)) seen.delete(node);
  }
  function send() {
    if (sendPromise) return sendPromise;
    if (!session || (!enabled && !pending.size)) return Promise.resolve();
    sendPromise = (async () => {
      const items = [...pending.values()].slice(0, 10),
        id = session.meetingId;
      try {
        const result = await chrome.runtime.sendMessage({
          target: "meet-captions",
          meetingId: id,
          items,
          captionState: captionButton(false) ? "enabled" : "unavailable",
        });
        if (session?.meetingId !== id) return;
        if (result?.active === false) {
          enabled = false;
          session = null;
          pending.clear();
          seen.clear();
          return;
        }
        if (result?.ok)
          for (const item of items)
            if (pending.get(item.id)?.revision === item.revision)
              pending.delete(item.id);
      } catch {
        /* Keep pending revisions until the trusted offscreen document acknowledges them. */
      }
    })().finally(() => {
      sendPromise = null;
    });
    return sendPromise;
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      message.target !== "newvox-captions"
    )
      return;
    (async () => {
      if (message.action === "start") {
        session = { meetingId: message.meetingId, started: message.started };
        pending.clear();
        baseline();
        enabled = true;
        captionButton(true)?.click();
      } else if (message.action === "pause") {
        scan();
        enabled = false;
        await send();
        if (pending.size) await send();
        baseline();
      } else if (message.action === "resume") {
        baseline();
        enabled = true;
      } else if (message.action === "enable") captionButton(true)?.click();
      else if (message.action === "stop") {
        scan();
        enabled = false;
        await send();
        for (let i = 0; i < 20 && pending.size; i++) await send();
        if (pending.size) throw new Error("Falas ainda não persistidas neste computador.");
      }
      return { ok: true };
    })().then(respond, () =>
      respond({ error: "Não foi possível ler as legendas do Meet." }),
    );
    return true;
  });
  setInterval(() => {
    scan();
    void send();
  }, 500);
})();
