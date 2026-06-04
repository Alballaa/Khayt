#!/usr/bin/env python3
"""Extract CSS tokens from design/Khayt Companion.html into KhaytDesign.swift hints."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_CANDIDATES = [
    ROOT / "design" / "Khayt Companion.html",
    ROOT / "design" / "Khayt-Companion.html",
    ROOT / "design" / "companion" / "index.html",
]


def find_html() -> Path | None:
    for p in HTML_CANDIDATES:
        if p.is_file():
            return p
    return None


def extract_css_vars(text: str) -> dict[str, str]:
    vars_found: dict[str, str] = {}
    for m in re.finditer(r"--([a-z0-9-]+)\s*:\s*([^;}\n]+)", text, re.I):
        vars_found[m.group(1)] = m.group(2).strip()
    return vars_found


def main() -> int:
    html_path = find_html()
    if not html_path:
        print("No mockup found. Add:", file=sys.stderr)
        for p in HTML_CANDIDATES:
            print(f"  {p}", file=sys.stderr)
        return 1

    text = html_path.read_text(encoding="utf-8", errors="replace")
    vars_found = extract_css_vars(text)
    print(f"Read {html_path} ({len(text)} chars)")
    print(f"Found {len(vars_found)} CSS variables")
    for key in sorted(vars_found.keys()):
        if key in ("bg", "surface", "accent", "text", "text-dim", "text-muted", "ok", "warn", "danger", "info", "violet"):
            print(f"  --{key}: {vars_found[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
