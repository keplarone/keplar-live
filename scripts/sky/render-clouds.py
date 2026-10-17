#!/usr/bin/env python3
"""
Offline renderer for the cloud sky (src/components/ui/space/CloudSky.tsx). Writes the seamless cloud layers that the page drifts
with CSS transforms: public/sky/{day,night}-{far,mid,near}.webp (desktop) and -sm.webp (phones). Nothing runs at request time.

How the clouds are made (numpy only, deterministic seeds):
  1. Density: multi-octave fractal noise made by spectral synthesis (white noise shaped by a 1/f^beta spectrum, so every field
     tiles seamlessly left to right), domain-warped by two more noise fields for the torn, wind-blown edges, plus a high-frequency
     erosion term. A vertical profile gives each layer cumulus structure: a fairly flat base, billowing cauliflower tops.
  2. Light: for each pixel, optical depth is integrated toward the sun (day) or the moon (night) through the density field (a
     2D ray march), so a cloud shadows itself: sunlit tops, grey-blue undersides, a soft powder darkening deep inside and a
     silver rim where a thin edge faces the light. Ambient sky light comes from above and fades into the body.
  3. Atmosphere: farther layers are smaller, flatter and paler, blended toward the horizon haze (aerial perspective).

Usage: python3 scripts/sky/render-clouds.py [--preview DIR]   (--preview also writes composites over the CSS sky gradients)
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "sky")


def spectral(h, w, beta, seed, kmin=1.0, kmax=None, aniso=1.0):
    """Periodic, band-limited fractal noise (zero mean, unit std). Frequencies are in cycles per tile height; kmin drops the
    largest features, kmax rolls off the smallest (so edges billow instead of turning to grain). aniso > 1 stretches features
    horizontally."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * h
    k = np.sqrt((fx / aniso) ** 2 + fy ** 2)
    amp = np.power(np.maximum(k, 1e-6), -beta / 2.0) * (1.0 - np.exp(-(k / kmin) ** 4))
    if kmax:
        amp *= np.exp(-(k / kmax) ** 2)
    f = np.real(np.fft.ifft2(np.fft.fft2(white) * amp))
    f -= f.mean()
    return f / (f.std() + 1e-9)


