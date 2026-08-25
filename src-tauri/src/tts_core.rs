pub const MAX_TTS_CHARS: usize = 2_000;
pub const ALLOWED_SAMPLE_RATES: [u32; 3] = [8_000, 24_000, 48_000];
pub const ALLOWED_SPEAKERS: [&str; 3] = ["xenia", "kseniya", "baya"];

pub fn validate_request(text: &str, speaker: &str, sample_rate: u32) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Текст для озвучивания пуст".to_owned());
    }
    if text.chars().count() > MAX_TTS_CHARS {
        return Err(format!("Текст длиннее {MAX_TTS_CHARS} символов"));
    }
    if !ALLOWED_SPEAKERS.contains(&speaker) {
        return Err(format!("Неизвестный голос Silero: {speaker}"));
    }
    if !ALLOWED_SAMPLE_RATES.contains(&sample_rate) {
        return Err(format!("Неподдерживаемая частота: {sample_rate} Гц"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_request() {
        assert!(validate_request("Привет", "xenia", 48_000).is_ok());
    }

    #[test]
    fn rejects_unknown_speaker_and_sample_rate() {
        assert!(validate_request("Привет", "unknown", 48_000).is_err());
        assert!(validate_request("Привет", "xenia", 44_100).is_err());
    }

    #[test]
    fn enforces_text_limit_by_characters() {
        assert!(validate_request(&"я".repeat(MAX_TTS_CHARS), "baya", 24_000).is_ok());
        assert!(validate_request(&"я".repeat(MAX_TTS_CHARS + 1), "baya", 24_000).is_err());
    }
}
