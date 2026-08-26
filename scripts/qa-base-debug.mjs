import { mkdir, writeFile } from "node:fs/promises";

const port = process.env.BOXGIRL_CDP_PORT ?? "9230";
const outputDir = new URL("../artifacts/qa/base-debug/", import.meta.url);
const deadline = Date.now() + 30_000;
let page;

while (!page && Date.now() < deadline) {
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  page = pages.find((candidate) => candidate.type === "page" && candidate.url && candidate.url !== "about:blank");
  if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!page) throw new Error("Loaded BoxGirl WebView was not found");

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeoutMs, label) {
  const timeout = Date.now() + timeoutMs;
  while (Date.now() < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function submit(value) {
  await evaluate(`(() => {
    const input = document.querySelector('.composer input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form').requestSubmit();
  })()`);
}

async function snapshot() {
  return evaluate(`(() => ({
    presentation: document.querySelector('[data-testid="avatar"]')?.dataset.presentation,
    rendererPresentation: document.querySelector('.point-rig-renderer')?.dataset.currentOutfit,
    storedOutfit: localStorage.getItem('boxgirl.avatar-outfit.v1'),
    renderer: document.querySelector('.point-rig-renderer')?.dataset.renderer,
    textureCount: Number(document.querySelector('.point-rig-renderer')?.dataset.textureCount),
    fps: Number.parseInt([...document.querySelectorAll('.debug-panel dt')]
      .find((item) => item.textContent === 'render')?.parentElement?.querySelector('dd')?.textContent, 10),
    assistantText: [...document.querySelectorAll('.message-assistant p')].at(-1)?.textContent?.trim(),
  }))()`);
}

await command("Page.enable");
await waitFor(
  `document.querySelector('#root') !== null && typeof window.__TAURI_INTERNALS__?.invoke === 'function'`,
  30_000,
  "Tauri UI",
);

await submit("тренировка");
await waitFor(`document.querySelector('[data-testid="avatar"]')?.dataset.presentation === 'gym'`, 3_000, "gym setup");
await new Promise((resolve) => setTimeout(resolve, 700));

await submit("  ОТЛАДКА  ");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'base-debug'`, 3_000, "base-debug");
await new Promise((resolve) => setTimeout(resolve, 850));
await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);
await waitFor(`document.querySelector('.debug-panel') !== null`, 1_000, "diagnostics");
const base = await snapshot();

await mkdir(outputDir, { recursive: true });
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(new URL("base-debug.png", outputDir), Buffer.from(screenshot.data, "base64"));

await submit("отладка");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'gym'`, 3_000, "debug toggle restore");
await new Promise((resolve) => setTimeout(resolve, 700));
const restored = await snapshot();

await submit("отладка");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'base-debug'`, 3_000, "second debug entry");
await submit("жарко");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'summer'`, 3_000, "outfit exits debug");
await new Promise((resolve) => setTimeout(resolve, 850));
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.renderer === 'point-rig-webgl'`, 3_000, "summer WebGL renderer");
await waitFor(`Number.parseInt([...document.querySelectorAll('.debug-panel dt')]
  .find((item) => item.textContent === 'render')?.parentElement?.querySelector('dd')?.textContent, 10) >= 55`, 3_000, "55 FPS after rapid switch");
const summer = await snapshot();

const valid = base.presentation === "base-debug"
  && base.rendererPresentation === "base-debug"
  && base.storedOutfit === "gym"
  && base.renderer === "point-rig-webgl"
  && base.textureCount > 0
  && base.textureCount <= 4
  && base.fps >= 55
  && base.assistantText?.toLocaleLowerCase("ru-RU").includes("отлад")
  && restored.presentation === "gym"
  && restored.storedOutfit === "gym"
  && summer.presentation === "summer"
  && summer.storedOutfit === "summer"
  && summer.renderer === "point-rig-webgl"
  && summer.fps >= 55
  && summer.textureCount > 0
  && summer.textureCount <= 4;

const result = { valid, base, restored, summer };
await writeFile(new URL("results.json", outputDir), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
socket.close();
if (!valid) process.exitCode = 1;
