pub(crate) const MAX_WAV_BYTES: usize = 32 * 1024 * 1024;

pub(crate) fn validate_wave(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Аудио не является PCM WAV".to_owned());
    }
    if bytes.len() > MAX_WAV_BYTES {
        return Err("Запись слишком длинная".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wave_header() -> Vec<u8> {
        let mut bytes = vec![0_u8; 44];
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[8..12].copy_from_slice(b"WAVE");
        bytes
    }

    #[test]
    fn accepts_a_pcm_wave_header() {
        assert!(validate_wave(&wave_header()).is_ok());
    }

    #[test]
    fn rejects_non_wave_input() {
        assert!(validate_wave(b"not audio").is_err());
    }

    #[test]
    fn rejects_an_oversized_recording() {
        let mut bytes = wave_header();
        bytes.resize(MAX_WAV_BYTES + 1, 0);
        assert!(validate_wave(&bytes).is_err());
    }
}
