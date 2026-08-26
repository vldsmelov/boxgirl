# Layered avatar asset pipeline

BoxGirl uses one semantic frame contract for every presentation: 24 runtime frames mapped to 16 physical poses. Clothes are authored as reusable layers, but composition happens before the application starts. The renderer still samples one current and one previous WebP texture and keeps at most four textures resident.

## Source layout

```text
art/
  boxgirl-base-v1/masters/<semantic-frame>.png
  boxgirl-outfits-v1/<outfit>/back/<pose>.png
  boxgirl-outfits-v1/<outfit>/front/<pose>.png
  boxgirl-layered-v1/layered.manifest.json
public/assets/avatar-layered-v1/<presentation>/{webp,webp-rig}/
```

The composition order is `back -> base -> front`. A front layer is mandatory for every pose of a presentation declared as `layered`; a back layer is optional. Source clothing layers must be real 1024×1536 RGBA images, contain both visible and transparent pixels, and leave the protected face/hair region empty. Opaque checkerboard previews are rejected.

Run the strict build and QA before packaging:

```powershell
npm run build:layered-avatar
npm run qa:layered-avatar
```

`build:layered-avatar:partial` exists only for local asset iteration. A partial manifest is rejected by the normal QA command.

## Runtime contract

`AvatarOutfitId` contains only `hoodie`, `summer`, and `gym`. `AvatarPresentationId` additionally contains `base-debug`, which is deliberately absent from the assistant schema and persisted outfit setting.

An exact typed command `отладка` toggles the technical base. Case and surrounding whitespace are ignored; punctuation, longer phrases, and speech recognition do not activate it. The commands `жарко`, `холодно`, and `тренировка` leave debug mode and select a public outfit. A debug presentation is never used as an automatic error fallback; the safe fallback is `hoodie/neutral`.

## Current migration state

The shared minimal strapless base and all three public outfits are compiled through the layered pipeline. Each outfit has 16 aligned front-layer masters; a back layer is emitted only when clothing genuinely belongs behind the base. The previous full-frame sets remain in their original asset directories as rollback material and as extraction provenance, but runtime URLs point only at `avatar-layered-v1`.

The accepted clothes masks were bootstrapped with the asset-only parser in `scripts/extract-outfit-layers.py`. It uses the pinned [`mattmdjaga/segformer_b2_clothes`](https://huggingface.co/mattmdjaga/segformer_b2_clothes) checkpoint and keeps only clothing classes, so face, hair, skin, arms, and hands cannot be copied from a legacy composite into a garment master. This tool is not invoked by application builds; reviewed PNG masters are committed instead.

Six semantic slots currently use deliberate pose aliases recorded in `baseAliases`: `private-playful`, `nod-down`, and four blink variants. Point-rig motion remains active for those slots, while the alias prevents a missing or visually unstable generated frame from reaching the product.

Known visual debt: `private-playful` currently aliases the `joy` artwork, so the technical base does not have the intended authored `bonk` pose. Before reviving this branch, replace that alias with a separately accepted `private-playful.png` while keeping the existing point-rig timing.
