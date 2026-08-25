# BoxGirl gym outfit — image generation provenance

Mode: built-in `imagegen`, identity-preserving edit workflow. Accepted PNG masters are stored in `art/boxgirl-v4-gym/masters`; optimized runtime copies are in `public/assets/avatar-v4-gym/webp` and `webp-rig`.

## Final prompt set

The neutral summer master was the exact identity, composition and rendering edit target:

> Replace only the current clothing with a tasteful coordinated gym outfit: a fitted dusty-peach sleeveless athletic crop top with supportive wide shoulder straps, modest rounded neckline, warm-ivory piping and a small original pink bunny-head fabric emblem centered at chest level; matching dark muted-sage athletic shorts with a smooth mid-rise waistband below the navel. Preserve the exact clearly adult 21+ BoxGirl identity, face, green eyes, hair, anatomy, body and bust proportions, pose, hands, camera, crop, lighting, cel-shading and dark studio backdrop. Show a healthy naturally toned abdomen with only a subtle center line and faint upper-ab definition. Opaque athletic fabric; tasteful and non-explicit. Avoid lingerie styling, extreme cleavage, hyper-muscular abs, oily skin, pin-up posing, childlike proportions, text, watermark, accessories and character redesign.

Every remaining open-eye semantic frame used its matching summer master as the exact pose/expression/gesture target and the accepted gym neutral master as outfit anchor:

> Change only clothing and the newly exposed midriff. Preserve the source frame's exact expression, head angle, gesture, hand and finger placement, anatomy, camera and crop. Match the gym anchor's top construction, hem height, piping, bunny emblem, shorts waistband, palette and restrained abdominal definition.

Each blink variant used the matching summer blink frame as closed-eyelid reference and the accepted gym open-eye frame as the exact edit target:

> Change only the eyelids to naturally fully closed anime eyelids. Keep the accepted gym frame pixel-consistent everywhere else, including brow/mouth expression, clothing, logo, abdomen, pose, hands, lighting, backdrop and crop.

All 24 outputs are coherent complete frames, not clothing overlays. Runtime conversion uses WebP quality 94 and a 42 dB minimum PSNR gate.
