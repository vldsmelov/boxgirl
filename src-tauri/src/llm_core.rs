#![cfg_attr(test, allow(dead_code))]

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

pub const MAX_INPUT_CHARS: usize = 2_000;
pub const MAX_HISTORY_MESSAGES: usize = 8;
pub const MAX_HISTORY_CHARS: usize = 6_000;
pub const MAX_SEGMENTS: usize = 3;
pub const MAX_SEGMENT_CHARS: usize = 700;
pub const MAX_TOTAL_RESPONSE_CHARS: usize = 1_600;

pub const EMOTION_IDS: [&str; 7] = [
    "neutral", "joy", "sadness", "concern", "surprise", "thinking", "confused",
];
pub const GESTURE_IDS: [&str; 8] = [
    "none",
    "wave",
    "nod",
    "shake_head",
    "explain_left",
    "explain_right",
    "shrug",
    "celebrate",
];
pub const VOICE_STYLES: [&str; 4] = ["neutral", "warm", "energetic", "soft"];

fn contains_any(value: &str, needles: &[&str]) -> bool {
    let normalized = value.to_lowercase();
    needles.iter().any(|needle| normalized.contains(needle))
}

fn is_greeting(value: &str) -> bool {
    contains_any(
        value,
        &[
            "привет",
            "здравств",
            "доброе утро",
            "добрый день",
            "добрый вечер",
        ],
    )
}

