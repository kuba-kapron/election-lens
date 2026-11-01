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

Official portraits of members of Congress (Senate and House candidates) are downloaded by
pipeline/fetch_portraits.py into photos/congress/<Congress ID>.jpg; this script shrinks them
the same way into web/img/congress/<ID>.jpg and lists them in web/img/congress/congress.json.

Party icons work the same way: put them in photos/parties/, named by the party code the data
uses (D, R, L, G, I), as .svg or any of the picture formats above. SVGs are copied as they
are; pictures are fitted into a 128 x 128 square (transparency kept) and saved as .webp. The
icons go to web/img/parties/ and their list to web/img/parties/parties.json. A party without
an icon shows its letter instead, as in "(D)".
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
CONGRESS_SRC = SRC / "congress"
CONGRESS_OUT = ROOT / "web" / "img" / "congress"
BIOGUIDE = re.compile(r"^[A-Z]\d{6}$")
PARTY_SRC = SRC / "parties"
PARTY_OUT = ROOT / "web" / "img" / "parties"
PARTY = re.compile(r"^[A-Z]$")
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


def congress_portraits() -> None:
    """Shrink official portraits from photos/congress/ (made by fetch_portraits.py)."""
    CONGRESS_OUT.mkdir(parents=True, exist_ok=True)
    made = 0
    if CONGRESS_SRC.is_dir():
        for src in sorted(CONGRESS_SRC.glob("*.jpg")):
            out = CONGRESS_OUT / src.name
            if not BIOGUIDE.match(src.stem) or (out.exists() and out.stat().st_mtime >= src.stat().st_mtime):
                continue
            with Image.open(src) as im:
                im = square(ImageOps.exif_transpose(im).convert("RGB")).resize((SIZE, SIZE), Image.LANCZOS)
                im.save(out, "JPEG", quality=85, optimize=True, progressive=True)
            made += 1
    available = sorted(p.stem for p in CONGRESS_OUT.glob("*.jpg") if BIOGUIDE.match(p.stem))
    (CONGRESS_OUT / "congress.json").write_text(json.dumps(available) + "\n")
    print(f"Made {made} new Congress portraits; {len(available)} in total listed in "
          f"{(CONGRESS_OUT / 'congress.json').relative_to(ROOT)}")


def party_icons() -> list[str]:
    """Copy or shrink party icons from photos/parties/; returns problems."""
    problems = []
    PARTY_OUT.mkdir(parents=True, exist_ok=True)
    if PARTY_SRC.is_dir():
        for src in sorted(PARTY_SRC.iterdir()):
            ext = src.suffix.lower()
            if ext != ".svg" and ext not in EXTENSIONS:
                continue
            if not PARTY.match(src.stem):
                problems.append(f"{src.name}: name party icons by party code, like 'D.svg' or 'R.webp'")
                continue
            for old in PARTY_OUT.glob(src.stem + ".*"):
                if old.suffix != ".json":
                    old.unlink()  # one icon per party
            if ext == ".svg":
                out = PARTY_OUT / src.name
                out.write_bytes(src.read_bytes())
            else:
                out = PARTY_OUT / f"{src.stem}.webp"
                with Image.open(src) as im:
                    im = im.convert("RGBA")
                    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
                    box = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
                    box.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
                    box.save(out, "WEBP", quality=90, method=6)
            print(f"  parties/{src.name} -> {out.relative_to(ROOT)} ({max(1, out.stat().st_size // 1024)} KB)")
    icons = {p.stem: p.name for p in sorted(PARTY_OUT.iterdir())
             if PARTY.match(p.stem) and p.suffix in (".svg", ".webp")}
    (PARTY_OUT / "parties.json").write_text(json.dumps(icons, indent=2) + "\n")
    print(f"{len(icons)} party icons listed in {(PARTY_OUT / 'parties.json').relative_to(ROOT)}")
    return problems


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
    congress_portraits()
    problems += party_icons()
    for p in problems:
        print("  skipped " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
