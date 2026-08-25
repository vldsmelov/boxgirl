mod llm_core;
mod speech_core;
mod tts_core;

#[cfg(all(feature = "desktop", not(test)))]
mod llm;

#[cfg(all(feature = "desktop", not(test)))]
mod speech;

#[cfg(all(feature = "desktop", not(test)))]
mod tts;

#[cfg(all(feature = "desktop", not(test)))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(llm::LlmState::default())
        .manage(tts::SileroState::default())
        .invoke_handler(tauri::generate_handler![
            llm::llm_capabilities,
            llm::warm_llm,
            llm::complete_llm_turn,
            speech::speech_capabilities,
            speech::transcribe_wav,
            tts::silero_capabilities,
            tts::warm_silero,
            tts::synthesize_silero
        ])
        .run(tauri::generate_context!())
        .expect("error while running BoxGirl");
}

#[cfg(any(not(feature = "desktop"), test))]
pub fn run() {}
