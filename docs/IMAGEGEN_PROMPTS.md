# Image generation provenance — archived V1 experiments

> Этот файл сохраняет историю первой, отклонённой попытки с alpha extraction и clip-mask puppet. Production-набор V2 и принятые промпты документированы в [IMAGEGEN_PROMPTS_V2.md](IMAGEGEN_PROMPTS_V2.md).

Режим: встроенный `imagegen`, identity-preserving edit. Все результаты сохранены как проектные ассеты, фон дополнительно преобразован из нейтральной checkerboard-подложки в настоящий alpha-канал.

## Thinking pose

```text
Use case: identity-preserve
Asset type: alternate animation pose for the BoxGirl desktop avatar
Input images: Image 1 is the exact character identity and style reference and the edit target
Primary request: create a thinking pose of the same BoxGirl character. Change only her pose and subtle expression: one hand rests naturally near her chin, the other arm is relaxed across her lower torso, her head tilts slightly, eyes look gently upward to one side, eyebrows show focused curiosity, mouth remains a small neutral thoughtful smile.
Scene/backdrop: genuinely transparent background
Subject: preserve the exact same adult woman, facial identity, light ash-blonde shoulder-length hairstyle, green eyes, cream oversized hoodie with peach details, body proportions and waist-up framing
Style/medium: preserve the exact clean anime cel-shading, line weight, rendering density, palette and lighting of Image 1
Composition/framing: identical 1024x1536 portrait canvas, character aligned to the same head and torso scale, complete silhouette and hands inside canvas
Constraints: edit only pose and expression; preserve identity, face, hairstyle, outfit design, colors, proportions, rendering style and transparent alpha; single character; no text; no logo; no watermark
Avoid: redesign, new accessories, different clothes, cropped hands, childlike appearance, chibi, background, extra limbs, pose identical to Image 1
```

## Celebration pose

```text
Use case: identity-preserve
Asset type: alternate animation pose for the BoxGirl desktop avatar
Input images: Image 1 is the exact character identity and style reference and the edit target
Primary request: create a joyful small celebration pose of the same BoxGirl character. Change only her pose and expression: both forearms lift naturally near shoulder level, hands open in a delighted but restrained cheer, shoulders rise slightly, head tilts with a bright warm closed-mouth smile, eyes joyful and engaged. The reaction should feel like a smart friendly assistant celebrating good news, not an exaggerated idol pose.
Scene/backdrop: genuinely transparent background
Subject: preserve the exact same adult woman, facial identity, light ash-blonde shoulder-length hairstyle, green eyes, cream oversized hoodie with peach details, body proportions and waist-up framing
Style/medium: preserve the exact clean anime cel-shading, line weight, rendering density, palette and lighting of Image 1
Composition/framing: identical 1024x1536 portrait canvas, character aligned to the same head and torso scale, complete silhouette and both hands inside canvas
Constraints: edit only pose and joyful expression; preserve identity, face, hairstyle, outfit design, colors, proportions, rendering style and transparent alpha; single character; no text; no logo; no watermark
Avoid: redesign, new accessories, different clothes, cropped hands, childlike appearance, chibi, background, extra limbs, extreme open mouth, pose identical to Image 1
```

## Background cleanup

```text
Use case: asset-cleanup
Asset type: transparent-background master character pose
Input images: Image 1 is the exact edit target
Primary request: remove the entire dark brown vignette, glow, shadow, and every background pixel. Replace the whole area outside the character with a plain light gray-and-white checkerboard transparency preview, with crisp separation around all hair wisps, fingers, sleeves, and hoodie hem. Preserve the character itself exactly.
Scene/backdrop: only a uniform small light gray-and-white checkerboard outside the character, suitable for deterministic transparency extraction; no dark pixels, no colored vignette, no cast shadow, no glow, no halo
Subject: unchanged adult anime woman in her friendly explanatory pose
Style/medium: exact source style, identity, face, palette, linework and rendering; no repainting or redesign
Composition/framing: exact 1024x1536 canvas, scale, pose and alignment
Constraints: background cleanup only; preserve identity and the complete character; single character; no text; no logo; no watermark
Avoid: brown or black background, gradient background, colored backdrop, cropped hands, missing hair strands, changed face, altered pose or clothes
```

Для двух дополнительных поз использовался тот же cleanup-проход с требованием сохранить соответствующую позу без изменений и удалить checkerboard, vignette, shadow, glow и halo.
