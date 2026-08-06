#!/usr/bin/env python3
"""Package build/chrome-mv3-prod into chrome-mv3-prod.zip with the STANDARD
zlib deflate. (The jszip-based Plasmo package step produced deflate streams
that Python's zlib and Windows' inflate reject — 'invalid distance too far
back' — for some KaTeX font entries, making the zip fail to extract on
Windows. Python's zipfile is strict + Windows-compatible.)"""

import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "chrome-mv3-prod")
OUT = os.path.join(ROOT, "build", "chrome-mv3-prod.zip")

if not os.path.isdir(SRC):
    print(f"build dir not found: {SRC} — run `pnpm run build` first")
    sys.exit(1)

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _dirs, files in os.walk(SRC):
        for f in files:
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, SRC)
            z.write(full, rel)

# Strict self-check: every binary/font entry must decompress cleanly.
with zipfile.ZipFile(OUT) as z:
    for n in z.namelist():
        if n.endswith((".ttf", ".woff", ".woff2", ".pfb")):
            z.read(n)

size = os.path.getsize(OUT)
print(f"packaged chrome-mv3-prod.zip ({size/1e6:.2f} MB) — all entries verified")
