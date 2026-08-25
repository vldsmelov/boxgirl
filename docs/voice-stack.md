# BoxGirl voice stack

The first-run voice remains `Windows · Irina`. The debug Voice Lab can switch the active provider to Silero `xenia`, `kseniya`, or `baya`; a successful choice is stored locally. Silero synthesis runs on four CPU threads in one persistent worker, so the model is loaded once and the 4 GB GPU remains available to the avatar renderer.

## Local setup

Run `npm run setup:silero`. It creates an ignored virtual environment under `models/silero`, installs CPU-only PyTorch, downloads `v5_5_ru.pt`, and builds the normalized comparison pack under `artifacts/qa/voice-comparison`. Run `npm run qa:voices` to rebuild only the samples.

The desktop bridge also accepts these deployment overrides:

- `BOXGIRL_SILERO_PYTHON`
- `BOXGIRL_SILERO_MODEL`
- `BOXGIRL_SILERO_WORKER`

If Silero is unavailable or a synthesis call fails, the current utterance safely falls back to Windows Irina. The reason appears in Voice Lab. Browser preview always uses the Windows/browser provider.

## Release gate

The Russian-only Silero weights must be treated as evaluation assets until the upstream model license is audited for the intended distribution and commercial use. Do not bundle the downloaded model or Python environment into a public installer by default. Runtime, model, and voice-dataset licenses are separate release checks.
