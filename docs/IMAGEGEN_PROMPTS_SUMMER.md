# BoxGirl summer outfit — image generation provenance

Mode: built-in `imagegen`, identity-preserving image-edit workflow. Accepted PNG masters are stored in `art/boxgirl-v3-summer/masters`; optimized runtime copies are in `public/assets/avatar-v3-summer/webp` and `webp-rig`.

## Final prompt set

For `neutral.png`, the hoodie neutral master was used as the exact identity, composition and rendering reference:

> Identity-preserving production edit of the attached BoxGirl frame. Keep exactly the same mature adult anime woman, face, green eyes, shoulder-length light-blonde hair, anatomy, body and bust proportions, hands, pose, expression, camera, crop, lighting, cel-shaded rendering and dark studio backdrop. Replace only the hoodie with a tasteful fitted warm-ivory ribbed sleeveless tank top, peach-pink trim around the neckline and armholes, and a small cute original pink bunny-head emblem with a heart-shaped nose centered on the fabric at chest level. Add matching cream shorts only where the lower crop reveals them. No hoodie, hood, sleeves, drawstrings or kangaroo pocket. The emblem must read as printed fabric art and follow the cloth perspective. No text, watermark or extra accessories. Non-explicit, polished commercial anime assistant character art.

For every remaining open-eye semantic frame, its matching hoodie frame was the exact pose/expression reference and the accepted summer neutral frame was the outfit/style anchor. The same prompt was used with this additional constraint:

> Preserve the exact pose, gesture, hand and finger placement, facial expression, head angle and crop from the source semantic frame. Match the summer outfit construction, trim, bunny emblem design and rendering from the outfit anchor.

For blink variants, the matching hoodie blink frame supplied exact eyelids/pose and the corresponding accepted summer open-eye frame supplied outfit and identity continuity:

> Change only the eyelids to the exact closed-eye expression of the blink reference. Preserve the accepted summer frame's outfit, bunny emblem, face, hair, anatomy, pose, hands, crop, lighting and background pixel-consistently wherever possible.

All 24 results were generated as complete coherent frames rather than compositing clothing over the old raster. Runtime conversion uses WebP quality 94; asset QA requires at least 42 dB PSNR and validates alpha-backed rig frames.
