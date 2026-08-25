use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;

const DEFAULT_SAMPLE_RATE: u32 = 48_000;

use crate::tts_core::{ALLOWED_SAMPLE_RATES, ALLOWED_SPEAKERS, validate_request};

#[derive(Debug, Clone)]
struct SileroPaths {
    python: Option<PathBuf>,
    model: Option<PathBuf>,
    worker: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SileroCapabilities {
    available: bool,
    engine: &'static str,
    model_version: &'static str,
    speakers: &'static [&'static str],
    sample_rates: &'static [u32],
    model_path: Option<String>,
    python_path: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SileroSynthesis {
    wav_base64: String,
    duration_ms: u64,
    synthesis_ms: u64,
    sample_rate: u32,
    speaker: String,
}

#[derive(Debug, Serialize)]
struct WorkerRequest<'a> {
    id: u64,
    text: &'a str,
    speaker: &'a str,
    sample_rate: u32,
}

#[derive(Debug, Deserialize)]
struct WorkerResponse {
    id: u64,
    ok: bool,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    wav_base64: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
    #[serde(default)]
    synthesis_ms: Option<u64>,
    #[serde(default)]
    sample_rate: Option<u32>,
    #[serde(default)]
    speaker: Option<String>,
}

pub struct SileroState {
    worker: Arc<Mutex<Option<SileroWorker>>>,
}

impl Default for SileroState {
    fn default() -> Self {
        Self {
            worker: Arc::new(Mutex::new(None)),
        }
    }
}

struct SileroWorker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl SileroWorker {
    fn spawn(python: &PathBuf, model: &PathBuf, worker: &PathBuf) -> Result<Self, String> {
        let mut command = Command::new(python);
        command
            .arg("-u")
            .arg(worker)
            .arg("--model")
            .arg(model)
            .arg("--threads")
            .arg("4")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("Не удалось запустить Silero worker: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Silero worker не открыл stdin".to_owned())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Silero worker не открыл stdout".to_owned())?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        })
    }

    fn request(
        &mut self,
        text: &str,
        speaker: &str,
        sample_rate: u32,
    ) -> Result<SileroSynthesis, String> {
        if let Some(status) = self
            .child
            .try_wait()
            .map_err(|error| format!("Не удалось проверить Silero worker: {error}"))?
        {
            return Err(format!("Silero worker завершился раньше времени: {status}"));
        }

        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        let payload = serde_json::to_string(&WorkerRequest {
            id,
            text,
            speaker,
            sample_rate,
        })
        .map_err(|error| format!("Не удалось собрать запрос Silero: {error}"))?;
        self.stdin
            .write_all(payload.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("Не удалось отправить запрос Silero: {error}"))?;

        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .map_err(|error| format!("Не удалось прочитать ответ Silero: {error}"))?;
        if line.trim().is_empty() {
            return Err("Silero worker закрыл канал ответа".to_owned());
        }
        let response: WorkerResponse = serde_json::from_str(&line)
            .map_err(|error| format!("Silero worker вернул повреждённый JSON: {error}"))?;
        if response.id == 0 && !response.ok {
            return Err(response
                .error
                .unwrap_or_else(|| "Silero worker не запустился".to_owned()));
        }
        if response.id != id {
            return Err("Silero worker нарушил порядок ответов".to_owned());
        }
        if !response.ok {
            return Err(response
                .error
                .unwrap_or_else(|| "Неизвестная ошибка Silero".to_owned()));
        }

        Ok(SileroSynthesis {
            wav_base64: response
                .wav_base64
                .ok_or_else(|| "Silero worker не вернул WAV".to_owned())?,
            duration_ms: response.duration_ms.unwrap_or_default(),
            synthesis_ms: response.synthesis_ms.unwrap_or_default(),
            sample_rate: response.sample_rate.unwrap_or(sample_rate),
            speaker: response.speaker.unwrap_or_else(|| speaker.to_owned()),
        })
    }
}

impl Drop for SileroWorker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn first_file(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|path| path.is_file())
}

fn discover_paths(app: &tauri::AppHandle) -> SileroPaths {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let resources = app.path().resource_dir().ok();

    let mut python_candidates = Vec::new();
    if let Some(path) = env::var_os("BOXGIRL_SILERO_PYTHON") {
        python_candidates.push(PathBuf::from(path));
    }
    if let Some(path) = resources.as_ref() {
        python_candidates.push(path.join("runtime").join("silero").join("python.exe"));
        python_candidates.push(
            path.join("models")
                .join("silero")
                .join(".venv")
                .join("Scripts")
                .join("python.exe"),
        );
    }
    python_candidates.push(
        project
            .join("models")
            .join("silero")
            .join(".venv")
            .join("Scripts")
            .join("python.exe"),
    );

    let mut model_candidates = Vec::new();
    if let Some(path) = env::var_os("BOXGIRL_SILERO_MODEL") {
        model_candidates.push(PathBuf::from(path));
    }
    if let Some(path) = resources.as_ref() {
        model_candidates.push(path.join("models").join("silero").join("v5_5_ru.pt"));
    }
    model_candidates.push(project.join("models").join("silero").join("v5_5_ru.pt"));

    let mut worker_candidates = Vec::new();
    if let Some(path) = env::var_os("BOXGIRL_SILERO_WORKER") {
        worker_candidates.push(PathBuf::from(path));
    }
    if let Some(path) = resources.as_ref() {
        worker_candidates.push(path.join("scripts").join("silero_worker.py"));
    }
    worker_candidates.push(project.join("scripts").join("silero_worker.py"));

    SileroPaths {
        python: first_file(python_candidates),
        model: first_file(model_candidates),
        worker: first_file(worker_candidates),
    }
}

