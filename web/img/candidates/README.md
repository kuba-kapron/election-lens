# Candidate portraits

This folder holds the small round portraits shown next to each candidate in the side panel,
plus `photos.json`, the list of portraits that exist. Both are made by a script: don't add
files here by hand.

## Adding a photo

1. Put the original in the `photos/` folder at the top of the repository, named after the
   candidate's last name in lowercase. Any of `.jpg`, `.jpeg`, `.png` or `.webp` works.
   - `photos/trump.jpg` is used for every year that candidate ran.
   - `photos/trump-2024.jpg` is used only for 2024 and takes priority over the general one.
   - `photos/trump-2016-2020.jpg` is used for both 2016 and 2020 (list as many years as needed).
2. Run `uv run pipeline/build_photos.py` from the repository root. It crops each photo to a
   square around the upper part of the picture, shrinks it to 128 × 128 pixels (a few KB)
   and saves it here as `<name>.jpg`.
   - Add `--delete-originals` to delete each original from `photos/` once its portrait is
     saved. Without it, the originals stay, so you can re-crop them later.
3. Reload the page.

To remove a portrait, delete its `.jpg` from this folder and run the script again.

Without a photo, the panel shows the candidate's initials in their party color.

| Candidate | Name to use |
|---|---|
| Al Gore | `gore` |
| George W. Bush | `bush` |
| John Kerry | `kerry` |
| Barack Obama | `obama` |
| John McCain | `mccain` |
| Mitt Romney | `romney` |
| Hillary Clinton | `clinton` |
| Donald Trump | `trump` |
| Joe Biden | `biden` |
| Kamala Harris | `harris` |

The originals in `photos/` are not committed to git (see `.gitignore`); only the small
portraits here are published.

Only use images you are allowed to publish. Official portraits made by the US government
(for example presidents, vice presidents and members of Congress) are generally in the
public domain, but check each image's licence and list its source below.

## Sources

(none yet)