fn is_positive_news(value: &str) -> bool {
    contains_any(
        value,
        &[
            "получилось",
            "получила",
            "получил",
            "закончила",
            "закончил",
            "побед",
            "успех",
            "ура",
            "сдала",
            "сдал",
            "достиг",
        ],
    )
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratedEmotion {
    pub id: String,
    pub intensity: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedSegment {
    pub text: String,
    pub emotion: GeneratedEmotion,
    pub gesture: String,
    pub voice_style: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeneratedPlan {
    segments: Vec<GeneratedSegment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurn {
    pub version: u8,
    pub turn_id: String,
    pub segments: Vec<GeneratedSegment>,
}

pub fn has_mixed_script_word(turn: &AssistantTurn) -> bool {
    turn.segments.iter().any(|segment| {
        segment
            .text
            .split(|character: char| !character.is_alphabetic())
            .any(|word| {
                let has_latin = word
                    .chars()
                    .any(|character| character.is_ascii_alphabetic());
                let has_cyrillic = word
                    .chars()
                    .any(|character| matches!(character as u32, 0x0400..=0x052f));
                has_latin && has_cyrillic
            })
    })
}

const GENDERED_USER_WORDS: [&str; 50] = [
    "справился",
    "справилась",
    "сделал",
    "сделала",
    "смог",
    "смогла",
    "закончил",
    "закончила",
    "достиг",
    "достигла",
    "победил",
    "победила",
    "получил",
    "получила",
    "заслужил",
    "заслужила",
    "герой",
    "героиня",
    "невероятный",
    "невероятная",
    "прекрасный",
    "прекрасная",
    "лучший",
    "лучшая",
    "крутой",
    "крутая",
    "умный",
    "умная",
    "сильный",
    "сильная",
    "расстроен",
    "расстроена",
    "устал",
    "устала",
    "подавлен",
    "подавлена",
    "одинок",
    "одинока",
    "виноват",
    "виновата",
    "прав",
    "права",
    "занят",
    "занята",
    "готов",
    "готова",
    "уверен",
    "уверена",
    "рад",
    "рада",
];

fn words(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_alphabetic())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

fn user_stated_gender(value: &str) -> bool {
    let words = words(value);
    words.iter().enumerate().any(|(index, word)| {
        if word != "я" {
            return false;
        }
        words[index + 1..words.len().min(index + 5)]
            .iter()
            .any(|candidate| {
                GENDERED_USER_WORDS.contains(&candidate.as_str())
                    || matches!(
                        candidate.as_str(),
                        "мужчина" | "женщина" | "парень" | "девушка"
                    )
            })
    })
}

pub fn has_unprompted_user_gender(turn: &AssistantTurn, user_input: &str) -> bool {
    if user_stated_gender(user_input) {
        return false;
    }
    turn.segments.iter().any(|segment| {
        let words = words(&segment.text);
        words.iter().enumerate().any(|(index, word)| {
            if word != "ты" {
                return false;
            }
            let following = &words[index + 1..words.len().min(index + 5)];
            following.iter().enumerate().any(|(offset, candidate)| {
                if !GENDERED_USER_WORDS.contains(&candidate.as_str()) {
                    return false;
                }
                if matches!(candidate.as_str(), "герой" | "героиня") {
                    return following[..offset].iter().all(|between| {
                        matches!(
                            between.as_str(),
                            "молодец" | "настоящий" | "настоящая" | "просто"
                        )
                    });
                }
                true
            })
        })
    })
}

fn count_chars(value: &str) -> usize {
    value.chars().count()
}

pub fn validate_and_finalize_plan(
    content: &str,
    turn_id: String,
    user_input: &str,
) -> Result<AssistantTurn, String> {
    let mut plan: GeneratedPlan = serde_json::from_str(content)
        .map_err(|error| format!("LLM вернула некорректный JSON: {error}"))?;
    if plan.segments.is_empty() || plan.segments.len() > MAX_SEGMENTS {
        return Err(format!(
            "LLM вернула недопустимое число сегментов: {}",
            plan.segments.len()
        ));
    }

    let mut total_chars = 0;
    for segment in &mut plan.segments {
        segment.text = segment.text.trim().to_owned();
        let text_chars = count_chars(&segment.text);
        if text_chars == 0 || text_chars > MAX_SEGMENT_CHARS {
            return Err("LLM вернула пустой или слишком длинный сегмент".to_owned());
        }
        total_chars += text_chars;
        if total_chars > MAX_TOTAL_RESPONSE_CHARS {
            return Err("LLM вернула слишком длинный ответ".to_owned());
        }
        if !EMOTION_IDS.contains(&segment.emotion.id.as_str())
            || !segment.emotion.intensity.is_finite()
            || !(0.0..=1.0).contains(&segment.emotion.intensity)
        {
            return Err("LLM вернула недопустимую эмоцию".to_owned());
        }
        if !GESTURE_IDS.contains(&segment.gesture.as_str()) {
            return Err("LLM вернула недопустимый жест".to_owned());
        }
        if !VOICE_STYLES.contains(&segment.voice_style.as_str()) {
            return Err("LLM вернула недопустимый стиль голоса".to_owned());
        }

        if segment.gesture == "celebrate"
            && (segment.emotion.id != "joy" || !is_positive_news(user_input))
        {
            segment.gesture = "none".to_owned();
        }
        if matches!(segment.emotion.id.as_str(), "sadness" | "concern")
            && segment.voice_style == "energetic"
        {
            segment.voice_style = "soft".to_owned();
        }
    }

    // Short answers get one meaningful gesture; longer answers can use at most two distinct gestures.
    let gesture_limit = if total_chars <= 240 { 1 } else { 2 };
    let mut gesture_count = 0;
    let mut used_gestures = HashSet::new();
    for (index, segment) in plan.segments.iter_mut().enumerate() {
        if segment.gesture == "wave" && (index > 0 || !is_greeting(user_input)) {
            segment.gesture = "none".to_owned();
        }
        if segment.gesture == "none" {
            continue;
        }
        if gesture_count >= gesture_limit || !used_gestures.insert(segment.gesture.clone()) {
            segment.gesture = "none".to_owned();
        } else {
            gesture_count += 1;
        }
    }

    Ok(AssistantTurn {
        version: 1,
        turn_id,
        segments: plan.segments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(text: &str, emotion: &str, gesture: &str, voice_style: &str) -> String {
        format!(
            r#"{{"text":"{text}","emotion":{{"id":"{emotion}","intensity":0.6}},"gesture":"{gesture}","voiceStyle":"{voice_style}"}}"#
        )
    }

    #[test]
    fn accepts_a_valid_plan_and_owns_turn_metadata() {
        let content = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Привет!", "joy", "wave", "warm")
        );
        let turn = validate_and_finalize_plan(&content, "turn-7".to_owned(), "Привет!").unwrap();
        assert_eq!(turn.version, 1);
        assert_eq!(turn.turn_id, "turn-7");
        assert_eq!(turn.segments[0].gesture, "wave");
    }

    #[test]
    fn rejects_unknown_semantics_and_fields() {
        let bad_emotion = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Тест", "angry", "none", "warm")
        );
        assert!(validate_and_finalize_plan(&bad_emotion, "a".to_owned(), "Тест").is_err());
        let extra = r#"{"segments":[],"command":"ParamAngleX"}"#;
        assert!(validate_and_finalize_plan(extra, "b".to_owned(), "Тест").is_err());
    }

    #[test]
    fn limits_gestures_for_short_answers() {
        let content = format!(
            r#"{{"segments":[{},{}]}}"#,
            segment("Сначала посмотрим.", "neutral", "explain_left", "warm"),
            segment("Затем решим.", "neutral", "nod", "warm")
        );
        let turn = validate_and_finalize_plan(&content, "c".to_owned(), "Помоги подумать").unwrap();
        assert_eq!(turn.segments[0].gesture, "explain_left");
        assert_eq!(turn.segments[1].gesture, "none");
    }

    #[test]
    fn fixes_semantic_conflicts_without_exposing_rig_controls() {
        let content = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Мне жаль.", "concern", "celebrate", "energetic")
        );
        let turn = validate_and_finalize_plan(&content, "d".to_owned(), "Мне жаль").unwrap();
        assert_eq!(turn.segments[0].gesture, "none");
        assert_eq!(turn.segments[0].voice_style, "soft");
    }

    #[test]
    fn removes_contextually_wrong_one_shot_gestures() {
        let wave = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Вот две причины.", "joy", "wave", "warm")
        );
        let turn = validate_and_finalize_plan(&wave, "e".to_owned(), "Назови две причины").unwrap();
        assert_eq!(turn.segments[0].gesture, "none");

        let celebrate = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Отлично!", "joy", "celebrate", "energetic")
        );
        let turn = validate_and_finalize_plan(&celebrate, "f".to_owned(), "Почему трава зелёная?")
            .unwrap();
        assert_eq!(turn.segments[0].gesture, "none");
    }

    #[test]
    fn detects_only_contiguous_mixed_script_words() {
        let malformed = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Это рассеяние РэYLEИса.", "thinking", "none", "neutral")
        );
        let turn = validate_and_finalize_plan(&malformed, "g".to_owned(), "Почему?").unwrap();
        assert!(has_mixed_script_word(&turn));

        let technical = format!(
            r#"{{"segments":[{}]}}"#,
            segment(
                "JSON-объект и BoxGirl корректны.",
                "neutral",
                "none",
                "neutral"
            )
        );
        let turn = validate_and_finalize_plan(&technical, "h".to_owned(), "Что это?").unwrap();
        assert!(!has_mixed_script_word(&turn));
    }

    #[test]
    fn detects_unprompted_gendered_address_but_respects_user_context() {
        let gendered = format!(
            r#"{{"segments":[{}]}}"#,
            segment(
                "Ты справилась с проектом — настоящий герой!",
                "joy",
                "none",
                "warm"
            )
        );
        let turn = validate_and_finalize_plan(
            &gendered,
            "i".to_owned(),
            "У меня получилось закончить проект",
        )
        .unwrap();
        assert!(has_unprompted_user_gender(
            &turn,
            "У меня получилось закончить проект"
        ));
        assert!(!has_unprompted_user_gender(
            &turn,
            "Я сегодня справилась с проектом"
        ));

        let praise = format!(
            r#"{{"segments":[{}]}}"#,
            segment("Ты просто невероятная!", "joy", "none", "warm")
        );
        let turn =
            validate_and_finalize_plan(&praise, "praise".to_owned(), "У меня получилось").unwrap();
        assert!(has_unprompted_user_gender(&turn, "У меня получилось"));

        let concern = format!(
            r#"{{"segments":[{}]}}"#,
            segment(
                "Слышу, что ты сегодня очень расстроен.",
                "concern",
                "none",
                "soft"
            )
        );
        let turn =
            validate_and_finalize_plan(&concern, "concern".to_owned(), "Мне грустно").unwrap();
        assert!(has_unprompted_user_gender(&turn, "Мне грустно"));

        let neutral = format!(
            r#"{{"segments":[{}]}}"#,
            segment("У тебя отлично получилось!", "joy", "none", "warm")
        );
        let turn =
            validate_and_finalize_plan(&neutral, "j".to_owned(), "У меня получилось").unwrap();
        assert!(!has_unprompted_user_gender(&turn, "У меня получилось"));
    }
}
