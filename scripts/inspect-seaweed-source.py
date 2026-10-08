"""Read-only source alpha/bounds verification; never rewrites the source PNG."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / "public/images/natural-seabed-plants-v2.png"
rects = [(50, 25, 600, 638), (650, 25, 557, 638), (35, 667, 585, 590), (635, 675, 574, 585)]
with Image.open(source) as image:
    assert image.mode == "RGBA" and image.size == (1223, 1286)
    alpha = image.getchannel("A")
    cells = []
    for x, y, w, h in rects:
        assert x + w <= image.width and y + h <= image.height
        bounds = alpha.crop((x, y, x + w, y + h)).point(lambda value: 255 if value > 12 else 0).getbbox()
        assert bounds is not None
        left, top, right, bottom = bounds
        assert left > 0 and top > 0 and right < w and bottom < h, "specimen must not be cut at source rectangle edges"
        cells.append({"rect": [x, y, w, h], "alphaAbove12Bounds": list(bounds), "rootAt": "bottom-centre", "transparentPaddingPx": [left, top, w - right, h - bottom]})
    report = {"source": source.relative_to(root).as_posix(), "width": image.width, "height": image.height, "mode": image.mode,
              "bytes": source.stat().st_size, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "transparentFraction": alpha.histogram()[0] / (image.width * image.height), "cells": cells,
              "method": "read-only alpha inspection; PNG bytes and pixels unchanged; crop coordinates used only at runtime"}
(root / "scripts/seaweed-assets-source.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
