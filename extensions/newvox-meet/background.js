import { parseMeetUrl } from "./shared.js";
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let creating;
async function offscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ||= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification:
        "Capturar o áudio da reunião autorizada, salvar os trechos e sincronizar com o painel.",
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}
chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL("recorder.html");
  const existing = (await chrome.tabs.query({})).find((t) =>
    t.url?.startsWith(url),
  );
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.runtime
      .sendMessage({
        target: "controller",
        action: "select_tab",
        tabId: tab.id,
      })
      .catch(() => {});
    return;
  }
  await chrome.windows.create({
    url: `${url}?tab=${tab.id}`,
    type: "popup",
    width: 480,
    height: 820,
  });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (
    message.target === "offscreen-bridge" &&
    !sender.tab &&
    sender.url === chrome.runtime.getURL("offscreen.html")
  ) {
    (async () => {
      if (message.action === "credentials")
        return chrome.storage.session.get("credentials");
      if (message.action === "load")
        return chrome.storage.local.get("unfinished");
      if (message.action === "persist") {
        await chrome.storage.local.set({ unfinished: message.current });
        return { ok: true };
      }
      if (message.action === "badge") {
        await chrome.action.setBadgeText({ text: message.text });
        await chrome.action.setBadgeBackgroundColor({ color: "#e5484d" });
        return { ok: true };
      }
      throw new Error("Ação inválida.");
    })().then(respond, (error) => respond({ error: error.message }));
    return true;
  }
  if (message.target === "meet-state" && sender.tab) {
    void chrome.runtime
      .sendMessage({
        target: "offscreen",
        action: "meet_state",
        tabId: sender.tab.id,
        muted: message.muted,
        room: parseMeetUrl(sender.tab.url),
      })
      .catch(() => {});
    return;
  }
  // Content scripts cannot issue commands or obtain tokens.
  if (
    sender.tab?.url?.startsWith("https://") ||
    !sender.url?.startsWith(chrome.runtime.getURL("recorder.html")) ||
    message.target !== "background"
  )
    return;
  (async () => {
    await offscreen();
    if (message.action === "start") {
      const tab = await chrome.tabs.get(message.tabId);
      if (!parseMeetUrl(tab.url))
        throw new Error(
          "Abra a reunião do Google Meet e clique no ícone da extensão nessa aba.",
        );
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: message.tabId,
      });
      return chrome.runtime.sendMessage({
        ...message,
        target: "offscreen",
        streamId,
        room: parseMeetUrl(tab.url),
      });
    }
    return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
  })().then(respond, (error) => respond({ error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.runtime
    .sendMessage({ target: "offscreen", action: "tab_closed", tabId })
    .catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url)
    void chrome.runtime
      .sendMessage({
        target: "offscreen",
        action: "navigation",
        tabId,
        room: parseMeetUrl(change.url),
      })
      .catch(() => {});
});
