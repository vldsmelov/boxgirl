import { mkdir, writeFile } from "node:fs/promises";

const DEBUG_PORT = process.env.BOXGIRL_CDP_PORT ?? "9224";
const OUTPUT_DIR = new URL("../artifacts/qa/private-easter-egg/", import.meta.url);

const pages = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http://127.0.0.1:4173/"));

if (!page) throw new Error("BoxGirl preview page was not found in Chrome DevTools targets");

await mkdir(OUTPUT_DIR, { recursive: true });

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
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function snapshot(name) {
  const status = await evaluate(`(() => ({
    frame: document.querySelector('[data-testid="avatar"]')?.dataset.frame,
    renderer: document.querySelector('[data-renderer]')?.dataset.renderer,
    lastMessage: [...document.querySelectorAll('.message p')].at(-1)?.textContent,
  }))()`);
  const capture = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(`${name}.png`, OUTPUT_DIR), Buffer.from(capture.data, "base64"));
  return { name, ...status };
}

await command("Page.enable");
await command("Runtime.enable");
await evaluate(`new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else window.addEventListener('load', resolve, { once: true });
})`);
await delay(500);

const results = [await snapshot("00-idle")];

await evaluate(`(() => {
  const input = document.querySelector('.composer input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'боньк');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.closest('form').requestSubmit();
})()`);

const startedAt = performance.now();
for (const phase of [
  ["01-attack", 320],
  ["02-second", 740],
  ["03-third", 1_180],
  ["04-fourth", 1_635],
  ["05-release", 2_180],
  ["06-idle-return", 2_900],
]) {
  await delay(Math.max(0, phase[1] - (performance.now() - startedAt)));
  results.push({ ...(await snapshot(phase[0])), elapsedMs: Math.round(performance.now() - startedAt) });
}

socket.close();

const active = results.slice(1, -1);
const valid = active.every((item) => item.frame === "private-playful" && item.renderer === "point-rig-webgl")
  && active.some((item) => item.lastMessage === "Боньк-боньк-боньк-боньк ✨")
  && results.at(-1).frame === "neutral";

console.log(JSON.stringify({ valid, results }, null, 2));
if (!valid) process.exitCode = 1;
