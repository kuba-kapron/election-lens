"""Turn candidate photos in photos/ into small square portraits for the side panel.

Put originals in photos/ (repository root), named by the candidate's last name in lowercase,
optionally with one or more years for a photo used only in those elections:

    photos/gore.jpg              used for every year Gore ran
    photos/bush-2004.jpeg        used only for 2004
    photos/trump-2016-2020.jpg   used for 2016 and 2020

Any of .jpg, .jpeg, .png or .webp works. Run:

    uv run pipeline/build_photos.py                      # keeps the originals in photos/
    uv run pipeline/build_photos.py --delete-originals   # deletes each original once processed

Each photo is cropped to a square around the upper part of the picture (where the face is in
an official portrait), resized to 128 x 128 pixels and saved as
web/img/candidates/<name>.jpg. The list of available portraits goes to
web/img/candidates/photos.json, which the page reads, so it never requests missing files.
Originals are never published (photos/ is in .gitignore). Portraits already in
web/img/candidates/ are kept; to remove one, delete its .jpg there and run the script again.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "photos"
OUT = ROOT / "web" / "img" / "candidates"
SIZE = 128  # pixels; the portrait is shown at 36 px, so this is sharp on high-density screens
NAME = re.compile(r"^[a-z]+(-\d{4})*$")  # original: trump, trump-2024, trump-2016-2020
PORTRAIT = re.compile(r"^[a-z]+(-\d{4})?$")  # portrait: trump, trump-2024
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def square(im: Image.Image) -> Image.Image:
    """Crop to a square. Tall pictures keep their upper part, where the face usually is."""
    w, h = im.size
    if h > w:
        top = int((h - w) * 0.1)
        return im.crop((0, top, w, top + w))
    left = (w - h) // 2
    return im.crop((left, 0, left + h, h))


def main() -> int:
    parser = argparse.ArgumentParser(description="Make small candidate portraits from photos/.")
    parser.add_argument("--delete-originals", action="store_true",
                        help="delete each original from photos/ after its portrait is saved")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    made, problems = [], []
    if not SRC.is_dir():
        print(f"No {SRC.relative_to(ROOT)}/ folder; no new photos to process.")
        SRC.mkdir()
    for src in sorted(SRC.iterdir()):
        if src.suffix.lower() not in EXTENSIONS:
            continue
        key = src.stem.lower()
        if not NAME.match(key):
            problems.append(f"{src.name}: name it like 'trump.jpg', 'trump-2024.jpg' or 'trump-2016-2020.jpg'")
            continue
        # one portrait per year named in the file (trump-2016-2020 -> trump-2016, trump-2020)
        last, *years = key.split("-")
        names = [f"{last}-{y}" for y in years] or [last]
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")  # respect camera rotation
            im = square(im).resize((SIZE, SIZE), Image.LANCZOS)
            for name in names:
                im.save(OUT / f"{name}.jpg", "JPEG", quality=85, optimize=True, progressive=True)
        made.extend(names)
        note = ""
        if args.delete_originals:
            src.unlink()  # only after the portraits were saved
            note = ", original deleted"
        size = (OUT / f"{names[0]}.jpg").stat().st_size // 1024
        print(f"  {src.name} -> {', '.join(n + '.jpg' for n in names)} ({size} KB each{note})")

    # the list covers every portrait in the folder, new and old
    available = sorted(p.stem for p in OUT.glob("*.jpg") if PORTRAIT.match(p.stem))
    (OUT / "photos.json").write_text(json.dumps(available, indent=2) + "\n")
    print(f"Made {len(made)} new portraits; {len(available)} in total listed in "
          f"{(OUT / 'photos.json').relative_to(ROOT)}")
    for p in problems:
        print("  skipped " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
