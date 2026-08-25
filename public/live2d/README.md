# Live2D runtime placeholder

Официальный Cubism Core и экспортированная модель намеренно не включены в репозиторий.

1. Скачайте Cubism SDK for Web с официального сайта Live2D.
2. Поместите Core в `public/live2d/Core/`.
3. Экспортируйте модель в `public/live2d/Resources/BoxGirl/`.
4. Сверьте имена expressions/motions с `public/avatar/model.manifest.json`.

До появления этих файлов приложение использует curated WebP-кадры из `public/assets/avatar-v2/webp`; исходные PNG лежат в `art/boxgirl-v2/masters`.
