"""Read sheets from an .xlsx file with the Python standard library (no openpyxl).

    sheet_names(path)   -> ["Sheet1", ...]
    rows(path, name)    -> [["cell", ...], ...]   every value as text, empty cells as ""
"""

import re
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
T = "{%s}t" % NS["m"]


def _targets(z):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    by_id = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for s in wb.find("m:sheets", NS):
        target = by_id[s.get("{%s}id" % NS["r"])].lstrip("/")
        out[s.get("name")] = target if target.startswith("xl/") else "xl/" + target
    return out


def sheet_names(path):
    with zipfile.ZipFile(path) as z:
        return list(_targets(z))


def rows(path, name):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(T)))
        sheet = ET.fromstring(z.read(_targets(z)[name]))
    out = []
    for row in sheet.iter("{%s}row" % NS["m"]):
        cells = {}
        for c in row.findall("m:c", NS):
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r")).group():
                col = col * 26 + ord(ch) - 64
            v, kind = c.find("m:v", NS), c.get("t")
            if kind == "s" and v is not None:
                val = shared[int(v.text)]
            elif kind == "inlineStr":
                val = "".join(t.text or "" for t in c.iter(T))
            else:
                val = v.text if v is not None else ""
            cells[col - 1] = val
        out.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
    return out
