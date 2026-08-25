# Local LLM

BoxGirl uses the official `Qwen3.5-4B` checkpoint in a pinned `Q4_K_M` GGUF conversion through pinned CPU and CUDA 12.4 builds of `llama.cpp`. It is run as text-only and non-thinking; the vision projector is not loaded. Run `npm run setup:llm` once to download every artifact and verify its SHA-256. The model and runtimes live under the ignored `models/llm` directory and are not bundled into the executable yet.

Runtime profile for the current Ryzen 5 5600H / 14 GB RAM / 4 GB GPU machine:

- 4096-token context;
- 6 CPU inference threads;
- adaptive CUDA layer offload with a 512 MiB minimum fit margin, Flash Attention and Q8 KV cache; the tested application-level reserve remains about 1 GiB because layers are offloaded discretely;
- automatic CPU fallback if CUDA cannot start;
- one parallel slot;
- non-thinking Qwen mode;
- at most 320 generated tokens per turn;
- a random loopback port protected by a per-process API key.

The model generates only `{ segments }` under a `llama.cpp` JSON Schema grammar. Emotion intensity is selected from a finite in-range enum. Rust owns `version` and `turnId`, rejects unknown properties and semantic values, limits response size and gestures, and removes contextually invalid `wave`/`celebrate` motions. It also rejects mixed-script words and unprompted gendered forms addressed to the user; one low-temperature correction pass is allowed before the provider falls back safely. React validates the final `AssistantTurnV1` again. The private easter egg remains outside this contract and cannot be triggered by the model.

The provider keeps at most eight recent user/assistant messages and 6000 characters. If the model is absent, fails schema validation, or the server cannot start, the request safely falls back to `MockAssistantProvider`. Runtime status and measured tokens per second are visible in the debug panel.

Deployment overrides:

- `BOXGIRL_LLAMA_SERVER`
- `BOXGIRL_LLM_MODEL`
- `BOXGIRL_LLM_GPU_LAYERS` (`0`, an explicit count, or `auto`; used with a server override)

On Windows, the server is assigned to a kill-on-close Job Object. It is terminated with BoxGirl even after a forced or abnormal parent-process exit.

Release QA:

```powershell
npm run tauri build -- --no-bundle
npm run qa:release-llm
```

The selected Qwen weights are Apache-2.0. `llama.cpp` is MIT. Keep model/runtime license notices when creating a distributable installer.
