"""Crop LOGO.png to its outer circular border with transparent background."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = [
    Path(
        r"C:\Users\Acer\.cursor\projects\c-Users-Acer-Music-stefan-project-2\assets"
        r"\c__Users_Acer_Music_stefan_project_2_LOGO.png"
    ),
    ROOT / "LOGO.png",
]
OUTPUTS = [ROOT / "images" / "LOGO.png", ROOT / "LOGO.png"]
TARGET_SIZE = 1024


def main() -> None:
    source = next((path for path in SOURCE_CANDIDATES if path.exists()), None)
    if source is None:
        raise SystemExit("Logo source file not found.")

    img = Image.open(source).convert("RGBA")
    pixels = np.array(img, dtype=np.uint8)

    rgb = pixels[:, :, :3].astype(np.int16)
    brightness = rgb.max(axis=2)
    # Remove black canvas; keep the emblem (white interior + artwork).
    background = brightness < 24
    pixels[background, 3] = 0

    opaque = pixels[:, :, 3] > 0
    if not opaque.any():
        raise SystemExit("No logo pixels detected.")

    ys, xs = np.where(opaque)
    x_min, x_max = xs.min(), xs.max()
    y_min, y_max = ys.min(), ys.max()

    cx = (x_min + x_max) / 2.0
    cy = (y_min + y_max) / 2.0

    # Radius from center to the farthest opaque pixel on the emblem edge.
    distances = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    radius = float(distances.max()) + 1.0

    size = int(np.ceil(radius * 2))
    left = int(round(cx - radius))
    top = int(round(cy - radius))
    right = left + size
    bottom = top + size

    canvas = np.zeros((size, size, 4), dtype=np.uint8)
    src_left = max(left, 0)
    src_top = max(top, 0)
    src_right = min(right, img.width)
    src_bottom = min(bottom, img.height)

    dst_left = src_left - left
    dst_top = src_top - top
    dst_right = dst_left + (src_right - src_left)
    dst_bottom = dst_top + (src_bottom - src_top)

    canvas[dst_top:dst_bottom, dst_left:dst_right] = pixels[src_top:src_bottom, src_left:src_right]

    yy, xx = np.ogrid[:size, :size]
    center = (size - 1) / 2.0
    circle_mask = (xx - center) ** 2 + (yy - center) ** 2 <= radius**2
    canvas[~circle_mask, 3] = 0

    result = Image.fromarray(canvas, mode="RGBA")

    if result.width != TARGET_SIZE:
        result = result.resize((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)

    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        result.save(path, format="PNG", optimize=True)
        print(f"Saved {path} ({result.width}x{result.height})")


if __name__ == "__main__":
    main()
