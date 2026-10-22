import { testMicrophone, mediaCaptureError } from "./media-permissions.js";
const button = document.getElementById("allow-microphone");
const status = document.getElementById("permission-status");
button.onclick = async () => {
  button.disabled = true;
  status.textContent =
    "Aguardando o Chrome… escolha Permitir no pedido de microfone.";
  try {
    await testMicrophone();
    status.textContent =
      "Microfone autorizado e verificado. Pode fechar esta janela e iniciar pela lateral do Meet. Nenhum áudio foi gravado.";
    button.textContent = "Testar novamente";
  } catch (error) {
    status.textContent = mediaCaptureError(error).replace(
      "Clique em Configurar microfone e autorize na janela que abrir.",
      "Clique novamente em Autorizar e testar microfone e permita no Chrome.",
    );
  } finally {
    button.disabled = false;
  }
};
document.getElementById("microphone-settings").onclick = () =>
  chrome.tabs.create({ url: "chrome://settings/content/microphone" });
document.getElementById("close-permission").onclick = () => window.close();
