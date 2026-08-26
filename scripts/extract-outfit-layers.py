"""Asset-time clothes extraction for the layered BoxGirl pipeline.

This tool is intentionally not part of the application runtime. It uses a pinned
human-parsing checkpoint to remove skin, face, hair, and hands from accepted
precomposed outfit frames, producing aligned RGBA garment layers for review.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as functional
from PIL import Image, ImageFilter
from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation


MODEL_ID = "mattmdjaga/segformer_b2_clothes"
MODEL_REVISION = "584abc1e1d260e23c0fc627c5217a09b2b461046"
CLOTHING_LABELS = (4, 5, 6, 7, 8, 17)  # upper, skirt, pants, dress, belt, scarf
OUTFIT_UNDERLAY_COLORS = {
    "hoodie": ((241, 228, 209), (241, 228, 209)),
    "summer": ((244, 236, 224), (236, 224, 208)),
    "gym": ((224, 145, 128), (105, 110, 76)),
}
OUTFIT_UNDERLAY_REGIONS = {
    "hoodie": ((190, 650, 834, 1000), (190, 1000, 834, 1390)),
    "summer": (None, None),
    "gym": ((250, 650, 774, 1000), None),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("art/boxgirl-layered-v1/layered.manifest.json"),
    )
    parser.add_argument("--outfit", choices=("hoodie", "summer", "gym"), action="append")
    parser.add_argument("--pose", action="append", help="Only extract these pose IDs")
    return parser.parse_args()


def absolute_from(parent: Path, value: str) -> Path:
    return (parent / value).resolve()


def choose_source_frame(
    pose_id: str,
    semantic_frames: list[str],
    pose_map: dict[str, str],
    base_aliases: dict[str, str],
) -> str:
    if pose_id in base_aliases:
        return base_aliases[pose_id]
    if pose_id in semantic_frames:
        return pose_id
    return next(frame for frame in semantic_frames if pose_map[frame] == pose_id)


def parse_labels(
    image: Image.Image,
    processor: AutoImageProcessor,
    model: AutoModelForSemanticSegmentation,
) -> torch.Tensor:
    rgb = Image.new("RGB", image.size, (27, 23, 29))
    rgb.paste(image.convert("RGB"), mask=image.getchannel("A"))
    inputs = processor(images=rgb, return_tensors="pt")
    with torch.inference_mode():
        logits = model(**inputs).logits
        logits = functional.interpolate(logits, size=(image.height, image.width), mode="bilinear", align_corners=False)
        return logits.argmax(dim=1)[0]


def label_mask(labels: torch.Tensor, selected_labels: tuple[int, ...]) -> torch.Tensor:
    selected = torch.zeros_like(labels, dtype=torch.bool)
    for label in selected_labels:
        selected.logical_or_(labels == label)
    return selected


def clothing_mask(labels: torch.Tensor) -> Image.Image:
    with torch.inference_mode():
        binary = label_mask(labels, CLOTHING_LABELS).to(torch.float32)[None, None]
        closed = torch.max_pool2d(binary, 9, stride=1, padding=4)
        closed = -torch.max_pool2d(-closed, 9, stride=1, padding=4)
        opened = -torch.max_pool2d(-closed, 5, stride=1, padding=2)
        opened = torch.max_pool2d(opened, 5, stride=1, padding=2)
    mask = Image.fromarray((opened[0, 0] >= 0.5).to(torch.uint8).cpu().numpy() * 255)
    # Subpixel feathering keeps anti-aliased textile edges without swallowing hands.
    return mask.filter(ImageFilter.GaussianBlur(0.65))


def intersect_mask(mask: Image.Image, region: tuple[int, int, int, int]) -> Image.Image:
    region_mask = Image.new("L", mask.size, 0)
    region_mask.paste(255, region)
    return Image.composite(mask, Image.new("L", mask.size, 0), region_mask)


def merge_layers(back: Image.Image, front: Image.Image) -> Image.Image:
    result = back.copy()
    result.alpha_composite(front)
    return result


def apply_mask(source: Image.Image, mask: Image.Image) -> Image.Image:
    alpha = Image.new("L", source.size)
    alpha_data = torch.from_numpy(np.array(source.getchannel("A"), copy=True)).to(torch.int32)
    mask_data = torch.from_numpy(np.array(mask, copy=True)).to(torch.int32)
    merged = ((alpha_data * mask_data) // 255).to(torch.uint8).numpy()
    alpha.paste(Image.fromarray(merged))
    result = source.copy()
    result.putalpha(alpha)
    return result


def tint_masked_base(source: Image.Image, mask: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    luminance = np.asarray(source.convert("L"), dtype=np.float32) / 255.0
    shade = 0.74 + 0.34 * luminance
    target = np.asarray(color, dtype=np.float32)[None, None, :]
    rgb = np.clip(target * shade[:, :, None], 0, 255).astype(np.uint8)
    alpha = np.asarray(mask, dtype=np.uint16)
    alpha = ((alpha * np.asarray(source.getchannel("A"), dtype=np.uint16)) // 255).astype(np.uint8)
    result = Image.fromarray(np.dstack((rgb, alpha)))
    return result


def build_base_underlay(
    source: Image.Image,
    labels: torch.Tensor,
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
    top_region: tuple[int, int, int, int] | None,
    bottom_region: tuple[int, int, int, int] | None,
) -> Image.Image:
    mask = clothing_mask(labels)
    top_mask = intersect_mask(mask, top_region) if top_region else Image.new("L", source.size, 0)
    bottom_mask = intersect_mask(mask, bottom_region) if bottom_region else Image.new("L", source.size, 0)
    return merge_layers(
        tint_masked_base(source, top_mask, top_color),
        tint_masked_base(source, bottom_mask, bottom_color),
    )


def split_protected_region(layer: Image.Image, protected: dict[str, int]) -> tuple[Image.Image, Image.Image]:
    x = int(protected["x"])
    y = int(protected["y"])
    width = int(protected["width"])
    height = int(protected["height"])
    protected_mask = Image.new("L", layer.size, 0)
    protected_mask.paste(255, (x, y, x + width, y + height))

    alpha = layer.getchannel("A")
    back = layer.copy()
    back.putalpha(Image.composite(alpha, Image.new("L", layer.size, 0), protected_mask))
    front = layer.copy()
    front.putalpha(Image.composite(Image.new("L", layer.size, 0), alpha, protected_mask))
    return back, front


def main() -> None:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    manifest_root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    semantic_frames: list[str] = manifest["semanticFrames"]
    pose_map: dict[str, str] = manifest["poseMap"]
    base_aliases: dict[str, str] = manifest.get("baseAliases", {})
    all_poses = sorted(set(pose_map.values()))
    poses = args.pose or all_poses
    unknown_poses = sorted(set(poses) - set(all_poses))
    if unknown_poses:
        raise SystemExit(f"Unknown pose IDs: {', '.join(unknown_poses)}")

    outfits = args.outfit or ["hoodie", "summer", "gym"]
    processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION, use_fast=False)
    model = AutoModelForSemanticSegmentation.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model.eval()

    layer_root = absolute_from(manifest_root, manifest["outfitLayerRoot"])
    base_root = absolute_from(manifest_root, manifest["baseMasterDirectory"])
    expected_size = (int(manifest["canvas"]["width"]), int(manifest["canvas"]["height"]))
    protected = manifest["qualityGates"]["protectedFrontRegion"]

    base_sources: dict[str, Image.Image] = {}
    base_labels: dict[str, torch.Tensor] = {}
    for pose_id in poses:
        base_frame = base_aliases.get(pose_id, pose_id)
        base_path = base_root / f"{base_frame}.png"
        if not base_path.is_file():
            raise FileNotFoundError(base_path)
        base_image = Image.open(base_path).convert("RGBA")
        base_sources[pose_id] = base_image
        base_labels[pose_id] = parse_labels(base_image, processor, model)
        print(f"parsed base garment for {pose_id}", flush=True)

    for outfit in outfits:
        presentation = manifest["presentations"][outfit]
        source_root = absolute_from(manifest_root, presentation["source"])
        front_root = layer_root / outfit / "front"
        back_root = layer_root / outfit / "back"
        front_root.mkdir(parents=True, exist_ok=True)
        back_root.mkdir(parents=True, exist_ok=True)

        top_color, bottom_color = OUTFIT_UNDERLAY_COLORS[outfit]
        top_region, bottom_region = OUTFIT_UNDERLAY_REGIONS[outfit]

        for pose_id in poses:
            frame_id = choose_source_frame(pose_id, semantic_frames, pose_map, base_aliases)
            source_path = source_root / "webp-rig" / f"{frame_id}.webp"
            if not source_path.is_file():
                raise FileNotFoundError(source_path)
            source = Image.open(source_path).convert("RGBA")
            if source.size != expected_size:
                raise ValueError(f"{source_path} is {source.size}, expected {expected_size}")

            pose_mask = clothing_mask(parse_labels(source, processor, model))
            pose_layer = apply_mask(source, pose_mask)
            underlay = build_base_underlay(
                base_sources[pose_id],
                base_labels[pose_id],
                top_color,
                bottom_color,
                top_region,
                bottom_region,
            )
            parsed = merge_layers(underlay, pose_layer)
            if outfit == "hoodie":
                lower_mask = Image.new("L", source.size, 0)
                lower_mask.paste(source.getchannel("A").crop((0, 1390, source.width, source.height)), (0, 1390))
                parsed = merge_layers(parsed, apply_mask(source, lower_mask))
            back, front = split_protected_region(parsed, protected)
            front.save(front_root / f"{pose_id}.png", optimize=True)
            if back.getchannel("A").getbbox():
                back.save(back_root / f"{pose_id}.png", optimize=True)
            print(f"extracted {outfit}/{pose_id} from {frame_id}", flush=True)


if __name__ == "__main__":
    main()
