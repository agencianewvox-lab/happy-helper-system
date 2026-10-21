(() => {
  // Isolated world; names and conversation content are never collected from the DOM.
  let timer;
  function report() {
    const labels = [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
      .filter((b) => b.getClientRects().length)
      .map((b) => b.getAttribute("aria-label") || "");
    const inCall = labels.some(label => /^(sair da (chamada|reunião)|encerrar (a )?(chamada|reunião)|leave (the )?(call|meeting)|end (the )?call)/i.test(label));
    const states = labels.map((label) => {
        if (
          /^(desativar|desligar|turn off|mute) (o |your )?(microfone|microphone)/i.test(
            label,
          )
        )
          return false;
        if (
          /^(ativar|ligar|turn on|unmute) (o |your )?(microfone|microphone)/i.test(
            label,
          )
        )
          return true;
        return null;
      })
      .filter((v) => v !== null);
    const muted = inCall && states.length === 1 ? states[0] : null;
    chrome.runtime.sendMessage({ target: "meet-state", muted }).catch(() => {});
  }
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(report, 30);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["aria-label", "data-is-muted"],
  });
  setInterval(report, 500);
  report();
})();