def sample(field, x, y):
    """Bilinear sample, wrapping in x (seamless) and treating everything outside the tile vertically as empty."""
    h, w = field.shape
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    x0 %= w
    x1 = (x0 + 1) % w
    y0c = np.clip(y0, 0, h - 1)
    y1c = np.clip(y0 + 1, 0, h - 1)
    a = field[y0c, x0] * (1 - fx) + field[y0c, x1] * fx
    b = field[y1c, x0] * (1 - fx) + field[y1c, x1] * fx
    out = a * (1 - fy) + b * fy
    return np.where((y < 0) | (y > h - 1), 0.0, out)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def down(f, n):
    h, w = f.shape
    return f.reshape(h // n, n, w // n, n).mean(axis=(1, 3))


def up(f, h, w):
    fh, fw = f.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    return sample(f, (xx + 0.5) * fw / w - 0.5, np.clip((yy + 0.5) * fh / h - 0.5, 0, fh - 1))


def blur(f, r):
    """Separable box blur (x wraps), applied twice: close to a gaussian."""
    for _ in range(2):
        f = sum(np.roll(f, i, axis=1) for i in range(-r, r + 1)) / (2 * r + 1)
        p = np.pad(f, ((r, r), (0, 0)), mode="edge")
        f = sum(p[r + i:r + i + f.shape[0]] for i in range(-r, r + 1)) / (2 * r + 1)
    return f


def billow_field(h, w, seed, *, clouds, size, height, base, squash=1.0, spread=0.0):
    """Cumulus as clusters of billows. Each cloud is a dome of spheres over a flat base, crowned with smaller puffs
    (the cauliflower top). Returns the surface height z (a 2D height field, 0 = no cloud), wrapping left to right.
    size: cloud width in px; height: cloud height in px; base: base line(s) as a fraction of the tile height; squash < 1
    flattens the billows (distant clouds)."""
    rng = np.random.default_rng(seed)
    z = np.zeros((h, w))
    xs0 = np.linspace(0, w, clouds, endpoint=False) + rng.uniform(-0.3, 0.3, clouds) * w / clouds

    def puff(cx, cy, r, zc):
        ry = r * squash
        y0, y1 = int(max(0, cy - ry - 1)), int(min(h, cy + ry + 2))
        if y1 <= y0:
            return
        x0, x1 = int(np.floor(cx - r - 1)), int(np.ceil(cx + r + 2))
        xi = np.arange(x0, x1)
        yi = np.arange(y0, y1)
        dx = (xi[None, :] - cx) / r
        dy = (yi[:, None] - cy) / ry
        q = 1.0 - dx * dx - dy * dy
        zz = np.where(q > 0, np.sqrt(np.clip(q, 0, None)) * r + zc, 0.0)
        cols = xi % w
        sub = z[y0:y1][:, cols]
        z[y0:y1, cols] = np.maximum(sub, zz)

    for cx in xs0:
        W = size * rng.uniform(0.6, 1.35)
        H = height * rng.uniform(0.65, 1.25) * min(1.0, W / size + 0.3)
        yb = (base + rng.uniform(-spread, spread)) * h
        # the dome: tallest a little off-centre
        peak = cx + rng.uniform(-0.15, 0.15) * W
        def top(x):
            u = np.clip(np.abs(x - peak) / (W * 0.5), 0, 1)
            return H * (1 - u ** 2) ** 0.7
        # base row of large billows (cut flat later)
        n_base = max(3, int(W / (H * 0.45)))
        for i in range(n_base):
            x = cx - W / 2 + (i + rng.uniform(0.2, 0.8)) * W / n_base
            hh = top(x)
            if hh < H * 0.12:
                continue
            r = max(hh * rng.uniform(0.38, 0.55), H * 0.12)
            puff(x, yb - r * 0.55 * squash, r, r * 0.35)
        # body: billows filling the dome
        for _ in range(int(W / H * 7)):
            x = rng.uniform(cx - W / 2, cx + W / 2)
            hh = top(x)
            if hh < H * 0.1:
                continue
            yy = yb - rng.uniform(0.2, 0.85) * hh
            r = hh * rng.uniform(0.18, 0.34)
            puff(x, yy, r, r * 0.25 + (yb - yy) * 0.2)
        # crown: small puffs along the top contour (the cauliflower)
        for _ in range(int(W / H * 9)):
            x = rng.uniform(cx - W / 2, cx + W / 2)
            hh = top(x)
            if hh < H * 0.08:
                continue
            r = H * rng.uniform(0.08, 0.2)
            yy = yb - hh + r * rng.uniform(0.3, 1.1) * squash
            puff(x, yy, r, hh * 0.32)
    return z


def cloud_layer(h, w, seed, *, clouds, size, height, base, squash, spread, warp, erode):
    z = billow_field(h, w, seed, clouds=clouds, size=size, height=height, base=base, squash=squash, spread=spread)
    k = h / max(height, 1)
    wx = spectral(h, w, 3.2, seed + 1, kmin=1.0, kmax=k * 3, aniso=1.0)
    wy = spectral(h, w, 3.2, seed + 2, kmin=1.0, kmax=k * 3, aniso=1.0)
    fx = spectral(h, w, 2.6, seed + 4, kmin=k * 2, kmax=k * 14, aniso=1.6)
    fy = spectral(h, w, 2.6, seed + 5, kmin=k * 2, kmax=k * 14, aniso=1.6)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    X = xx + wx * warp * height * 0.08 + fx * warp * height * 0.012
    Y = yy + wy * warp * height * 0.05 + fy * warp * height * 0.008
    z = sample(z, X, Y)
    det = spectral(h, w, 2.2, seed + 6, kmin=k * 3, kmax=k * 22, aniso=1.4)
    zn = z / (z.max() + 1e-9)
    # erode the rim into wisps: thin parts lose density where the detail noise is low
    thin = 1.0 - smoothstep(0.0, 0.18, zn)
    zn = np.clip(zn - erode * thin * np.clip(0.5 - det * 0.5, 0, 1) * 0.12, 0, None)
    return zn


def march(d, direction, steps, step0, growth):
    """Optical depth from each pixel toward the light through d (2D ray march), in pixels of density."""
    h, w = d.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    dx, dy = direction
    n = np.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    od = np.zeros_like(d)
    dist = 0.0
    step = step0
    for _ in range(steps):
        dist += step
        od += sample(d, xx + dx * dist, yy + dy * dist) * step
        step *= growth
    return od


def hexrgb(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def shade(zn, *, theme, haze, alpha_k, light, hazecol, height):
    """Light a cloud height field. zn: normalized surface height (0 = clear sky). light: (x, y, z) toward the sun/moon, y up
    is negative (screen space), z toward the viewer."""
    h, w = zn.shape
    zp = blur(zn, max(3, int(height * 0.03))) * height  # surface height in px, softened: clouds have no hard skin
    gy, gx = np.gradient(zp)
    nrm = np.dstack([-gx, -gy, np.ones_like(zp)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    ndl = np.clip((nrm @ L + 0.35) / 1.35, 0, 1)  # wrapped diffuse: light scatters around a cloud's terminator
    ndl = ndl * 0.65 + 0.35 * 0.7  # multiple scattering flattens the surface shading
    # self-shadow: billows above and sunward shade the ones below (march through the thickness, quarter resolution)
    od = up(march(down(zn, 4), (L[0], L[1]), steps=28, step0=0.75, growth=1.08) * 4, h, w)
    shadow = np.exp(-od / (height * 0.28))
    # crevices between billows get less sky light (ambient occlusion from the local height deficit)
    ao = np.clip(1.0 - np.clip(blur(zp, 6) - zp, 0, None) / (height * 0.07), 0.45, 1.0)
    up_facing = np.clip(-nrm[..., 1] * 0.5 + 0.5, 0, 1)
    edge = 1.0 - smoothstep(0.0, 0.12, zn)
    direct = ndl * (0.18 + 0.82 * shadow)
    mott = blur(spectral(h, w, 2.4, 77, kmin=h / height * 2, kmax=h / height * 12), 1)  # density mottling inside the body
    if theme == "day":
        sun = hexrgb("#fffaf0")
        sky = hexrgb("#d3e3f6")  # light from the blue sky above
        under = hexrgb("#97abc8")  # blue-grey bases, lit by the sky and the ground below
        amb = under[None, None] * (1 - up_facing[..., None]) + sky[None, None] * up_facing[..., None]
        col = amb * (0.5 + 0.5 * ao)[..., None] * 0.8 + sun[None, None] * (direct ** 1.1)[..., None] * 0.85
        col *= (1 + 0.035 * mott)[..., None]
        col += hexrgb("#ffffff")[None, None] * (edge * shadow * ndl)[..., None] * 0.12  # translucent, sunlit rims glow
    else:
        # late twilight: dim, near-silhouette clouds; the afterglow low in the sky catches their undersides and rims
        glow = hexrgb("#6f7bb0")
        sky = hexrgb("#24345f")
        under = hexrgb("#18234a")
        amb = under[None, None] * (1 - up_facing[..., None]) + sky[None, None] * up_facing[..., None]
        col = amb * (0.65 + 0.35 * ao)[..., None] + glow[None, None] * (direct ** 1.3)[..., None] * 0.32
        col += glow[None, None] * (edge * shadow)[..., None] * 0.18
    col = np.clip(col, 0, 1)
    col = col * (1 - haze) + hexrgb(hazecol)[None, None] * haze
    soft = blur(zn, max(1, int(height * 0.025)))  # a feathered fringe: cloud edges dissolve rather than end
    alpha = 1.0 - np.exp(-(0.75 * zn + 0.25 * soft) * alpha_k)
    return np.clip(col, 0, 1), np.clip(alpha, 0, 1)


# Layer recipes. size = desktop tile (height, width) in px. The page shows each tile at its own height and drift speed
# (CloudSky's CSS): far clouds sit low, small, flat and hazy; near clouds are big and crisp.
LAYERS = {
    "far": dict(size=(320, 2400), seed=11, clouds=13, csize=230, cheight=78, base=0.82, squash=0.7, spread=0.08, warp=0.6, erode=1.0, haze=0.55, alpha_k=4.5),
    "mid": dict(size=(480, 2400), seed=23, clouds=8, csize=420, cheight=150, base=0.8, squash=0.82, spread=0.07, warp=1.0, erode=1.0, haze=0.2, alpha_k=5.0),
    "near": dict(size=(680, 2400), seed=37, clouds=4, csize=900, cheight=330, base=0.84, squash=0.92, spread=0.05, warp=1.0, erode=1.0, haze=0.0, alpha_k=5.5),
}
THEMES = {
    "day": dict(light=(0.6, -0.85, 0.25), haze={"far": "#dfeaf5", "mid": "#d5e4f3", "near": "#d2e2f3"}),
    "night": dict(light=(-0.35, 0.7, 0.35), haze={"far": "#2b3a6b", "mid": "#22325f", "near": "#1c2b55"}),
}


def render_all():
    out = {}
    for name, L in LAYERS.items():
        h, w = L["size"]
        zn = cloud_layer(h, w, L["seed"], clouds=L["clouds"], size=L["csize"], height=L["cheight"], base=L["base"],
                         squash=L["squash"], spread=L["spread"], warp=L["warp"], erode=L["erode"])
        for theme, T in THEMES.items():
            col, a = shade(zn, theme=theme, haze=L["haze"], alpha_k=L["alpha_k"] * (0.7 if theme == "night" else 1.0), light=T["light"], hazecol=T["haze"][name],
                           height=L["cheight"])
            out[(theme, name)] = np.dstack([col, a])
            print(f"rendered {theme}-{name} {w}x{h}", file=sys.stderr)
    return out


def stars(w, h, count, seed):
    """A transparent tile of tiny stars: power-law brightness, a faint soft core, slight colour by temperature."""
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 4))
    yy, xx = np.mgrid[-3:4, -3:4].astype(np.float64)
    tints = [hexrgb(c) for c in ("#ffffff", "#dfe8ff", "#cdd9ff", "#fff3e0", "#ffe6c8")]
    for _ in range(count):
        x, y = rng.uniform(4, w - 4), rng.uniform(4, h - 4)
        b = min(1.0, 0.25 + rng.pareto(2.6) * 0.3)
        sigma = 0.45 + b * 0.4
        ix, iy = int(x), int(y)
        fx, fy = x - ix, y - iy
        g = np.exp(-(((xx - fx) ** 2 + (yy - fy) ** 2) / (2 * sigma * sigma)))
        a = np.clip(g * b, 0, 1)
        c = tints[rng.integers(len(tints))]
        sl = img[iy - 3:iy + 4, ix - 3:ix + 4]
        sl[..., :3] = c
        sl[..., 3] = np.maximum(sl[..., 3], a)
    return img


def to_img(rgba):
    return Image.fromarray(np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA")


def ramp(rgba):
    """Fit a layer's colours to a straight ramp C0 -> C1 (they are close to one already: blue-grey shadow to sunlit white, plus
    a linear haze blend). Returns (c0, c1, t) with t in [0, 1] per pixel."""
    col, a = rgba[..., :3], rgba[..., 3]
    m = a > 0.15
    pts = col[m]
    mean = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
    axis = vt[0] if vt[0].sum() > 0 else -vt[0]
    proj = (col - mean) @ axis
    lo, hi = np.percentile(proj[m], [1, 99.5])
    c0, c1 = np.clip(mean + axis * lo, 0, 1), np.clip(mean + axis * hi, 0, 1)
    t = np.clip((proj - lo) / (hi - lo), 0, 1)
    err = np.abs(c0 + (c1 - c0) * t[..., None] - col)[m].mean() * 255
    return c0, c1, t, err


def mask_img(alpha):
    """An alpha-only mask (white RGB, so it compresses to almost nothing beyond the alpha plane)."""
    h, w = alpha.shape
    return to_img(np.dstack([np.ones((h, w, 3)), alpha]))


def save(out):
    """Writes each layer as two CSS masks (mask images are never LCP candidates, background images are): -a = the cloud's
    alpha, -t = where it is lit (0 = the layer's shadow colour C0, 1 = its lit colour C1). The page paints C0 through -a and C1
    through -t on top, which rebuilds the shaded cloud. Prints the colours for src/styles/space.css."""
    os.makedirs(OUT, exist_ok=True)
    to_img(stars(1200, 800, 90, 5)).save(os.path.join(OUT, "stars.webp"), "WEBP", lossless=True, method=6)
    to_img(stars(1200, 800, 14, 6)).save(os.path.join(OUT, "stars-twinkle.webp"), "WEBP", lossless=True, method=6)
    hx = lambda c: "#" + "".join(f"{int(round(v * 255)):02x}" for v in c)
    for (theme, name), rgba in out.items():
        if theme == "night" and name == "near":
            continue  # dusk keeps only the faint far and mid layers, so the stars read first
        c0, c1, t, err = ramp(rgba)
        a = rgba[..., 3]
        t = np.where(a > 0.01, t, 0.0)
        print(f"{theme}-{name}: --c0: {hx(c0)}; --c1: {hx(c1)};  (mean ramp error {err:.1f}/255)")
        for suffix, plane, k in (("a", a, 1), ("t", t, 2)):  # light varies slowly: its mask is stored at half size
            img = mask_img(plane)
            img = img.resize((img.width // k, img.height // k), Image.LANCZOS)
            img.save(os.path.join(OUT, f"{theme}-{name}-{suffix}.webp"), "WEBP", quality=60, method=6, alpha_quality=70)
            sm = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
            sm.save(os.path.join(OUT, f"{theme}-{name}-{suffix}-sm.webp"), "WEBP", quality=60, method=6, alpha_quality=70)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="write layer PNGs here instead of public/sky (for iterating)")
    args = ap.parse_args()
    res = render_all()
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        for (theme, name), rgba in res.items():
            to_img(rgba).save(os.path.join(args.preview, f"{theme}-{name}.png"))
        to_img(stars(1200, 800, 90, 5)).save(os.path.join(args.preview, "stars.png"))
    else:
        save(res)
