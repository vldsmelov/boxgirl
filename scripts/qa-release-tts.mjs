import { mkdir, writeFile } from "node:fs/promises";

const port = process.env.BOXGIRL_CDP_PORT ?? "9226";
const outputDir = new URL("../artifacts/qa/release-tts/", import.meta.url);
const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page");
if (!page) throw new Error("BoxGirl release WebView was not found in DevTools targets");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const handler = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await command("Page.enable");
await evaluate(`new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else window.addEventListener('load', resolve, { once: true });
})`);
await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);
await new Promise((resolve) => setTimeout(resolve, 7_500));

const status = await evaluate(`(() => ({
  tauriAvailable: '__TAURI_INTERNALS__' in window,
  voiceStatus: document.querySelector('.voice-lab small')?.textContent?.trim(),
  selectedVoice: document.querySelector('.voice-lab select')?.value,
  voiceOptions: [...document.querySelectorAll('.voice-lab option')].map((option) => ({
    value: option.value,
    disabled: option.disabled,
  })),
}))()`);

await mkdir(outputDir, { recursive: true });
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(new URL("voice-lab.png", outputDir), Buffer.from(screenshot.data, "base64"));

await evaluate(`(() => {
  const select = document.querySelector('.voice-lab select');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, 'silero-xenia');
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await new Promise((resolve) => setTimeout(resolve, 80));
await evaluate(`(() => {
  window.__boxgirlVoiceQa = { maxLip: 0, samples: 0 };
  window.__boxgirlVoiceQa.timer = setInterval(() => {
    const row = [...document.querySelectorAll('.debug-panel dt')].find((item) => item.textContent === 'lip')?.parentElement;
    const level = Number(row?.querySelector('dd')?.textContent ?? 0);
    window.__boxgirlVoiceQa.maxLip = Math.max(window.__boxgirlVoiceQa.maxLip, level);
    window.__boxgirlVoiceQa.samples += 1;
  }, 80);
  document.querySelector('.voice-lab button')?.click();
})()`);
await new Promise((resolve) => setTimeout(resolve, 1_200));
const playbackScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(new URL("xenia-playback.png", outputDir), Buffer.from(playbackScreenshot.data, "base64"));
await new Promise((resolve) => setTimeout(resolve, 3_600));
const playback = await evaluate(`(() => {
  clearInterval(window.__boxgirlVoiceQa.timer);
  return {
    maxLip: window.__boxgirlVoiceQa.maxLip,
    samples: window.__boxgirlVoiceQa.samples,
    fallback: document.querySelector('.voice-warning')?.textContent ?? null,
    selectedVoice: document.querySelector('.voice-lab select')?.value,
  };
})()`);

await evaluate(`(() => {
  const select = document.querySelector('.voice-lab select');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, 'silero-baya');
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
socket.close();

const valid = status.tauriAvailable
  && status.voiceStatus?.includes("прогрет")
  && status.selectedVoice === "silero-baya"
  && status.voiceOptions?.filter((option) => option.value.startsWith("silero-")).every((option) => !option.disabled)
  && playback.selectedVoice === "silero-xenia"
  && playback.maxLip > 0.03
  && playback.fallback === null;
console.log(JSON.stringify({ valid, status, playback, pageUrl: page.url }, null, 2));
if (!valid) process.exitCode = 1;
