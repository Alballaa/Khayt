#!/usr/bin/env python3
"""
Build Athar Tuwaiq brand assets:
  - PNG exports of the mark (transparent bg) at 64/128/256/512/1024
  - PNG exports of the app icon (cream squircle bg) at all sizes
  - .icns file for macOS, built from the raw ICNS format
"""
import io
import struct
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path('/sessions/exciting-elegant-allen/mnt/outputs/athar-tuwaiq-brand')
OUT.mkdir(parents=True, exist_ok=True)
ICON_DIR = OUT / 'icon-png-sizes'
ICON_DIR.mkdir(exist_ok=True)
LOGO_DIR = OUT / 'logo-png-sizes'
LOGO_DIR.mkdir(exist_ok=True)

# --- Strata palette (deep earth -> warm cream) ---
LAYERS = [
    # (x, y, width, height, fill)
    (152, 720, 720, 64, (94, 46, 20, 255)),    # base, deepest
    (180, 648, 664, 64, (168, 84, 42, 255)),
    (252, 576, 520, 64, (216, 138, 61, 255)),
    (342, 504, 340, 64, (239, 180, 110, 255)),
    (422, 432, 180, 64, (245, 214, 163, 255)), # peak, lightest
]
LAYER_RADIUS = 12
BG_CREAM   = (245, 237, 221, 255)
BG_BORDER  = (230, 216, 184, 255)

# --- Build mark on transparent canvas at 1024 ---
def build_mark_1024():
    img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for x, y, w, h, color in LAYERS:
        draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=LAYER_RADIUS, fill=color)
    return img

# --- Build app icon (cream squircle + mark) at 1024 ---
def build_icon_1024():
    img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Apple Big Sur squircle ratio ~0.2237 of the icon side
    radius = round(1024 * 0.2237)
    draw.rounded_rectangle([(0, 0), (1024, 1024)], radius=radius, fill=BG_CREAM)
    # 1-px inner border for definition
    draw.rounded_rectangle([(0.5, 0.5), (1023.5, 1023.5)], radius=radius, outline=BG_BORDER, width=1)
    for x, y, w, h, color in LAYERS:
        draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=LAYER_RADIUS, fill=color)
    return img

def save_sizes(img_1024, out_dir, prefix, sizes=(64, 128, 256, 512, 1024)):
    """Save downsampled PNGs using LANCZOS for crisp edges."""
    for s in sizes:
        resized = img_1024.resize((s, s), Image.LANCZOS) if s != 1024 else img_1024
        out_path = out_dir / f'{prefix}-{s}.png'
        resized.save(out_path, format='PNG', optimize=True)
        print(f'  {out_path.name}  {s}x{s}')

def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()

def write_icns(out_path, png_by_type):
    """
    Build a macOS .icns file from a dict of {type_code: png_bytes}.

    File format:
      'icns' (4) | total_file_length (4 BE u32) | chunks...
    Each chunk:
      type_code (4) | chunk_length_inc_header (4 BE u32) | png_data
    """
    chunks = []
    for type_code, data in png_by_type.items():
        assert len(type_code) == 4
        chunk_len = 8 + len(data)
        chunks.append(type_code.encode('ascii') + struct.pack('>I', chunk_len) + data)
    body = b''.join(chunks)
    total = 8 + len(body)
    with open(out_path, 'wb') as f:
        f.write(b'icns' + struct.pack('>I', total) + body)
    print(f'  {out_path.name}  ({total:,} bytes, {len(png_by_type)} icon variants)')

def main():
    print('1) Building mark (transparent)...')
    mark = build_mark_1024()
    save_sizes(mark, LOGO_DIR, 'athar-tuwaiq-logo')

    print('2) Building app icon (cream squircle)...')
    icon = build_icon_1024()
    save_sizes(icon, ICON_DIR, 'athar-tuwaiq-icon')

    print('3) Building macOS .icns from icon...')
    # Comprehensive set of macOS icon types
    type_sizes = {
        'icp4': 16,    # 16x16 (low-res)
        'icp5': 32,    # 32x32 (low-res)
        'ic07': 128,   # 128x128
        'ic08': 256,   # 256x256
        'ic09': 512,   # 512x512
        'ic10': 1024,  # 1024x1024 (= 512@2x)
        'ic11': 32,    # 16x16 @2x
        'ic12': 64,    # 32x32 @2x
        'ic13': 256,   # 128x128 @2x
        'ic14': 512,   # 256x256 @2x
    }
    png_by_type = {}
    for code, dim in type_sizes.items():
        resized = icon.resize((dim, dim), Image.LANCZOS) if dim != 1024 else icon
        png_by_type[code] = png_bytes(resized)
    icns_out = OUT / 'icon.icns'
    write_icns(icns_out, png_by_type)

    print('4) Copying icon.icns into the Electron project assets/...')
    project_assets = Path('/sessions/exciting-elegant-allen/mnt/outputs/athar-tuwaiq-hub/assets')
    project_assets.mkdir(exist_ok=True)
    (project_assets / 'icon.icns').write_bytes(icns_out.read_bytes())
    print(f'  copied to {project_assets / "icon.icns"}')

    print('\nDone.')

if __name__ == '__main__':
    main()
