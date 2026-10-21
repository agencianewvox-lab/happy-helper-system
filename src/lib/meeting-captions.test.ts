// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
const source = readFileSync(
  new URL("../../extensions/newvox-meet/captions.js", import.meta.url),
  "utf8",
);
function harness() {
  const dom = new JSDOM(
    '<button aria-label="Ativar legendas"></button><div id="captions"></div><div id="chat">Segredo no chat</div>',
  );
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return [{ width: 100 }] as unknown as DOMRectList;
  };
  let now = 100000,
    listener: (m: unknown, s: unknown, r: (v: unknown) => void) => void,
    tick: () => void,
    i = 0;
  const messages: {
    items: {
      id: string;
      speaker: string;
      text: string;
      revision: number;
      startMs: number;
    }[];
  }[] = [];
  vm.runInNewContext(source, {
    document: dom.window.document,
    Date: { now: () => now },
    crypto: {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`,
    },
    setInterval: (fn: () => void) => {
      tick = fn;
    },
    chrome: {
      runtime: {
        id: "ext",
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
        sendMessage: async (m: (typeof messages)[number]) => {
          messages.push(structuredClone(m));
          return { ok: true, active: true };
        },
      },
    },
  });
  const command = (action: string) =>
    new Promise((resolve) =>
      listener(
        {
          target: "newvox-captions",
          action,
          meetingId: "meeting",
          started: 100000,
        },
        { id: "ext" },
        resolve,
      ),
    );
  function row(speaker: string, text: string) {
    const node = dom.window.document.createElement("div");
    node.className = "nMcdL";
    const name = dom.window.document.createElement("span");
    name.className = "NWpY1d";
    name.textContent = speaker;
    const words = dom.window.document.createElement("div");
    words.className = "ygicle";
    words.textContent = text;
    node.append(name, words);
    dom.window.document.getElementById("captions")!.append(node);
    return { node, name, words };
  }
  async function poll() {
    now += 500;
    tick();
    for (let n = 0; n < 8; n++) await Promise.resolve();
  }
  return {
    command,
    row,
    poll,
    messages,
    get items() {
      return messages.flatMap((m) => m.items);
    },
  };
}
describe("Meet caption adapter (synthetic DOM, no real meeting)", () => {
  it("collects nothing before explicit start; never reads chat or pre-existing captions", async () => {
    const h = harness();
    h.row("Ana", "Antes da gravação");
    await h.poll();
    expect(h.messages).toHaveLength(0);
    await h.command("start");
    await h.poll();
    expect(h.items).toHaveLength(0);
    expect(JSON.stringify(h.messages)).not.toContain("Segredo");
  });
  it("updates one cue with names, timestamps and monotonically increasing revision", async () => {
    const h = harness();
    await h.command("start");
    const row = h.row("Alisson Lima", "Vamos lá");
    await h.poll();
    row.words.textContent = "Vamos lá, equipe!";
    await h.poll();
    expect(h.items).toHaveLength(2);
    expect(h.items[1]).toMatchObject({
      id: h.items[0].id,
      speaker: "Alisson Lima",
      text: "Vamos lá, equipe!",
      revision: 2,
      startMs: 500,
    });
  });
  it("starts a separate cue for another speaker, without guessing from tiles", async () => {
    const h = harness();
    await h.command("start");
    const row = h.row("Ana", "Sim");
    await h.poll();
    row.name.textContent = "Bruno";
    row.words.textContent = "Sim";
    await h.poll();
    expect(h.items[0].id).not.toBe(h.items[1].id);
    expect(h.items.map((x) => x.speaker)).toEqual(["Ana", "Bruno"]);
  });
  it("does not import speech during pause and resumes with only new text", async () => {
    const h = harness();
    await h.command("start");
    const row = h.row("Ana", "Primeira fala");
    await h.poll();
    await h.command("pause");
    row.words.textContent = "Conversa privada pausada";
    await h.poll();
    await h.command("resume");
    await h.poll();
    row.words.textContent = "Conversa privada pausada Próximo assunto";
    await h.poll();
    expect(h.items.at(-1)?.text).toBe("Próximo assunto");
    expect(JSON.stringify(h.items)).not.toContain("Conversa privada");
  });
  it("captures the final visible revision on stop", async () => {
    const h = harness();
    await h.command("start");
    const row = h.row("Ana", "Encerrando");
    await h.poll();
    row.words.textContent = "Encerrando, obrigado!";
    await h.command("stop");
    expect(h.items.at(-1)?.text).toBe("Encerrando, obrigado!");
    row.words.textContent = "Depois de finalizar";
    await h.poll();
    expect(JSON.stringify(h.items)).not.toContain("Depois de finalizar");
  });
});
