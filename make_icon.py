#!/usr/bin/env python3
"""
Khayt icon generator — v2
Renders at 2048 then downsamples to 1024 for smooth antialiasing.
Concept: deep navy background, blue filament spool with teal barrel
(wound filament), a smooth sky-blue thread arc looping off the top.
"""

import math, os
from PIL import Image, ImageDraw, ImageFilter

# ── palette ────────────────────────────────────────────────────────────────────
BG_TOP    = (10,  18, 45)
BG_BOT    = (4,    8, 24)
DISC_FACE = (55, 125, 240)
DISC_RIM  = (40,  90, 200)
DISC_DARK = (22,  50, 130)
BARREL_HI = (70, 185, 255)    # teal highlight (wound filament)
BARREL_MID= (45, 145, 215)
BARREL_SH = (20,  70, 150)
THREAD_C  = (180, 230, 255)

# ── easing ────────────────────────────────────────────────────────────────────
def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    if isinstance(a, tuple):
        return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(len(a)))
    return a + (b-a)*t

# ── cubic bezier ──────────────────────────────────────────────────────────────
def bezier(p0, p1, p2, p3, t):
    u = 1-t
    return (
        u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0],
        u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1],
    )

# ── rounded-rect mask ─────────────────────────────────────────────────────────
def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=255)
    return mask

