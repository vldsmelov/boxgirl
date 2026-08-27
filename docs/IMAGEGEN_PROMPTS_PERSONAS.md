# BoxGirl hacker, office and sleep — image generation provenance

Все изображения созданы встроенным `imagegen` в режиме identity-preserving raster edit. Принятые PNG-мастера имеют размер 1024×1536 и находятся в:

- `art/boxgirl-v6-hacker/masters`;
- `art/boxgirl-v7-office/masters`;
- `art/boxgirl-v8-sleep/masters`.

## Визуальные контракты

### Hacker

> Preserve the established clearly adult BoxGirl identity and green eyes. Render graphite-black techwear: an opaque structured corset-inspired crop top, asymmetric cropped charcoal jacket off one shoulder, high-waist technical trousers, slim utility belt, sparse cyan and muted-violet piping. Preserve a clearly tied high dynamic blonde ponytail, one thin side braid feeding into it, side-swept fringe, cyber ear-cuff headset, geometric studs, smoky plum makeup, berry lipstick and glossy near-black plum manicure. No glasses, weapons, screens, code or text.

### Office

> Preserve the established clearly adult BoxGirl identity and green eyes. Render a deep wine-burgundy satin blouse with clean open collar and secure tasteful low neckline, fitted charcoal-black blazer and high-waist pencil skirt. Preserve a sleek polished low chignon with deep side part and two face-framing strands, thin black/rose-gold cat-eye prescription glasses with transparent symmetric lenses, rose-gold studs, understated watch, red lipstick and burgundy manicure.

### Sleep

> Preserve the established clearly adult BoxGirl identity and green eyes. Render a dusty-rose and soft-lavender satin peignoir with delicate lace, airy semi-sheer sleeves only and a fully opaque matching camisole/nightdress, loosely tied belt. Preserve soft bedtime waves in a loose low side braid, a quilted lavender sleep mask pushed onto the forehead like a headband with a tiny pink bunny silhouette, pearl studs, natural rosy makeup and pale-pink manicure.

## Семантические кадры

Для каждого образа исходный кадр `art/boxgirl-v4-gym/masters/<semantic-id>.png` задавал позу, жест, руки, эмоцию и кадрирование, а принятый neutral соответствующего образа задавал identity, одежду, причёску и аксессуары. Были отдельно приняты 16 уникальных поз: `neutral`, `joy`, `listening`, `thinking`, `concern`, `confused`, `surprise`, `sadness`, `private-playful`, `nod-down`, `shake-left`, `shake-right`, `wave`, `explain-left`, `explain-right`, `celebrate`.

Blink-компаньоны создавались из соответствующего принятого open-eye кадра:

> Change only both eyes to a natural fully closed simultaneous blink. Preserve brows and mouth; pixel-lock identity, body, hands, manicure, outfit folds, hairstyle, accessories, lighting, framing and background. No wink, pose drift, anatomy change, wardrobe change or missing accessory.

Особые lock-условия: высокий хвост и side braid для hacker, обе прозрачные линзы и низкий chignon для office, маска строго на лбу и боковая коса для sleep.

## Runtime alpha

Для всех трёх образов фон удалён отдельным identity-preserving edit: сервис возвращал либо настоящий alpha, либо нейтральную checkerboard-подложку. `scripts/normalize-imagegen-avatar-alpha.ps1` приводит оба варианта к проверенному RGBA-мастеру, восстанавливает светлые внутренние детали лица, которые могут быть ошибочно приняты за checkerboard (зубы и блики), а manifest требует `sourceAlphaRequired`. Поэтому тёмная одежда, тонкие волосы, очки, маска и лицо не зависят от runtime color-key; отдельный `faceFeatureAlphaProtection` gate блокирует регрессию до сборки приложения.
