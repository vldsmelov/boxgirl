# BoxGirl Avatar V2 — image generation provenance

Mode: built-in `imagegen`, image-edit workflow. The original project concept was used only as a visual reference; every accepted production frame was regenerated as a coherent full-frame image. PNG masters are stored in `art/boxgirl-v2/masters`; optimized WebP runtime copies are in `public/assets/avatar-v2/webp`.

## Canonical master

Create an original, polished waist-up portrait of the same clearly adult anime assistant. Preserve light warm-blonde shoulder-length layered hair, green eyes, cream oversized hoodie, peach cuffs and drawstrings, clean cel-shading, calm friendly intelligence, symmetrical front camera, and natural adult proportions. Use a restrained dark plum studio vignette with no objects or text. Both hands must be fully visible and anatomically correct, resting naturally one over the other at the lower abdomen. Exactly two arms and two hands, five fingers per hand, no tangencies, no fused fingers, no cropped anatomy, no transparent checkerboard.

## Accepted variation template

For every derivative, preserve the exact same adult character identity, face, hairstyle, hoodie construction, palette, line weight, lighting, 1024×1536 canvas, centered waist-up framing, camera and dark plum studio background. Change only the requested expression or arm pose. Keep hands anatomically correct with exactly five fingers; never add text, props, extra limbs or decorative symbols.

Accepted requests:

- `blink`: close both eyelids naturally; preserve the neutral body and hands.
- `joy`: clearly readable warm open-mouth smile, tiny clean hint of upper teeth, lifted cheeks, bright open eyes and restrained blush.
- `joy-blink`: precision edit of `joy`; retain its smile and change only both eyes to naturally closed eyelids.
- `listening`: attentive eye contact, very slight forward lean and gentle head tilt; hands remain layered at the abdomen.
- `listening-blink`: precision edit of `listening`; change only both eyes to naturally closed eyelids.
- `thinking`: one forearm supports the opposite elbow; the supported hand touches the chin lightly; gaze slightly upward.
- `thinking-blink`: precision edit of `thinking`; change only both eyes to naturally closed eyelids.
- `nod-down`: neutral-body precision edit with only the head/chin lowered about five degrees and eyes softly narrowed.
- `shake-left`, `shake-right`: registered neutral-body keyframes with only the head turned about six degrees to either side.
- `wave`: one raised open palm in a compact friendly greeting; the other hand rests at the abdomen.
- `explain-left`: one open presenting palm on the viewer's left; the other hand rests low.
- `explain-right`: mirrored presenting gesture on the viewer's right; the other hand rests low.
- `celebrate`: two compact relaxed fists near the chest, brighter smile, contained happy energy.
- `concern`: empathetic brows and soft mouth; one hand over the heart and the other supporting below.
- `concern-blink`: precision eye-only edit of `concern`.
- `confused`: mild puzzled expression and a balanced two-palm shrug.
- `confused-blink`: precision eye-only edit of `confused`; the first over-sad attempt was rejected.
- `surprise`: widened eyes, small open mouth and both hands raised close to the chest.
- `surprise-blink`: precision eye-only edit of `surprise` while retaining its raised brows and open mouth.
- `sadness`: lowered gaze, restrained sad expression and quiet layered hands.
- `sadness-blink`: precision eye-only edit of `sadness`.

## Rejection policy

Outputs are rejected if identity, camera scale, background, clothing construction or resting-hand position changes unexpectedly; if fingers merge or multiply; if anatomy is cropped; or if a supposedly local edit repaints the whole frame. A generated wave in-between was rejected under this policy and was not copied into the project.
