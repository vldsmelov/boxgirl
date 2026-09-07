import { mkdir, writeFile } from "node:fs/promises";

const port = process.env.BOXGIRL_CDP_PORT ?? "9230";
const outputDir = new URL("../artifacts/qa/alarm/", import.meta.url);
const pagesDeadline = Date.now() + 30_000;
let page;
while (!page && Date.now() < pagesDeadline) {
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
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

async function snapshot(name) {
  const state = await evaluate(`(() => ({
    frame: document.querySelector('[data-testid="avatar"]')?.dataset.frame,
    outfit: document.querySelector('[data-testid="avatar"]')?.dataset.outfit,
    renderer: document.querySelector('.point-rig-renderer')?.dataset.renderer,
    textureCount: Number(document.querySelector('.point-rig-renderer')?.dataset.textureCount),
    assistantText: [...document.querySelectorAll('.message-assistant p')].at(-1)?.textContent?.trim(),
    storedOutfit: localStorage.getItem('boxgirl.avatar-outfit.v1'),
    selectedVoice: localStorage.getItem('boxgirl.voiceProfile.v2'),
  }))()`);
  const capture = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(`${name}.png`, outputDir), Buffer.from(capture.data, "base64"));
  return state;
}

await command("Page.enable");
await mkdir(outputDir, { recursive: true });
await waitFor(`document.querySelector('#root') !== null`, 30_000, "Tauri UI");
await evaluate(`localStorage.setItem('boxgirl.voiceProfile.v2', 'silero-xenia')`);
await evaluate(`location.reload()`);
await new Promise((resolve) => setTimeout(resolve, 800));
await waitFor(`document.querySelector('#root') !== null`, 30_000, "reloaded Tauri UI");
await submit("Будильник");

const frames = ["alarm-soft", "alarm-teasing", "alarm-firm", "alarm-pout"];
const states = [];
for (const frame of frames) {
  await waitFor(`document.querySelector('[data-testid="avatar"]')?.dataset.frame === ${JSON.stringify(frame)}`, 30_000, frame);
  await new Promise((resolve) => setTimeout(resolve, 720));
  states.push({ frame, ...(await snapshot(frame)) });
}

await evaluate(`document.querySelector('.stop-button')?.click()`);
await waitFor(`document.querySelector('[data-testid="avatar"]')?.dataset.frame === 'neutral'`, 3_000, "alarm cancellation");
const stopped = await snapshot("stopped");
socket.close();

const valid = states.every((state, index) => state.frame === frames[index]
  && state.outfit === "sleep"
  && state.renderer === "point-rig-webgl"
  && state.textureCount > 0
  && state.textureCount <= 4
  && state.storedOutfit === "sleep"
  && state.selectedVoice === "silero-xenia")
  && states[0].assistantText?.includes("Доброе утро, дорогой")
  && states[0].assistantText?.includes("официально обижусь")
  && stopped.frame === "neutral"
  && stopped.outfit === "sleep";

const result = { valid, states, stopped };
await writeFile(new URL("results.json", outputDir), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
if (!valid) process.exitCode = 1;
