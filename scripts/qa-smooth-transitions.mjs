import { mkdir, writeFile } from "node:fs/promises";

const DEBUG_PORT = process.env.BOXGIRL_CDP_PORT ?? "9225";
const OUTPUT_DIR = new URL("../artifacts/qa/smooth-transitions/", import.meta.url);
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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function readFrame() {
  return evaluate(`(() => {
    const renderer = document.querySelector('[data-current-frame]');
    return {
      current: renderer?.dataset.currentFrame,
      previous: renderer?.dataset.previousFrame,
      transitioning: renderer?.dataset.transitioning,
      durationMs: Number(renderer?.dataset.transitionDuration),
      renderer: renderer?.dataset.renderer,
    };
  })()`);
}

async function clickLab(label) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.animation-lab button')]
      .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Animation lab button was not found');
    button.click();
  })()`);
}

async function snapshot(name) {
  const capture = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(`${name}.png`, OUTPUT_DIR), Buffer.from(capture.data, "base64"));
}

await command("Page.enable");
await delay(500);

const results = { initial: await readFrame() };
await clickLab("Приветствие");
await delay(70);
results.waveAttack = await readFrame();
await snapshot("01-wave-attack");

// Interrupt the requested target while the neutral -> wave fade is still active.
await clickLab("Объясняет →");
await delay(80);
results.queuedDuringWave = await readFrame();
await delay(520);
results.explainAttack = await readFrame();
await snapshot("02-explain-attack");
await delay(620);
results.explainSettled = await readFrame();
await snapshot("03-explain-settled");

await clickLab("Нет");
const shakeSamples = [];
for (const elapsedMs of [80, 420, 800, 1_180, 1_540]) {
  const alreadyWaited = shakeSamples.at(-1)?.elapsedMs ?? 0;
  await delay(elapsedMs - alreadyWaited);
  shakeSamples.push({ elapsedMs, ...(await readFrame()) });
}
results.shakeSamples = shakeSamples;
await snapshot("04-shake-release");

const valid = results.initial.current === "neutral"
  && results.waveAttack.current === "wave"
  && results.waveAttack.transitioning === "true"
  && results.waveAttack.durationMs === 560
  && results.queuedDuringWave.current === "wave"
  && results.explainAttack.current === "explain-right"
  && results.explainAttack.previous === "wave"
  && results.explainSettled.transitioning === "false"
  && shakeSamples.every((sample) => sample.renderer === "point-rig-webgl")
  && new Set(shakeSamples.map((sample) => sample.current)).size >= 3;

socket.close();
console.log(JSON.stringify({ valid, results }, null, 2));
if (!valid) process.exitCode = 1;
