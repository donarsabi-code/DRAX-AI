#!/usr/bin/env python3
"""Génère tous les dérivés du logo officiel DRAX IA (upload utilisateur).
- public/drax-logo.png            : logo original (copie)
- public/favicon.png              : 96x96
- public/favicon.ico              : multi-tailles 16/32/48
- public/apple-touch-icon.png     : 180x180
- public/icons/drax-192.png       : icône PWA 192x192
- public/icons/drax-512.png       : icône PWA 512x512 (coin arrondi)
- public/icons/drax-maskable-512.png : variante maskable (padding sûr)
- public/og-drax.png              : image OpenGraph 1200x630
"""
from PIL import Image, ImageDraw, ImageOps, ImageFilter
import os, shutil

SRC = '/home/z/my-project/upload/0B9FC08A-BA3C-4F3C-B21D-97BA94B44522.png'
PUB = '/home/z/my-project/public'

src = Image.open(SRC).convert('RGB')
print('source:', src.size)

# 1) Logo original copié dans public/
shutil.copyfile(SRC, f'{PUB}/drax-logo.png')

def rounded(im, radius):
    """Applique des coins arrondis (fond transparent)."""
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, im.size[0]-1, im.size[1]-1], radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out

def square(im, size, radius_ratio=0.0):
    im2 = im.resize((size, size), Image.LANCZOS)
    if radius_ratio > 0:
        im2 = rounded(im2, int(size * radius_ratio))
    return im2

# 2) favicon.png 96 (coins arrondis ~18%)
sq = square(src, 96, 0.18)
sq.save(f'{PUB}/favicon.png')

# 3) favicon.ico multi-tailles
ico_src = square(src, 256, 0.18)
ico_src.save(f'{PUB}/favicon.ico', sizes=[(16,16),(32,32),(48,48)])

# 4) apple-touch-icon 180x180 (iOS préfère un carré plein, léger arrondi iOS appliqué nativement)
apple = square(src, 180, 0.0)
apple.save(f'{PUB}/apple-touch-icon.png')

# 5) Icônes PWA
os.makedirs(f'{PUB}/icons', exist_ok=True)
square(src, 192, 0.18).save(f'{PUB}/icons/drax-192.png')

# 512 avec coin arrondi (roundable)
square(src, 512, 0.18).save(f'{PUB}/icons/drax-512.png')

# maskable 512 : logo à 78% centré sur fond sombre uni (zone sûre)
base = Image.new('RGB', (512, 512), (8, 10, 26))  # bleu nuit du logo
logo512 = square(src, 400, 0.12)
base.paste(logo512, (56, 56))
base.save(f'{PUB}/icons/drax-maskable-512.png')

# 6) OpenGraph 1200x630 : fond dégradé sombre + logo centré à gauche + texte
W, H = 1200, 630
og = Image.new('RGB', (W, H), (6, 8, 22))
d = ImageDraw.Draw(og)
# dégradé vertical bleu nuit -> noir
for y in range(H):
    t = y / H
    r = int(8 + (2-8)*t); g = int(12 + (4-12)*t); b = int(30 + (10-30)*t)
    d.line([(0, y), (W, y)], fill=(r, g, b))
# halo bleu derrière le logo
halo = Image.new('RGBA', (W, H), (0,0,0,0))
hd = ImageDraw.Draw(halo)
hd.ellipse([80, 40, 640, 600], fill=(30, 90, 220, 70))
halo = halo.filter(ImageFilter.GaussianBlur(80))
og.paste(Image.alpha_composite(og.convert('RGBA'), halo).convert('RGB'), (0, 0))
# logo
logo = square(src, 520, 0.10)
og.paste(logo, (70, 55))
# texte : essaie une police système disponible
from PIL import ImageFont
font_paths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]
font_big = font_small = None
for fp in font_paths:
    if os.path.exists(fp):
        font_big = ImageFont.truetype(fp, 96)
        font_small = ImageFont.truetype(fp, 34)
        break
if font_big:
    d.text((640, 240), 'DRAX IA', font=font_big, fill=(240, 244, 255))
    d.text((642, 360), 'Votre intelligence artificielle', font=font_small, fill=(120, 180, 255))
    d.text((642, 410), 'de nouvelle génération', font=font_small, fill=(120, 180, 255))
og.save(f'{PUB}/og-drax.png')

# Affiche le résultat
for f in ['drax-logo.png','favicon.png','favicon.ico','apple-touch-icon.png','icons/drax-192.png','icons/drax-512.png','icons/drax-maskable-512.png','og-drax.png']:
    p = f'{PUB}/{f}'
    print(f, os.path.getsize(p) // 1024, 'Ko')
print('OK — tous les dérivés générés')
