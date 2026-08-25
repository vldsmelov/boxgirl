use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use tauri::Manager;
use uuid::Uuid;

use crate::speech_core::{MAX_WAV_BYTES, validate_wave};

#[derive(Debug, Clone)]
struct SpeechPaths {
    executable: Option<PathBuf>,
    model: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechCapabilities {
    asr_ready: bool,
    engine: &'static str,
    model_path: Option<String>,
    executable_path: Option<String>,
}

fn first_existing(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|path| path.is_file())
}

fn discover_paths(app: &tauri::AppHandle) -> SpeechPaths {
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("models")
        .join("whisper");
    let resource = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join("models").join("whisper"));
    let executable_from_env = env::var_os("BOXGIRL_WHISPER_CLI").map(PathBuf::from);
    let model_from_env = env::var_os("BOXGIRL_WHISPER_MODEL").map(PathBuf::from);

    let mut executable_candidates = Vec::new();
    if let Some(path) = executable_from_env {
        executable_candidates.push(path);
    }
    if let Some(path) = resource.as_ref() {
        executable_candidates.push(path.join("whisper-cli.exe"));
        executable_candidates.push(path.join("main.exe"));
    }
    executable_candidates.push(development.join("whisper-cli.exe"));
    executable_candidates.push(development.join("main.exe"));

    let mut model_candidates = Vec::new();
    if let Some(path) = model_from_env {
        model_candidates.push(path);
    }
    if let Some(path) = resource.as_ref() {
        model_candidates.push(path.join("ggml-base.bin"));
        model_candidates.push(path.join("ggml-small.bin"));
        model_candidates.push(path.join("ggml-tiny.bin"));
    }
    model_candidates.push(development.join("ggml-base.bin"));
    model_candidates.push(development.join("ggml-small.bin"));
    model_candidates.push(development.join("ggml-tiny.bin"));

    SpeechPaths {
        executable: first_existing(executable_candidates),
        model: first_existing(model_candidates),
    }
}

#[tauri::command]
pub fn speech_capabilities(app: tauri::AppHandle) -> SpeechCapabilities {
    let paths = discover_paths(&app);
    SpeechCapabilities {
        asr_ready: paths.executable.is_some() && paths.model.is_some(),
        engine: "whisper.cpp",
        model_path: paths.model.as_ref().map(|path| path.display().to_string()),
        executable_path: paths
            .executable
            .as_ref()
            .map(|path| path.display().to_string()),
    }
}

fn remove_temp(path: &Path) {
    let _ = fs::remove_file(path);
}

fn run_whisper(
    executable: &Path,
    model: &Path,
    wav_path: &Path,
    output_base: &Path,
) -> Result<String, String> {
    let mut command = Command::new(executable);
    command
        .arg("-m")
        .arg(model)
        .arg("-f")
        .arg(wav_path)
        .arg("-l")
        .arg("ru")
        .arg("-nt")
        .arg("-otxt")
        .arg("-of")
        .arg(output_base);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let output = command
        .output()
        .map_err(|error| format!("Не удалось запустить whisper.cpp: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "whisper.cpp завершился с ошибкой: {}",
            stderr.trim()
        ));
    }

    let transcript_path = output_base.with_extension("txt");
    let transcript = fs::read_to_string(&transcript_path)
        .map_err(|error| format!("Не удалось прочитать транскрипцию: {error}"))?;
    remove_temp(&transcript_path);
    Ok(transcript.trim().to_owned())
}

#[tauri::command]
pub async fn transcribe_wav(app: tauri::AppHandle, wav_base64: String) -> Result<String, String> {
    let paths = discover_paths(&app);
    let executable = paths
        .executable
        .ok_or_else(|| "Не найден models/whisper/whisper-cli.exe".to_owned())?;
    let model = paths
        .model
        .ok_or_else(|| "Не найден models/whisper/ggml-base.bin".to_owned())?;
    if wav_base64.len() > MAX_WAV_BYTES * 2 {
        return Err("Закодированная запись слишком длинная".to_owned());
    }
    let bytes = STANDARD
        .decode(wav_base64)
        .map_err(|_| "Не удалось декодировать аудио".to_owned())?;
    validate_wave(&bytes)?;

    tauri::async_runtime::spawn_blocking(move || {
        let token = Uuid::new_v4();
        let wav_path = env::temp_dir().join(format!("boxgirl-{token}.wav"));
        let output_base = env::temp_dir().join(format!("boxgirl-{token}-result"));
        fs::write(&wav_path, bytes)
            .map_err(|error| format!("Не удалось сохранить временное аудио: {error}"))?;
        let result = run_whisper(&executable, &model, &wav_path, &output_base);
        remove_temp(&wav_path);
        remove_temp(&output_base.with_extension("txt"));
        result
    })
    .await
    .map_err(|error| format!("ASR worker завершился аварийно: {error}"))?
}