# ── render at double resolution then halve ────────────────────────────────────
def render_icon(final_size):
    S = final_size * 2          # render at 2× for AA
    img  = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    # 1. background gradient
    for y in range(S):
        c = lerp(BG_TOP, BG_BOT, y / S)
        draw.line([(0, y), (S-1, y)], fill=c + (255,))

    cx = S * 0.500
    cy = S * 0.530          # spool slightly below centre

    # geometry (relative to S)
    disc_rx  = S * 0.330
    disc_ry  = S * 0.330
    disc_t   = S * 0.060    # disc edge "depth"
    barrel_h = S * 0.200
    brx      = S * 0.200    # barrel x radius
    bry      = S * 0.040    # barrel y radius (foreshortened)

    top_y  = cy - barrel_h * 0.5
    bot_y  = cy + barrel_h * 0.5

    # 2. soft ambient glow behind spool
    glow_size = int(S * 0.90)
    glow = Image.new("RGBA", (S, S), (0,0,0,0))
    gd   = ImageDraw.Draw(glow, "RGBA")
    for r in range(glow_size//2, 0, -4):
        ratio = r / (glow_size//2)
        alpha = int(55 * (1 - ratio) * ratio * 4)
        gd.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(40,100,220,alpha))
    img.alpha_composite(glow)
    draw = ImageDraw.Draw(img, "RGBA")

    # 3. bottom disc edge (cylinder illusion)
    for i in range(int(disc_t)+1):
        t = i / disc_t
        c = lerp(lerp(DISC_RIM, DISC_DARK, 0.4), DISC_DARK, ease(t))
        fy = bot_y - disc_t*0.5 + i
        draw.ellipse([cx-disc_rx, fy - disc_ry*0.195,
                      cx+disc_rx, fy + disc_ry*0.195], fill=c+(255,))

    # bottom disc face
    bdf_y = bot_y + disc_t*0.5
    draw.ellipse([cx-disc_rx, bdf_y - disc_ry*0.20,
                  cx+disc_rx, bdf_y + disc_ry*0.20], fill=DISC_DARK+(255,))
    # hub ring
    hr = disc_rx * 0.27
    draw.ellipse([cx-hr, bdf_y-hr*0.22, cx+hr, bdf_y+hr*0.22],
                 fill=lerp(DISC_RIM,(255,255,255),0.08)+(255,))

    # 4. barrel — simulate wound filament with alternating teal/blue bands
    n_winds = 9
    for i in range(int(barrel_h)+1):
        t = i / barrel_h
        wave = 0.5 + 0.5 * math.sin(t * n_winds * math.pi)
        c = lerp(BARREL_SH, lerp(BARREL_MID, BARREL_HI, wave), 0.30 + 0.70*wave)
        fy = top_y + i
        draw.ellipse([cx-brx, fy-bry, cx+brx, fy+bry], fill=c+(255,))

    # barrel top cap highlight
    draw.ellipse([cx-brx, top_y-bry, cx+brx, top_y+bry],
                 fill=lerp(BARREL_HI,(255,255,255),0.25)+(255,))
    # barrel bottom cap
    draw.ellipse([cx-brx, bot_y-bry, cx+brx, bot_y+bry],
                 fill=lerp(BARREL_SH,(0,0,0),0.15)+(255,))

    # 5. top disc edge
    for i in range(int(disc_t)+1):
        t = i / disc_t
        c = lerp(lerp(DISC_FACE,(255,255,255),0.18), lerp(DISC_RIM,DISC_DARK,0.5), ease(t))
        fy = top_y - disc_t + i
        draw.ellipse([cx-disc_rx, fy - disc_ry*0.195,
                      cx+disc_rx, fy + disc_ry*0.195], fill=c+(255,))

    # top disc face
    tdf_y = top_y - disc_t
    draw.ellipse([cx-disc_rx, tdf_y - disc_ry*0.20,
                  cx+disc_rx, tdf_y + disc_ry*0.20],
                 fill=lerp(DISC_FACE,(255,255,255),0.12)+(255,))
    # hub ring
    hr2 = disc_rx * 0.27
    draw.ellipse([cx-hr2, tdf_y-hr2*0.22, cx+hr2, tdf_y+hr2*0.22],
                 fill=lerp(DISC_DARK,DISC_FACE,0.30)+(255,))
    # hub hole
    hr3 = disc_rx * 0.12
    draw.ellipse([cx-hr3, tdf_y-hr3*0.22, cx+hr3, tdf_y+hr3*0.22],
                 fill=lerp(BG_BOT,DISC_DARK,0.6)+(255,))

    # 6. thread arc — render on a separate layer then blur for smoothness
    thread_layer = Image.new("RGBA", (S, S), (0,0,0,0))
    td = ImageDraw.Draw(thread_layer, "RGBA")

    # Arc: starts from top-right of top disc, loops up and to the right
    exit_x = cx + disc_rx * 0.55
    exit_y = tdf_y - disc_ry * 0.15
    p0 = (exit_x, exit_y)
    p1 = (cx + disc_rx * 1.05, tdf_y - S*0.18)
    p2 = (cx + disc_rx * 1.22, tdf_y - S*0.30)
    p3 = (cx + disc_rx * 0.82, tdf_y - S*0.36)

    pts = [bezier(p0, p1, p2, p3, i/160) for i in range(161)]
    lw = max(6, int(S * 0.013))

    # Glow pass
    for pts_pair in zip(pts, pts[1:]):
        td.line([pts_pair[0], pts_pair[1]],
                fill=THREAD_C+(55,), width=lw*4)
    # Core pass
    for pts_pair in zip(pts, pts[1:]):
        td.line([pts_pair[0], pts_pair[1]],
                fill=THREAD_C+(210,), width=lw)

    thread_layer = thread_layer.filter(ImageFilter.GaussianBlur(radius=S*0.006))
    img.alpha_composite(thread_layer)

    # 7. specular highlight on top disc face (top-left bright spot)
    spec_layer = Image.new("RGBA", (S, S), (0,0,0,0))
    sd = ImageDraw.Draw(spec_layer, "RGBA")
    sx = cx - disc_rx * 0.35
    sy = tdf_y - disc_ry * 0.10
    sr = disc_rx * 0.30
    for ri in range(int(sr), 0, -2):
        alpha_s = int(40 * (1 - ri/sr) ** 1.5)
        sd.ellipse([sx-ri, sy-ri*0.22, sx+ri, sy+ri*0.22],
                   fill=(255,255,255,alpha_s))
    img.alpha_composite(spec_layer)

    # 8. apply rounded-rect mask
    radius = int(S * 0.224)
    mask = rounded_rect_mask(S, radius)
    img.putalpha(mask)

    # 9. downsample to final size (LANCZOS for quality)
    img = img.resize((final_size, final_size), Image.LANCZOS)
    return img


# ── iconset sizes ──────────────────────────────────────────────────────────────
SIZES = {
    "icon_16x16.png":        16,
    "icon_16x16@2x.png":     32,
    "icon_32x32.png":        32,
    "icon_32x32@2x.png":     64,
    "icon_128x128.png":     128,
    "icon_128x128@2x.png":  256,
    "icon_256x256.png":     256,
    "icon_256x256@2x.png":  512,
    "icon_512x512.png":     512,
    "icon_512x512@2x.png": 1024,
}

if __name__ == "__main__":
    base        = os.path.dirname(os.path.abspath(__file__))
    iconset_dir = os.path.join(base, "assets", "khayt.iconset")
    icns_path   = os.path.join(base, "assets", "icon.icns")

    os.makedirs(iconset_dir, exist_ok=True)

    print("Rendering master 1024×1024 icon (2048 internal)…")
    master = render_icon(1024)

    for fname, sz in SIZES.items():
        out = master.resize((sz, sz), Image.LANCZOS)
        out.save(os.path.join(iconset_dir, fname), optimize=True)
        print(f"  saved {fname} ({sz}px)")

    master.save(os.path.join(base, "assets", "icon_preview.png"), optimize=True)
    print(f"  saved icon_preview.png (1024px)")

    print("Running iconutil…")
    ret = os.system(f'iconutil -c icns "{iconset_dir}" -o "{icns_path}"')
    print("✅  icon.icns" if ret == 0 else "❌  iconutil failed")
