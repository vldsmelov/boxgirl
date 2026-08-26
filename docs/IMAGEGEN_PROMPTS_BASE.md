# Base model image-generation brief

The accepted base was produced with the built-in image generator in identity-preserving edit mode. Every edit used an existing accepted BoxGirl pose as the visual reference.

## Neutral master

Preserve BoxGirl's adult face, green eyes, light-blonde shoulder-length hair, natural anime proportions, exact camera, crop, pose, hands, lighting, and 1024×1536 composition. Replace the visible outfit with the smallest practical seamless strapless two-piece technical underlayer in a warm skin-adjacent peach-beige. It must read as plain fabric, have no straps, logos, lace, transparency, intimate details, or sexualized pose. Keep natural adult anatomy and cel-shaded rendering; do not turn the character into a plastic doll.

## Pose masters

Use the accepted neutral base and the corresponding accepted clothed semantic frame as references. Preserve identity, body proportions, garment coverage, canvas coordinates, and point-rig landmarks. Change only the requested pose, gesture, head direction, or facial expression. The technical underlayer must keep the same cut, color, seams, and edge locations wherever the body pose permits.

## Blink and expression variants

Preserve every non-face pixel. Change only eyelids, eyebrows, mouth, and the minimum local facial shading required by the target emotion. No changes to hair silhouette, shoulders, torso, hands, technical underlayer, crop, or background.

Six unreliable or blocked generations are intentionally represented by semantic aliases in `layered.manifest.json`; point-rig motion still supplies their movement. A generated frame is never accepted merely to fill a slot.
