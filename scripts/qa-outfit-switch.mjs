import { mkdir, writeFile } from "node:fs/promises";

const port = process.env.BOXGIRL_CDP_PORT ?? "9229";
const outputDir = new URL("../artifacts/qa/outfit-switch/", import.meta.url);
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

async function submit(text) {
  await evaluate(`(() => {
    const input = document.querySelector('.composer input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form').requestSubmit();
  })()`);
}

await command("Page.enable");
await waitFor(
  `document.querySelector('#root') !== null && typeof window.__TAURI_INTERNALS__?.invoke === 'function'`,
  30_000,
  "Tauri UI",
);
await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);

await submit("холодно");
await waitFor(`document.querySelector('[data-testid="avatar"]')?.dataset.outfit === 'hoodie'`, 3_000, "hoodie outfit");
await new Promise((resolve) => setTimeout(resolve, 750));

await submit("жарко");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'summer'`, 3_000, "summer outfit");
const transition = await evaluate(`(() => {
  const renderer = document.querySelector('.point-rig-renderer');
  return {
    currentOutfit: renderer?.dataset.currentOutfit,
    previousOutfit: renderer?.dataset.previousOutfit,
    durationMs: Number(renderer?.dataset.transitionDuration),
  };
})()`);
await new Promise((resolve) => setTimeout(resolve, 850));

const summer = await evaluate(`(() => ({
  outfit: document.querySelector('[data-testid="avatar"]')?.dataset.outfit,
  rendererOutfit: document.querySelector('.point-rig-renderer')?.dataset.currentOutfit,
  storedOutfit: localStorage.getItem('boxgirl.avatar-outfit.v1'),
  assistantText: [...document.querySelectorAll('.message-assistant p')].at(-1)?.textContent?.trim(),
  renderer: document.querySelector('.point-rig-renderer')?.dataset.renderer,
  fps: [...document.querySelectorAll('.debug-panel dt')].find((item) => item.textContent === 'render')?.parentElement?.querySelector('dd')?.textContent,
}))()`);

await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);
await waitFor(`document.querySelector('.debug-panel') === null`, 1_000, "closed diagnostics panel");
await mkdir(outputDir, { recursive: true });
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(new URL("summer-outfit.png", outputDir), Buffer.from(screenshot.data, "base64"));

await submit("тренировка");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'gym'`, 3_000, "gym outfit");
const gymTransition = await evaluate(`(() => {
  const renderer = document.querySelector('.point-rig-renderer');
  return {
    currentOutfit: renderer?.dataset.currentOutfit,
    previousOutfit: renderer?.dataset.previousOutfit,
    durationMs: Number(renderer?.dataset.transitionDuration),
  };
})()`);
await new Promise((resolve) => setTimeout(resolve, 850));
await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);
await waitFor(`document.querySelector('.debug-panel') !== null`, 1_000, "open diagnostics panel for gym");
const gym = await evaluate(`(() => ({
  outfit: document.querySelector('[data-testid="avatar"]')?.dataset.outfit,
  rendererOutfit: document.querySelector('.point-rig-renderer')?.dataset.currentOutfit,
  storedOutfit: localStorage.getItem('boxgirl.avatar-outfit.v1'),
  assistantText: [...document.querySelectorAll('.message-assistant p')].at(-1)?.textContent?.trim(),
  renderer: document.querySelector('.point-rig-renderer')?.dataset.renderer,
  fps: [...document.querySelectorAll('.debug-panel dt')].find((item) => item.textContent === 'render')?.parentElement?.querySelector('dd')?.textContent,
  textureCount: Number(document.querySelector('.point-rig-renderer')?.dataset.textureCount),
  residentOutfit: document.querySelector('.point-rig-renderer')?.dataset.residentOutfit,
}))()`);
await evaluate(`document.querySelector('button[aria-label="Диагностика"]')?.click()`);
await waitFor(`document.querySelector('.debug-panel') === null`, 1_000, "closed diagnostics panel after gym");
const gymScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(new URL("gym-outfit.png", outputDir), Buffer.from(gymScreenshot.data, "base64"));

await submit("боньк");
await waitFor(`document.querySelector('[data-testid="avatar"]')?.dataset.frame === 'private-playful'`, 3_000, "gym bonk pose");
const bonkOutfit = await evaluate(`document.querySelector('[data-testid="avatar"]')?.dataset.outfit`);

await submit("холодно");
await waitFor(`document.querySelector('.point-rig-renderer')?.dataset.currentOutfit === 'hoodie'`, 3_000, "restored hoodie");
await new Promise((resolve) => setTimeout(resolve, 750));
const cold = await evaluate(`(() => ({
  outfit: document.querySelector('[data-testid="avatar"]')?.dataset.outfit,
  storedOutfit: localStorage.getItem('boxgirl.avatar-outfit.v1'),
  assistantText: [...document.querySelectorAll('.message-assistant p')].at(-1)?.textContent?.trim(),
}))()`);

const valid = transition.currentOutfit === "summer"
  && transition.previousOutfit === "hoodie"
  && transition.durationMs === 640
  && summer.outfit === "summer"
  && summer.rendererOutfit === "summer"
  && summer.storedOutfit === "summer"
  && summer.assistantText?.includes("майку")
  && summer.renderer === "point-rig-webgl"
  && gymTransition.currentOutfit === "gym"
  && gymTransition.previousOutfit === "summer"
  && gymTransition.durationMs === 640
  && gym.outfit === "gym"
  && gym.rendererOutfit === "gym"
  && gym.storedOutfit === "gym"
  && gym.assistantText?.includes("Тренировка")
  && gym.renderer === "point-rig-webgl"
  && Number.parseInt(gym.fps, 10) >= 55
  && gym.textureCount > 0
  && gym.textureCount <= 4
  && gym.residentOutfit === "gym"
  && bonkOutfit === "gym"
  && cold.outfit === "hoodie"
  && cold.storedOutfit === "hoodie"
  && cold.assistantText?.includes("худи");

const result = { valid, transition, summer, gymTransition, gym, bonkOutfit, cold };
await writeFile(new URL("results.json", outputDir), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
socket.close();
if (!valid) process.exitCode = 1;
