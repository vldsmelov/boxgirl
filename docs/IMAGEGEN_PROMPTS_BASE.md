# Base model image-generation brief

The accepted base was produced with the built-in image generator in identity-preserving edit mode. Every edit used an existing accepted BoxGirl pose as the visual reference.

## Neutral master

Preserve BoxGirl's adult face, green eyes, light-blonde shoulder-length hair, natural anime proportions, exact camera, crop, pose, hands, lighting, and 1024×1536 composition. Replace the visible outfit with the smallest practical seamless strapless two-piece technical underlayer in a warm skin-adjacent peach-beige. It must read as plain fabric, have no straps, logos, lace, transparency, intimate details, or sexualized pose. Keep natural adult anatomy and cel-shaded rendering; do not turn the character into a plastic doll.

## Pose masters

Use the accepted neutral base and the corresponding accepted clothed semantic frame as references. Preserve identity, body proportions, garment coverage, canvas coordinates, and point-rig landmarks. Change only the requested pose, gesture, head direction, or facial expression. The technical underlayer must keep the same cut, color, seams, and edge locations wherever the body pose permits.

## Blink and expression variants

Preserve every non-face pixel. Change only eyelids, eyebrows, mouth, and the minimum local facial shading required by the target emotion. No changes to hair silhouette, shoulders, torso, hands, technical underlayer, crop, or background.

The base presentation is retained in `main` as a typed-only QA surface; public outfits remain independent full-frame generations. `private-playful.png` is the corrected asymmetric wink pose in a conservative opaque technical alignment bodysuit. The previous frontal mannequin pose is preserved byte-for-byte as `private-playful-alt.png` and is invoked only by the exact typed command `боньк2`.

The accepted corrected pose was produced with the built-in image generator from the approved hoodie `private-playful` frame. Final prompt intent: preserve the exact adult BoxGirl identity, three-quarter pose, wink, hands and cel shading; replace only the outfit with a plain opaque warm-beige strapless technical alignment bodysuit covering the torso through mid-thigh; return a clean transparent 1024×1536 sprite. A separate background-extraction edit removed the baked checkerboard; alpha edges were reviewed on white, dark and checkerboard backgrounds.