fn unavailable_reason(paths: &SileroPaths) -> Option<String> {
    let mut missing = Vec::new();
    if paths.python.is_none() {
        missing.push("Python runtime");
    }
    if paths.model.is_none() {
        missing.push("модель v5_5_ru.pt");
    }
    if paths.worker.is_none() {
        missing.push("silero_worker.py");
    }
    (!missing.is_empty()).then(|| format!("Не найдено: {}", missing.join(", ")))
}

#[tauri::command]
pub fn silero_capabilities(app: tauri::AppHandle) -> SileroCapabilities {
    let paths = discover_paths(&app);
    let reason = unavailable_reason(&paths);
    SileroCapabilities {
        available: reason.is_none(),
        engine: "silero",
        model_version: "v5_5_ru",
        speakers: &ALLOWED_SPEAKERS,
        sample_rates: &ALLOWED_SAMPLE_RATES,
        model_path: paths.model.as_ref().map(|path| path.display().to_string()),
        python_path: paths.python.as_ref().map(|path| path.display().to_string()),
        reason,
    }
}

fn synthesize_blocking(
    state: Arc<Mutex<Option<SileroWorker>>>,
    paths: SileroPaths,
    text: String,
    speaker: String,
    sample_rate: u32,
) -> Result<SileroSynthesis, String> {
    validate_request(&text, &speaker, sample_rate)?;
    let python = paths
        .python
        .ok_or_else(|| "Не найден Silero Python runtime".to_owned())?;
    let model = paths
        .model
        .ok_or_else(|| "Не найдена модель Silero v5_5_ru.pt".to_owned())?;
    let worker_path = paths
        .worker
        .ok_or_else(|| "Не найден scripts/silero_worker.py".to_owned())?;
    let mut guard = state
        .lock()
        .map_err(|_| "Silero worker заблокирован после внутренней ошибки".to_owned())?;

    if guard.is_none() {
        *guard = Some(SileroWorker::spawn(&python, &model, &worker_path)?);
    }
    let result =
        guard
            .as_mut()
            .expect("worker was initialized")
            .request(&text, &speaker, sample_rate);
    if result.is_err() {
        // The current request fails fast; the next request gets a clean worker.
        *guard = None;
    }
    result
}

fn warm_blocking(
    state: Arc<Mutex<Option<SileroWorker>>>,
    paths: SileroPaths,
) -> Result<(), String> {
    let python = paths
        .python
        .ok_or_else(|| "Не найден Silero Python runtime".to_owned())?;
    let model = paths
        .model
        .ok_or_else(|| "Не найдена модель Silero v5_5_ru.pt".to_owned())?;
    let worker_path = paths
        .worker
        .ok_or_else(|| "Не найден scripts/silero_worker.py".to_owned())?;
    let mut guard = state
        .lock()
        .map_err(|_| "Silero worker заблокирован после внутренней ошибки".to_owned())?;
    if guard.is_none() {
        *guard = Some(SileroWorker::spawn(&python, &model, &worker_path)?);
    }
    let result = guard
        .as_mut()
        .expect("worker was initialized")
        .request("Я готова.", "xenia", DEFAULT_SAMPLE_RATE)
        .map(|_| ());
    if result.is_err() {
        *guard = None;
    }
    result
}

#[tauri::command]
pub async fn warm_silero(
    app: tauri::AppHandle,
    state: tauri::State<'_, SileroState>,
) -> Result<(), String> {
    let paths = discover_paths(&app);
    let worker = Arc::clone(&state.worker);
    tauri::async_runtime::spawn_blocking(move || warm_blocking(worker, paths))
        .await
        .map_err(|error| format!("Silero warm-up завершился аварийно: {error}"))?
}

#[tauri::command]
pub async fn synthesize_silero(
    app: tauri::AppHandle,
    state: tauri::State<'_, SileroState>,
    text: String,
    speaker: String,
    sample_rate: Option<u32>,
) -> Result<SileroSynthesis, String> {
    let paths = discover_paths(&app);
    let worker = Arc::clone(&state.worker);
    tauri::async_runtime::spawn_blocking(move || {
        synthesize_blocking(
            worker,
            paths,
            text,
            speaker,
            sample_rate.unwrap_or(DEFAULT_SAMPLE_RATE),
        )
    })
    .await
    .map_err(|error| format!("Silero worker завершился аварийно: {error}"))?
}
