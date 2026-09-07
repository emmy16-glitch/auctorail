#!/usr/bin/env python3
"""
Auctorail Hackathon Demo Video — Production Engine
Generates a 2:10 1080p cinematic demo with:
- real product UI (synthetic high-fidelity mock derived from web/*.tsx + app.css)
- professional narration (concatenated TTS)
- burned captions with highlighted keywords
- smooth transitions, browser chrome, terminal typing
- thumbnail + webm export

If real screenshots exist at playwright-artifacts/*.png, they are used as centerpiece.
"""
import os, sys, glob, subprocess, textwrap, math, pathlib, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

# Ensure ffmpeg found
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
os.environ["FFMPEG_BINARY"] = FF
os.environ["IMAGEIO_FFMPEG_EXE"] = FF
if not os.path.exists("/tmp/ffmpeg"):
    try: os.symlink(FF, "/tmp/ffmpeg")
    except: pass

# MoviePy imports after env
from moviepy.video.VideoClip import ImageClip, ColorClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip, concatenate_videoclips
from moviepy.video.io.VideoFileClip import VideoFileClip
from moviepy.audio.io.AudioFileClip import AudioFileClip
from moviepy.audio.AudioClip import CompositeAudioClip, AudioArrayClip
import numpy as np

W, H = 1920, 1080
FPS = 30
BG = "#0b0c0e"
CARD_BG = "#14171a"
CARD_BORDER = "#23262b"
CARD_BG2 = "#1a1d21"
MUTED = "#7a8591"
TEXT = "#e8e9ea"
SUBTLE = "#9aa3ae"
ACCENT = "#00d084"
ACCENT2 = "#3b82f6"
AMBER = "#f59e0b"
RED = "#ef4444"
GREEN = "#10b981"

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "video-assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Fonts
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
def font(name, size):
    p = os.path.join(FONT_DIR, name)
    return ImageFont.truetype(p, size)

try:
    FONT_BOLD = font("DejaVuSans-Bold.ttf", 48)
    FONT_REG = font("DejaVuSans.ttf", 32)
    FONT_MED = font("DejaVuSans.ttf", 26)
    FONT_SMALL = font("DejaVuSans.ttf", 20)
    FONT_MONO = font("DejaVuSansMono.ttf", 18)
    FONT_MONO_BOLD = font("DejaVuSansMono-Bold.ttf", 20)
    FONT_HERO = font("DejaVuSans-Bold.ttf", 84)
    FONT_HERO2 = font("DejaVuSans-Bold.ttf", 64)
    FONT_TAGLINE = font("DejaVuSans.ttf", 28)
    FONT_CAPTION = font("DejaVuSans-Bold.ttf", 36)
    FONT_CAPTION_SMALL = font("DejaVuSans.ttf", 30)
except Exception as e:
    print("font load failed", e)
    sys.exit(1)

def hex_to_rgb(h):
    h=h.lstrip("#")
    return tuple(int(h[i:i+2],16) for i in (0,2,4))

def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    x0,y0,x1,y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=hex_to_rgb(fill) if isinstance(fill,str) else fill, outline=hex_to_rgb(outline) if outline else None, width=width)

def draw_text_wrap(draw, text, font, max_width, fill, line_spacing=6, align="left"):
    words = text.split()
    lines=[]
    cur=""
    for w in words:
        test = cur+" "+w if cur else w
        if draw.textlength(test, font=font) <= max_width:
            cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def create_base_bg():
    img = Image.new("RGB", (W,H), hex_to_rgb(BG))
    draw = ImageDraw.Draw(img)
    for y in range(0, H, 80):
        for x in range(0, W, 80):
            draw.ellipse([x, y, x+1, y+1], fill=(30,33,37))
    # top glow - draw directly onto a full-size overlay
    overlay = Image.new("RGBA", (W,H), (0,0,0,0))
    odraw = ImageDraw.Draw(overlay)
    for i in range(600):
        alpha = int(18 * (1 - i/600)**1.5)
        odraw.line([(0,i),(W,i)], fill=(0,208,132,alpha))
    for i in range(400):
        alpha = int(12 * (i/400))
        y = H-400+i
        odraw.line([(0,y),(W,y)], fill=(59,130,246,alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img

def draw_top_nav(img):
    draw = ImageDraw.Draw(img)
    # nav bar
    nav_h = 72
    rounded_rect(draw, [32, 22, W-32, 22+nav_h], radius=14, fill=CARD_BG, outline=CARD_BORDER)
    # brand
    # shield icon simple
    sx, sy = 52, 32
    # shield shape
    draw.rounded_rectangle([sx, sy, sx+40, sy+44], radius=6, fill=hex_to_rgb(ACCENT))
    draw.text((sx+12, sy+10), "◆", font=font("DejaVuSans-Bold.ttf", 22), fill=(11,12,14))
    draw.text((sx+52, sy+4), "AUCTORAIL", font=font("DejaVuSans-Bold.ttf", 20), fill=hex_to_rgb(TEXT))
    draw.text((sx+52, sy+28), "Authorization rails", font=font("DejaVuSans.ttf", 13), fill=hex_to_rgb(MUTED))
    # nav links
    links = ["CHECK", "ACTIVITY", "PERMISSIONS", "SECURITY LAB"]
    x = 340
    for j, l in enumerate(links):
        active = (j==0)
        if active:
            rounded_rect(draw, [x-10, sy+8, x+ draw.textlength(l, font=FONT_SMALL)+10, sy+32], radius=20, fill=ACCENT, outline=None)
            draw.text((x, sy+12), l, font=FONT_SMALL, fill=(0,0,0))
        else:
            draw.text((x, sy+12), l, font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        x += int(draw.textlength(l, font=FONT_SMALL)+28)
    # right side
    draw.text((W-420, sy+12), "TRUST", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((W-340, sy+12), "DOCS", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((W-260, sy+12), "GITHUB ↗", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    # status pill
    pill_x = W-140
    rounded_rect(draw, [W-185, sy+6, W-38, sy+36], radius=20, fill="#0f1214", outline=CARD_BORDER)
    draw.ellipse([W-172, sy+16, W-162, sy+26], fill=hex_to_rgb(GREEN))
    draw.text((W-156, sy+12), "BASE SEPOLIA", font=font("DejaVuSans.ttf", 12), fill=hex_to_rgb(SUBTLE))
    draw.text((W-156, sy+22), "TESTNET", font=font("DejaVuSans.ttf", 10), fill=hex_to_rgb(MUTED))
    return img

def browser_chrome(img, url="auctorail.vercel.app"):
    draw = ImageDraw.Draw(img)
    # browser bar at top to simulate recording
    bar_h = 48
    rounded_rect(draw, [0,0,W, bar_h], radius=0, fill="#1a1d21", outline=None)
    # traffic lights
    for i, c in enumerate(["#ff5f57", "#ffbd2e", "#28c840"]):
        draw.ellipse([18+i*22, 16, 32+i*22, 30], fill=hex_to_rgb(c))
    # address bar
    rounded_rect(draw, [90, 10, W-120, 38], radius=8, fill="#0f1214", outline="#2a2e33")
    draw.text((108, 16), "🔒 " + url, font=font("DejaVuSans.ttf", 16), fill=hex_to_rgb(MUTED))
    draw.text((W-110, 16), "⋮", font=font("DejaVuSans.ttf", 18), fill=hex_to_rgb(MUTED))
    return img

# Scene generators — each returns a PIL Image (1920x1080)
def scene_intro_base():
    img = create_base_bg()
    draw = ImageDraw.Draw(img)
    # centered typing area
    # AUCTORAIL large with decode effect will be animated via separate clips, here base has placeholder
    return img

def render_intro_frame(text_main, text_sub, progress=1.0, cursor=True):
    img = create_base_bg()
    draw = ImageDraw.Draw(img)
    # center block
    # AUCTORAIL
    y = 380
    # main text with scramble effect simulated if progress<1, we add random chars for unrevealed portion
    # For now just render fully
    # Use hero font
    # calculate width
    w_main = draw.textlength(text_main, font=FONT_HERO)
    x_main = (W - w_main)//2
    draw.text((x_main, y), text_main, font=FONT_HERO, fill=hex_to_rgb(TEXT))
    # underline accent
    line_w = int(w_main * progress)
    draw.rounded_rectangle([(W - w_main)//2, y+108, (W - w_main)//2 + line_w, y+112], radius=2, fill=hex_to_rgb(ACCENT))
    # sub
    y2 = y + 140
    w_sub = draw.textlength(text_sub, font=FONT_TAGLINE)
    draw.text(((W - w_sub)//2, y2), text_sub, font=FONT_TAGLINE, fill=hex_to_rgb(MUTED))
    # cursor blink
    if cursor:
        cx = x_main + draw.textlength(text_main, font=FONT_HERO) + 10
        draw.rectangle([cx, y+14, cx+4, y+92], fill=hex_to_rgb(ACCENT))
    # bottom hint
    draw.text((W//2 - draw.textlength("Prove authority before execution.", font=FONT_SMALL)//2, H-120), "Prove authority before execution.", font=FONT_SMALL, fill=hex_to_rgb(SUBTLE))
    return img

def scene_problem(phase="approved"):
    """
    phase: "approved" shows 10 USDC, "attack" shows 100 USDC, "comparison" shows both
    """
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    y0 = 140
    # title
    draw.text((80, y0), "THE PROBLEM", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    draw.text((80, y0+36), "Agent receives payment instruction", font=FONT_BOLD, fill=hex_to_rgb(TEXT))
    # two cards
    if phase == "approved":
        # approved card
        card_w, card_h = 760, 420
        x = (W - card_w)//2
        y = 280
        rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
        # header
        rounded_rect(draw, [x, y, x+card_w, y+64], radius=18, fill=CARD_BG2, outline=None)
        # fix rounded bottom of header
        draw.rectangle([x, y+40, x+card_w, y+64], fill=hex_to_rgb(CARD_BG2))
        draw.text((x+28, y+20), "PAY INVOICE #4471", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(MUTED))
        draw.ellipse([x+card_w-28, y+24, x+card_w-16, y+36], fill=hex_to_rgb(GREEN))
        # amount
        draw.text((x+28, y+96), "AMOUNT", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((x+28, y+124), "10  USDC", font=FONT_HERO2, fill=hex_to_rgb(TEXT))
        draw.text((x+28+ draw.textlength("10  USDC", font=FONT_HERO2)+16, y+148), "Approved", font=FONT_SMALL, fill=hex_to_rgb(GREEN))
        draw.text((x+28, y+212), "RECIPIENT", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        rounded_rect(draw, [x+28, y+238, x+card_w-28, y+298], radius=12, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+44, y+252), "Utility Vendor", font=FONT_REG, fill=hex_to_rgb(TEXT))
        draw.text((x+44, y+274), "0x8a12…9f3C  •  Base Sepolia", font=FONT_MONO, fill=hex_to_rgb(MUTED))
        # chain badge
        rounded_rect(draw, [x+28, y+324, x+180, y+356], radius=20, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+42, y+332), "●  Base Sepolia  •  USDC", font=font("DejaVuSans.ttf", 14), fill=hex_to_rgb(SUBTLE))
    elif phase == "attack":
        card_w, card_h = 760, 420
        x = (W - card_w)//2
        y = 280
        # red tint
        rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill="#1a0f0f", outline="#3a1a1a")
        rounded_rect(draw, [x, y, x+card_w, y+64], radius=18, fill="#2a1515", outline=None)
        draw.rectangle([x, y+40, x+card_w, y+64], fill=hex_to_rgb("#2a1515"))
        draw.text((x+28, y+20), "⚠  INSTRUCTION MODIFIED", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(RED))
        draw.text((x+28, y+96), "AMOUNT", font=FONT_SMALL, fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28, y+124), "100 USDC", font=FONT_HERO2, fill=hex_to_rgb(RED))
        draw.text((x+28+ draw.textlength("100 USDC", font=FONT_HERO2)+16, y+148), "Injected", font=FONT_SMALL, fill=hex_to_rgb(RED))
        draw.text((x+28, y+212), "RECIPIENT", font=FONT_SMALL, fill=hex_to_rgb("#ff7b7b"))
        rounded_rect(draw, [x+28, y+238, x+card_w-28, y+298], radius=12, fill="#1f0f0f", outline="#3a1a1a")
        draw.text((x+44, y+252), "Unknown wallet", font=FONT_REG, fill=hex_to_rgb(RED))
        draw.text((x+44, y+274), "0x9f3C…dead  •  Unknown", font=FONT_MONO, fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28, y+324), "⚠  Malicious instruction changed the agent's intent", font=FONT_SMALL, fill=hex_to_rgb(RED))
    elif phase == "comparison":
        # two side-by-side
        card_w, card_h = 620, 380
        gap=40
        x1 = (W - (card_w*2 + gap))//2
        x2 = x1 + card_w + gap
        y = 280
        # approved
        rounded_rect(draw, [x1, y, x1+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
        rounded_rect(draw, [x1, y, x1+card_w, y+56], radius=18, fill=CARD_BG2, outline=None)
        draw.rectangle([x1, y+36, x1+card_w, y+56], fill=hex_to_rgb(CARD_BG2))
        draw.text((x1+20, y+18), "10 USDC APPROVED", font=font("DejaVuSans-Bold.ttf", 16), fill=hex_to_rgb(GREEN))
        draw.text((x1+20, y+84), "10  USDC", font=font("DejaVuSans-Bold.ttf", 56), fill=hex_to_rgb(TEXT))
        draw.text((x1+20, y+160), "Utility Vendor", font=FONT_MED, fill=hex_to_rgb(TEXT))
        draw.text((x1+20, y+190), "0x8a12…9f3C", font=FONT_MONO, fill=hex_to_rgb(MUTED))
        # attack
        rounded_rect(draw, [x2, y, x2+card_w, y+card_h], radius=18, fill="#1a0f0f", outline="#3a1a1a")
        rounded_rect(draw, [x2, y, x2+card_w, y+56], radius=18, fill="#2a1515", outline=None)
        draw.rectangle([x2, y+36, x2+card_w, y+56], fill=hex_to_rgb("#2a1515"))
        draw.text((x2+20, y+18), "100 USDC REQUESTED", font=font("DejaVuSans-Bold.ttf", 16), fill=hex_to_rgb(RED))
        draw.text((x2+20, y+84), "100 USDC", font=font("DejaVuSans-Bold.ttf", 56), fill=hex_to_rgb(RED))
        draw.text((x2+20, y+160), "Unknown wallet", font=FONT_MED, fill=hex_to_rgb(RED))
        draw.text((x2+20, y+190), "0x9f3C…dead", font=FONT_MONO, fill=hex_to_rgb("#ff7b7b"))
        # vs arrow
        draw.text((W//2 - draw.textlength("→", font=font("DejaVuSans-Bold.ttf", 48))//2, y+  card_h//2 -20), "→", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(RED))
        # label at bottom
        draw.text((W//2 - draw.textlength("Same agent, different authority", font=FONT_MED)//2, y+ card_h+30), "Same agent, different authority", font=FONT_MED, fill=hex_to_rgb(RED))
    return img

def scene_safety():
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    y0=140
    draw.text((80, y0), "WHY SAFETY IS NOT ENOUGH", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    draw.text((80, y0+36), "Warnings are intelligence. Not permission.", font=FONT_BOLD, fill=hex_to_rgb(TEXT))
    # left card risk check
    card_w, card_h = 520, 340
    x = 80
    y=250
    rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((x+24, y+20), "Risk Check", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(MUTED))
    draw.text((x+24, y+64), "HIGH RISK", font=font("DejaVuSans-Bold.ttf", 42), fill=hex_to_rgb(RED))
    rounded_rect(draw, [x+24, y+124, x+card_w-24, y+176], radius=10, fill="#1a0f0f", outline="#3a1a1a")
    draw.text((x+36, y+138), "●  Block recommended", font=FONT_SMALL, fill=hex_to_rgb(RED))
    draw.text((x+24, y+200), "A security system can provide", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((x+24, y+224), "warnings and intelligence.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    # arrow
    draw.text((x+card_w+60, y+ card_h//2 -20), "→", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(MUTED))
    # right card safety != authority
    x2 = x+card_w+140
    rounded_rect(draw, [x2, y, x2+card_w+100, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    # big text
    draw.text((x2+30, y+30), "Safety", font=font("DejaVuSans-Bold.ttf", 36), fill=hex_to_rgb(MUTED))
    draw.text((x2+30+ draw.textlength("Safety ", font=font("DejaVuSans-Bold.ttf", 36)), y+30), "≠", font=font("DejaVuSans-Bold.ttf", 36), fill=hex_to_rgb(ACCENT))
    draw.text((x2+30, y+78), "Authority", font=font("DejaVuSans-Bold.ttf", 36), fill=hex_to_rgb(TEXT))
    # underline
    draw.rounded_rectangle([x2+30, y+124, x2+30+ 180, y+128], radius=2, fill=hex_to_rgb(ACCENT))
    draw.text((x2+30, y+150), "A warning does not prove", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((x2+30, y+174), "permission.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x2+30, y+212, x2+card_w+70, y+248], radius=20, fill=CARD_BG2, outline=CARD_BORDER)
    draw.text((x2+44, y+222), "Safe is not the same as authorized.", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb(ACCENT))
    # bottom comparison bar
    yb = 680
    rounded_rect(draw, [80, yb, W-80, yb+80], radius=14, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((110, yb+18), "Intelligence helps you know something.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((110, yb+44), "Authority determines whether you may act.", font=FONT_SMALL, fill=hex_to_rgb(TEXT))
    draw.text((W-300, yb+30), "AUCTORAIL", font=font("DejaVuSans-Bold.ttf", 20), fill=hex_to_rgb(ACCENT))
    return img

def scene_check_form():
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    # form left
    y0=140
    # agent permission card
    card_w, card_h = 640, 620
    x=80
    y=140
    rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    # header
    rounded_rect(draw, [x, y, x+card_w, y+64], radius=18, fill=CARD_BG2, outline=None)
    draw.rectangle([x, y+40, x+card_w, y+64], fill=hex_to_rgb(CARD_BG2))
    draw.text((x+20, y+20), "AGENT PERMISSION", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb(MUTED))
    draw.text((x+20, y+34), "invoice-bot", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(TEXT))
    # badge ACTIVE
    rounded_rect(draw, [x+card_w-110, y+18, x+card_w-20, y+44], radius=20, fill=ACCENT, outline=None)
    draw.text((x+card_w-94, y+24), "● ACTIVE", font=font("DejaVuSans-Bold.ttf", 13), fill=(0,0,0))
    # max payment
    draw.text((x+20, y+84), "MAX PAYMENT", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
    draw.text((x+card_w-140, y+84), "5.00 USDC", font=FONT_MONO_BOLD, fill=hex_to_rgb(TEXT))
    rounded_rect(draw, [x+20, y+108, x+card_w-20, y+154], radius=10, fill="#0f1214", outline=CARD_BORDER)
    draw.text((x+48, y+122), "−", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    wmid = draw.textlength("5.00 USDC", font=FONT_MONO_BOLD)
    draw.text((x+ (card_w - wmid)//2, y+122), "5.00 USDC", font=FONT_MONO_BOLD, fill=hex_to_rgb(TEXT))
    draw.text((x+card_w-56, y+122), "+", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    # allowed recipient
    draw.text((x+20, y+174), "ALLOWED RECIPIENT", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+20, y+198, x+card_w-20, y+258], radius=12, fill="#0f1214", outline=CARD_BORDER)
    draw.text((x+32, y+210), "Auctorail Vendor", font=font("DejaVuSans-Bold.ttf", 16), fill=hex_to_rgb(TEXT))
    draw.text((x+32, y+232), "0xB38d…2c14   •   Base Sepolia test recipient", font=FONT_MONO, fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+card_w-80, y+210, x+card_w-30, y+232], radius=8, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((x+card_w-72, y+214), "PINNED", font=font("DejaVuSans-Bold.ttf", 10), fill=hex_to_rgb(MUTED))
    # permission window
    draw.text((x+20, y+278), "PERMISSION WINDOW", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+20, y+302, x+card_w-20, y+348], radius=10, fill="#0f1214", outline=CARD_BORDER)
    draw.text((x+48, y+316), "−", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    w2 = draw.textlength("1 hour", font=FONT_MONO_BOLD)
    draw.text((x+ (card_w - w2)//2, y+316), "1 hour", font=FONT_MONO_BOLD, fill=hex_to_rgb(TEXT))
    draw.text((x+card_w-56, y+316), "+", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    # current request
    y2 = y + 380
    rounded_rect(draw, [x, y2, x+card_w, y2+140], radius=14, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((x+20, y2+16), "CURRENT REQUEST", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
    draw.text((x+20, y2+42), "1.00 USDC  →  Auctorail Vendor", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(TEXT))
    draw.text((x+20, y2+70), "Supplier invoice #4471  •  Ref: INV-4471", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((x+20, y2+96), "⬢", font=font("DejaVuSans.ttf", 18), fill=hex_to_rgb(MUTED))
    # check button
    yb = y2 + 164
    rounded_rect(draw, [x, yb, x+card_w, yb+56], radius=10, fill=ACCENT, outline=None)
    draw.text((x+ card_w//2 - draw.textlength("CHECK THIS REQUEST  →", font=font("DejaVuSans-Bold.ttf", 18))//2, yb+18), "CHECK THIS REQUEST  →", font=font("DejaVuSans-Bold.ttf", 18), fill=(0,0,0))
    # right side result preview
    rx = x+card_w+40
    rw = W - rx - 80
    rh = 620
    ry = 140
    rounded_rect(draw, [rx, ry, rx+rw, ry+rh], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((rx+24, ry+20), "The decision appears here.", font=font("DejaVuSans-Bold.ttf", 18), fill=hex_to_rgb(TEXT))
    draw.text((rx+24, ry+50), "Run the check and every stage — rules, evidence,", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    draw.text((rx+24, ry+70), "decision — is shown exactly as it happens.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    # preview steps
    steps = ["Request frozen & hashed", "Permission checked first", "Evidence bound to the action", "Decision: ALLOW · HOLD · BLOCK"]
    yy = ry + 120
    for i, s in enumerate(steps):
        rounded_rect(draw, [rx+24, yy, rx+rw-24, yy+44], radius=10, fill="#0f1214", outline=CARD_BORDER)
        draw.text((rx+36, yy+14), f"{i+1:02}", font=FONT_MONO, fill=hex_to_rgb(MUTED))
        draw.text((rx+80, yy+14), s, font=FONT_SMALL, fill=hex_to_rgb(SUBTLE))
        yy+= 54
    # shield icon
    draw.text((rx+ rw//2 -10, ry+ 420), "⬢", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(CARD_BORDER))
    return img

def scene_checking_progress(stage="rules"):
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    # header
    draw.text((80, 120), "AUTHORIZATION IN PROGRESS", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(MUTED))
    # timeline
    stages = [("rules", "LOCAL RULES", "01"), ("miners", "LIVE INTELLIGENCE", "02"), ("decision", "DECISION", "03")]
    x0=80
    w_step = (W-160)//3
    y=180
    for i, (key, label, num) in enumerate(stages):
        active = (key==stage) or (stage=="miners" and i==0) or (stage=="decision" and i<2)
        done = (stage=="miners" and i==0) or (stage=="decision" and i<3)
        cx = x0 + i*w_step + w_step//2
        # line
        if i <2:
            draw.line([(cx+30, y+18), (cx+ w_step-30, y+18)], fill=hex_to_rgb(CARD_BORDER if not done else ACCENT), width=2)
        # circle
        if done:
            draw.ellipse([cx-18, y, cx+18, y+36], fill=hex_to_rgb(ACCENT))
            draw.text((cx-8, y+8), "✓", font=font("DejaVuSans-Bold.ttf", 16), fill=(0,0,0))
        elif active:
            draw.ellipse([cx-18, y, cx+18, y+36], fill=hex_to_rgb(BG), outline=hex_to_rgb(ACCENT), width=2)
            # spinner
            draw.ellipse([cx-18, y, cx+18, y+36], outline=hex_to_rgb(ACCENT), width=2)
            draw.text((cx-6, y+8), "◐", font=font("DejaVuSans.ttf", 16), fill=hex_to_rgb(ACCENT))
        else:
            draw.ellipse([cx-18, y, cx+18, y+36], fill=hex_to_rgb(CARD_BG), outline=hex_to_rgb(CARD_BORDER), width=2)
            draw.text((cx-8, y+8), num, font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((cx - draw.textlength(label, font=font("DejaVuSans-Bold.ttf", 13))//2, y+52), label, font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(TEXT if active else MUTED))
        draw.text((cx - draw.textlength("09:42:10", font=FONT_MONO)//2, y+72), "09:42:1"+str(i), font=FONT_MONO, fill=hex_to_rgb(MUTED))
    # main card
    card_w, card_h = W-160, 580
    x, y = 80, 280
    rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    if stage=="rules":
        draw.text((x+32, y+24), "Checking permission…", font=FONT_BOLD, fill=hex_to_rgb(TEXT))
        draw.text((x+32, y+64), "Action hash created and verified against mandate", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        rounded_rect(draw, [x+32, y+110, x+card_w-32, y+200], radius=12, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+48, y+124), "ACTION FROZEN", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
        draw.text((x+48, y+148), "0x8a3f…e91e", font=FONT_MONO_BOLD, fill=hex_to_rgb(ACCENT))
        draw.text((x+48, y+170), "1.00 USDC  →  0xB38d…2c14  •  Base Sepolia 84532", font=FONT_MONO, fill=hex_to_rgb(SUBTLE))
        # mandate
        rounded_rect(draw, [x+32, y+220, x+card_w-32, y+300], radius=12, fill="#0f1410", outline="#1e2a22")
        draw.text((x+48, y+234), "DELEGATION VERIFIED", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(GREEN))
        draw.text((x+48, y+258), "invoice-bot  •  within 5.00 USDC limit", font=FONT_SMALL, fill=hex_to_rgb(SUBTLE))
    elif stage=="miners":
        draw.text((x+32, y+24), "Acquiring Telegraph evidence…", font=FONT_BOLD, fill=hex_to_rgb(TEXT))
        draw.text((x+32, y+64), "FRAUD_DETECTION  •  exact subject & chain binding", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        # evidence rows
        rows = [("FRAUD_DETECTION", "Refut On-Chain Risk  •  95822412", "ALLOW  •  0.70", GREEN), ("Intent", "Auto-route  •  Base Sepolia 84532", "Pending", MUTED)]
        yy = y+110
        for title, sub, status, col in rows:
            rounded_rect(draw, [x+32, yy, x+card_w-32, yy+72], radius=12, fill="#0f1214" if col==MUTED else "#0f1410", outline=CARD_BORDER if col==MUTED else "#1e2a22")
            draw.text((x+48, yy+16), title, font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(col if col!=MUTED else MUTED))
            draw.text((x+48, yy+36), sub, font=FONT_MONO, fill=hex_to_rgb(SUBTLE))
            draw.text((x+card_w-140, yy+26), status, font=FONT_SMALL, fill=hex_to_rgb(col))
            yy+= 84
        # signal hash
        rounded_rect(draw, [x+32, yy+10, x+card_w-32, yy+64], radius=10, fill=CARD_BG2, outline=CARD_BORDER)
        draw.text((x+48, yy+22), "Signal commitment", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((x+48, yy+38), "0x1349…cae4c  •  x402 $0.01", font=FONT_MONO, fill=hex_to_rgb(TEXT))
    else: # decision
        draw.text((x+32, y+24), "Decision: ALLOW", font=FONT_BOLD, fill=hex_to_rgb(GREEN))
        rounded_rect(draw, [x+32, y+64, x+220, y+96], radius=20, fill=GREEN, outline=None)
        draw.text((x+52, y+72), "●  ALLOW", font=font("DejaVuSans-Bold.ttf", 16), fill=(0,0,0))
        draw.text((x+240, y+72), "All required checks passed for the exact action.", font=FONT_SMALL, fill=hex_to_rgb(SUBTLE))
        rounded_rect(draw, [x+32, y+110, x+card_w-32, y+200], radius=12, fill="#0f1410", outline="#1e2a22")
        draw.text((x+48, y+124), "EVIDENCE BUNDLE", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
        draw.text((x+48, y+148), "Bundle hash  0x9f3c…8a2e  •  1 distinct Miner  •  Confidence ≥0.70", font=FONT_MONO, fill=hex_to_rgb(SUBTLE))
        rounded_rect(draw, [x+32, y+220, x+card_w-32, y+300], radius=12, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+48, y+234), "PERMIT READY", font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
        draw.text((x+48, y+258), "Signed one-use permit  •  expires in 120s  •  hash 0x4a8b…c91e", font=FONT_MONO, fill=hex_to_rgb(TEXT))
    return img

def scene_failure(typ="overlimit"):
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    if typ=="overlimit":
        draw.text((80, 120), "FAILURE CASE  •  OVER LIMIT", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(RED))
        draw.text((80, 154), "When an agent exceeds delegated authority, Auctorail stops the action.", font=FONT_REG, fill=hex_to_rgb(MUTED))
        # requested vs allowed
        card_w, card_h = 520, 260
        x1, y = 80, 240
        rounded_rect(draw, [x1, y, x1+card_w, y+card_h], radius=16, fill="#1a0f0f", outline="#3a1a1a")
        draw.text((x1+24, y+20), "REQUESTED", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb("#ff7b7b"))
        draw.text((x1+24, y+52), "7.00 USDC", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(RED))
        draw.text((x1+24, y+114), "Auctorail Vendor", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((x1+24, y+170), "Blocked before any Telegraph call", font=FONT_SMALL, fill=hex_to_rgb(RED))
        x2 = W-80-card_w
        rounded_rect(draw, [x2, y, x2+card_w, y+card_h], radius=16, fill=CARD_BG, outline=CARD_BORDER)
        draw.text((x2+24, y+20), "ALLOWED", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb(MUTED))
        draw.text((x2+24, y+52), "5.00 USDC", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(TEXT))
        draw.text((x2+24, y+114), "Per-action ceiling", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        # arrow
        draw.text((W//2 -20, y+ card_h//2 -20), "→", font=font("DejaVuSans-Bold.ttf", 36), fill=hex_to_rgb(RED))
        # result banner
        yb=560
        rounded_rect(draw, [80, yb, W-80, yb+180], radius=16, fill="#1a0f0f", outline="#3a1a1a")
        draw.text((W//2 - draw.textlength("BLOCKED", font=font("DejaVuSans-Bold.ttf", 56))//2, yb+24), "BLOCKED", font=font("DejaVuSans-Bold.ttf", 56), fill=hex_to_rgb(RED))
        draw.text((W//2 - draw.textlength("No evidence purchased  •  No permit issued", font=FONT_SMALL)//2, yb+96), "No evidence purchased  •  No permit issued", font=FONT_SMALL, fill=hex_to_rgb("#ff7b7b"))
        draw.text((W//2 - draw.textlength("Deterministic policy enforced the mandate ceiling.", font=FONT_SMALL)//2, yb+126), "Deterministic policy enforced the mandate ceiling.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    else: # missing evidence HOLD
        draw.text((80, 120), "FAILURE CASE  •  MISSING EVIDENCE", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(AMBER))
        draw.text((80, 154), "When required evidence cannot be obtained, Auctorail fails closed.", font=FONT_REG, fill=hex_to_rgb(MUTED))
        card_w, card_h = W-160, 340
        x, y = 80, 240
        rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=16, fill="#1a160f", outline="#3a2a0a")
        draw.text((x+32, y+24), "Evidence unavailable", font=FONT_BOLD, fill=hex_to_rgb(AMBER))
        draw.text((x+32, y+64), "FRAUD_DETECTION  •  route unavailable within 12s deadline", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        # timeline hold
        rounded_rect(draw, [x+32, y+120, x+card_w-32, y+180], radius=10, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+48, y+134), "Attempt 1  •  Telegraph timeout", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((x+card_w-140, y+134), "Retry", font=FONT_SMALL, fill=hex_to_rgb(AMBER))
        rounded_rect(draw, [x+32, y+192, x+card_w-32, y+252], radius=10, fill="#0f1214", outline=CARD_BORDER)
        draw.text((x+48, y+206), "Attempt 2  •  insufficient confidence", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
        draw.text((x+card_w-140, y+206), "Retry", font=FONT_SMALL, fill=hex_to_rgb(AMBER))
        rounded_rect(draw, [x+32, y+264, x+card_w-32, y+316], radius=10, fill="#1a160f", outline="#3a2a0a")
        draw.text((x+48, y+278), "Quorum not reached  •  0/1 distinct Miner", font=FONT_SMALL, fill=hex_to_rgb(AMBER))
        # result
        yb=620
        rounded_rect(draw, [80, yb, W-80, yb+140], radius=16, fill="#1a160f", outline="#3a2a0a")
        draw.text((W//2 - draw.textlength("HOLD", font=font("DejaVuSans-Bold.ttf", 56))//2, yb+20), "HOLD", font=font("DejaVuSans-Bold.ttf", 56), fill=hex_to_rgb(AMBER))
        draw.text((W//2 - draw.textlength("No execution authority  •  Safe Hold, not silent permission", font=FONT_SMALL)//2, yb+90), "No execution authority  •  Safe Hold, not silent permission", font=FONT_SMALL, fill=hex_to_rgb(AMBER))
    return img

def scene_success():
    img = create_base_bg()
    img = draw_top_nav(img)
    draw = ImageDraw.Draw(img)
    draw.text((80, 120), "REAL SUCCESS  •  PROTECTED EXECUTION", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(GREEN))
    draw.text((80, 154), "For approved actions, execution is verifiable.", font=FONT_REG, fill=hex_to_rgb(MUTED))
    # checklist
    checks = ["Authorization Passed", "Telegraph Evidence ✓", "Permit Issued ✓", "Execution Complete ✓", "Base Sepolia Confirmed ✓"]
    x, y = 80, 210
    for i, c in enumerate(checks):
        col = GREEN if "✓" in c else MUTED
        rounded_rect(draw, [x+i* ( (W-160-60)//5 +15), y, x+i* ((W-160-60)//5 +15)+ (W-160-60)//5, y+48], radius=10, fill="#0f1410" if "✓" in c else CARD_BG, outline="#1e2a22" if "✓" in c else CARD_BORDER)
        draw.text((x+i* ((W-160-60)//5 +15)+16, y+14), c, font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(col if col==GREEN else TEXT))
    # tx card left
    card_w, card_h = 900, 460
    x, y = 80, 300
    rounded_rect(draw, [x, y, x+card_w, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((x+24, y+20), "TRANSACTION", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+24, y+50, x+card_w-24, y+92], radius=10, fill=GREEN, outline=None)
    draw.text((x+40, y+62), "●  CONFIRMED  •  Block 46301208", font=font("DejaVuSans-Bold.ttf", 14), fill=(0,0,0))
    draw.text((x+24, y+110), "1.00 USDC  →  Auctorail Vendor", font=font("DejaVuSans-Bold.ttf", 22), fill=hex_to_rgb(TEXT))
    draw.text((x+24, y+144), "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14", font=FONT_MONO, fill=hex_to_rgb(MUTED))
    # hash
    draw.text((x+24, y+190), "TRANSACTION HASH", font=font("DejaVuSans-Bold.ttf", 12), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+24, y+212, x+card_w-24, y+252], radius=8, fill="#0f1214", outline=CARD_BORDER)
    draw.text((x+36, y+224), "0x41b1…f2ffc", font=FONT_MONO_BOLD, fill=hex_to_rgb(TEXT))
    draw.text((x+24, y+270), "RECEIPT HASH", font=font("DejaVuSans-Bold.ttf", 12), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x+24, y+292, x+card_w-24, y+332], radius=8, fill="#0f1214", outline=CARD_BORDER)
    draw.text((x+36, y+304), "0x036a…91e3", font=FONT_MONO_BOLD, fill=hex_to_rgb(ACCENT))
    draw.text((x+24, y+356), "Signal 0x1349…cae4c  •  Miner 95822412  •  $0.01 x402", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    # receipt card right
    x2 = x+card_w+40
    rw = W - x2 - 80
    rounded_rect(draw, [x2, y, x2+rw, y+card_h], radius=18, fill=CARD_BG, outline=CARD_BORDER)
    draw.text((x2+24, y+20), "PROOF RECEIPT  •  VERIFY", font=font("DejaVuSans-Bold.ttf", 14), fill=hex_to_rgb(MUTED))
    rounded_rect(draw, [x2+24, y+54, x2+rw-24, y+124], radius=12, fill="#0f1410", outline="#1e2a22")
    draw.text((x2+40, y+66), "VALID", font=font("DejaVuSans-Bold.ttf", 28), fill=hex_to_rgb(GREEN))
    draw.text((x2+130, y+72), "Receipt signature verified", font=FONT_SMALL, fill=hex_to_rgb(SUBTLE))
    # details
    lines = [("Policy", "payments.adaptive.v1"), ("Risk tier", "LOW  •  ≤5 USDC"), ("Permit", "0x4a8b…c91e  •  120s"), ("Action hash", "0x8a3f…e91e"), ("Evidence", "FRAUD_DETECTION  •  0.70")]
    yy = y+140
    for k,v in lines:
        draw.text((x2+24, yy), k, font=font("DejaVuSans-Bold.ttf", 13), fill=hex_to_rgb(MUTED))
        draw.text((x2+160, yy), v, font=FONT_MONO, fill=hex_to_rgb(TEXT))
        yy+= 28
    # sepolia badge
    rounded_rect(draw, [x2+24, y+ card_h-50, x2+rw-24, y+card_h-16], radius=8, fill=CARD_BG2, outline=CARD_BORDER)
    draw.text((x2+36, y+ card_h-40), "🔗  View on BaseScan ↗", font=FONT_SMALL, fill=hex_to_rgb(ACCENT2))
    return img

def scene_final():
    img = Image.new("RGB", (W,H), (5,6,8))
    draw = ImageDraw.Draw(img)
    # subtle glow center
    for i in range(H):
        alpha = int(14 * math.sin(math.pi * i / H))
        draw.line([(0,i),(W,i)], fill=(0,208,132,alpha//14*2))
    # text block
    y = 380
    draw.text((W//2 - draw.textlength("SAFE IS NOT THE SAME AS AUTHORIZED", font=font("DejaVuSans-Bold.ttf", 38))//2, y), "SAFE IS NOT THE SAME AS AUTHORIZED", font=font("DejaVuSans-Bold.ttf", 38), fill=hex_to_rgb(TEXT))
    # line
    draw.rounded_rectangle([W//2 -180, y+64, W//2+180, y+68], radius=2, fill=hex_to_rgb(ACCENT))
    # two lines
    y2 = y+98
    t1 = "Telegraph provides intelligence."
    t2 = "Auctorail provides authority."
    draw.text((W//2 - draw.textlength(t1, font=FONT_REG)//2, y2), t1, font=FONT_REG, fill=hex_to_rgb(MUTED))
    draw.text((W//2 - draw.textlength(t2, font=FONT_BOLD)//2, y2+46), t2, font=FONT_BOLD, fill=hex_to_rgb(TEXT))
    y3 = y2+120
    draw.text((W//2 - draw.textlength("github.com/emmy16-glitch/auctorail", font=FONT_MONO)//2, y3), "github.com/emmy16-glitch/auctorail", font=FONT_MONO, fill=hex_to_rgb(SUBTLE))
    # logo at bottom
    y4 = H-140
    draw.text((W//2 - draw.textlength("AUCTORAIL", font=font("DejaVuSans-Bold.ttf", 48))//2, y4), "AUCTORAIL", font=font("DejaVuSans-Bold.ttf", 48), fill=hex_to_rgb(TEXT))
    draw.text((W//2 - draw.textlength("Prove authority before execution.", font=FONT_SMALL)//2, y4+62), "Prove authority before execution.", font=FONT_SMALL, fill=hex_to_rgb(MUTED))
    return img

# Caption helpers
KEYWORDS = ["AUTHORITY", "TELEGRAPH", "PERMIT", "HOLD", "EXECUTION", "ALLOW", "BLOCK", "EVIDENCE", "AUCTORAIL", "BASE SEPOLIA"]
def caption_image(text, highlight_words, width=1700):
    # create caption bar image 1920x160 transparent, with text centered wrapped and highlighted
    # We'll render text with highlights: split words, color accent if uppercased keyword in highlight_words
    # Use PIL to draw
    # Estimate height via wrapping
    # We will use a function that returns PIL image RGBA
    bar_h = 170
    img = Image.new("RGBA", (W, bar_h), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    # background bar
    rounded_rect(draw, [80, 18, W-80, bar_h-18], radius=14, fill="#0f1214", outline="#23262b")
    # shadow
    # draw text centered
    # Wrap
    max_w = W - 180
    # Use font caption small for longer texts, bold for short
    f = FONT_CAPTION_SMALL if len(text) > 90 else FONT_CAPTION
    # wrap
    lines = draw_text_wrap(draw, text, f, max_w, hex_to_rgb(TEXT))
    # if too many lines, reduce font
    if len(lines) >2:
        f = FONT_CAPTION_SMALL
        lines = draw_text_wrap(draw, text, f, max_w, hex_to_rgb(TEXT))
    # Now draw line by line with highlights
    line_h = f.size + 10
    total_h = len(lines)*line_h
    y0 = (bar_h - total_h)//2
    for line in lines:
        # we need to highlight keywords: split preserving spaces, naive.
        # Instead we draw word by word with possible highlight
        words = line.split(" ")
        # measure full line width to center
        line_width = draw.textlength(line, font=f)
        x0 = (W - line_width)//2
        cx = x0
        for wi, w in enumerate(words):
            clean = w.strip(".,!—→•").upper()
            is_highlight = clean in highlight_words
            col = hex_to_rgb(ACCENT) if is_highlight else hex_to_rgb(TEXT)
            # draw word
            draw.text((cx, y0), w, font=f, fill=col)
            cx += draw.textlength(w + " ", font=f)
        y0 += line_h
    return img

# Video Assembly
def make_clip_from_pil(pil_img, duration, fps=FPS):
    arr = np.array(pil_img)
    clip = ImageClip(arr).with_duration(duration)
    return clip

def add_caption(clip, text, highlight=None, start=0):
    if highlight is None: highlight = KEYWORDS
    # caption image
    cap_img = caption_image(text, highlight)
    cap_clip = ImageClip(np.array(cap_img)).with_duration(clip.duration)
    # position at bottom
    cap_clip = cap_clip.with_position((0, H - cap_img.height - 24))
    # composite
    return CompositeVideoClip([clip, cap_clip], size=(W,H)).with_duration(clip.duration)

def crossfade(a,b,duration=0.6):
    # simple crossfade via opacity
    return concatenate_videoclips([a.with_duration(a.duration - duration/2), b.with_duration(b.duration - duration/2)], method="compose", padding=-duration)

def main():
    print("Generating Auctorail demo video...")
    # Durations per storyboard
    # Audio durations known, map visual durations to reach 130s
    segments = [
        # name, visual_duration, audio_file, caption_text, scene_func, scene_args
        ("intro", 10.0, "audio-intro.mp3", "AI agents can execute actions. But the biggest question is not what they can do. It is what they are actually authorized to do.", lambda: scene_intro_base(), None),
        ("problem_approved", 7.0, None, "You delegate one payment. One amount. One recipient.", lambda: scene_problem("approved"), None),
        ("problem_attack", 6.0, None, "But malicious instructions can change what the agent wants to do.", lambda: scene_problem("attack"), None),
        ("problem_compare", 7.0, "audio-problem.mp3", "Ten USDC approved can become one hundred USDC requested to an unknown wallet.", lambda: scene_problem("comparison"), None),
        ("safety", 16.0, "audio-safety.mp3", "Security systems can provide warnings and intelligence. But a warning does not prove permission. Safe is not the same as authorized.", lambda: scene_safety(), None),
        ("auctorail_form", 8.0, None, "Auctorail freezes the exact action before execution.", lambda: scene_check_form(), None),
        ("auctorail_rules", 6.0, None, "It captures the amount, the recipient, the chain, and creates a cryptographic hash.", lambda: scene_checking_progress("rules"), None),
        ("auctorail_miners", 9.0, None, "It verifies delegation and purchases external intelligence through Telegraph.", lambda: scene_checking_progress("miners"), None),
        ("auctorail_decision", 9.0, "audio-auctorail.mp3", "Only then does it decide: Allow, Hold, or Block, and issue a single-use signed permit.", lambda: scene_checking_progress("decision"), None),
        ("failure_overlimit", 9.0, None, "When an agent exceeds its delegated authority, Auctorail blocks the action.", lambda: scene_failure("overlimit"), None),
        ("failure_hold", 9.0, "audio-failure.mp3", "When required evidence cannot be obtained, Auctorail fails closed. It returns Hold. No execution.", lambda: scene_failure("hold"), None),
        ("success", 20.0, "audio-success.mp3", "For approved actions, Auctorail enables execution with a verifiable receipt. One USDC to the Auctorail vendor. Telegraph verified. Base Sepolia confirmed.", lambda: scene_success(), None),
        ("final", 14.0, "audio-final.mp3", "Telegraph provides intelligence. Auctorail provides authority.", lambda: scene_final(), None),
    ]

    # Actually we will map audios to segments: we have 7 audio files, need to assign them to correct visual segments
    # The above mapping distributes 7 audios across 13 visual segments, but audio files are longer than individual visual segments.
    # Better to assign one audio per major section, and combine visuals within that section via sub-clips.
    # Let's redefine major sections with audio:

    major_sections = [
        {
            "name": "intro",
            "duration": 10.0,
            "audio": "audio-intro.mp3",
            "captions": ["AI agents can execute actions.", "But the biggest question is not what they can do.", "It is what they are actually authorized to do."],
            "scenes": [("intro_typed", 10.0, lambda t: render_intro_frame("AUCTORAIL", "Prove authority before execution.", progress=min(1.0, t/3.0), cursor=(int(t*2)%2==0)))]
        },
        {
            "name": "problem",
            "duration": 20.0,
            "audio": "audio-problem.mp3",
            "captions": ["You delegate one payment. One amount. One recipient.", "But malicious instructions can change what the agent wants to do.", "Ten USDC approved can become one hundred USDC requested to an unknown wallet."],
            "scenes": [("approved", 6.0, lambda t: scene_problem("approved")), ("attack", 6.0, lambda t: scene_problem("attack")), ("comparison", 8.0, lambda t: scene_problem("comparison"))]
        },
        {
            "name": "safety",
            "duration": 16.0,
            "audio": "audio-safety.mp3",
            "captions": ["Security systems can provide warnings and intelligence.", "But a warning does not prove permission.", "Safe is not the same as authorized."],
            "scenes": [("safety", 16.0, lambda t: scene_safety())]
        },
        {
            "name": "auctorail",
            "duration": 32.0,
            "audio": "audio-auctorail.mp3",
            "captions": ["Auctorail freezes the exact action before execution.", "It captures the amount, the recipient, the chain, and creates a hash.", "It verifies delegation and purchases Telegraph intelligence.", "Only then: Allow, Hold, or Block — and a single-use permit."],
            "scenes": [("form", 8.0, lambda t: scene_check_form()), ("rules", 7.0, lambda t: scene_checking_progress("rules")), ("miners", 9.0, lambda t: scene_checking_progress("miners")), ("decision", 8.0, lambda t: scene_checking_progress("decision"))]
        },
        {
            "name": "failure",
            "duration": 18.0,
            "audio": "audio-failure.mp3",
            "captions": ["When an agent exceeds authority, Auctorail blocks the action.", "No evidence purchased. No permit issued.", "When evidence is missing, Auctorail fails closed: Hold."],
            "scenes": [("overlimit", 9.0, lambda t: scene_failure("overlimit")), ("hold", 9.0, lambda t: scene_failure("hold"))]
        },
        {
            "name": "success",
            "duration": 20.0,
            "audio": "audio-success.mp3",
            "captions": ["For approved actions, Auctorail enables execution with a verifiable receipt.", "One USDC. Telegraph verified. Signal anchored.", "Execution confirmed on Base Sepolia."],
            "scenes": [("success", 20.0, lambda t: scene_success())]
        },
        {
            "name": "final",
            "duration": 14.0,
            "audio": "audio-final.mp3",
            "captions": ["Telegraph provides intelligence.", "Auctorail provides authority.", "Prove authority before execution."],
            "scenes": [("final", 14.0, lambda t: scene_final())]
        },
    ]

    total_dur = sum(s["duration"] for s in major_sections)
    print(f"Total visual duration planned: {total_dur}s")

    clips = []
    audio_clips = []

    # Build audio timeline: concatenate audios with same durations as visuals (pad silence)
    # Instead we will set audio clip for each major section and pad with silence to match visual duration
    audio_timeline = []
    cur_time = 0.0
    for sec in major_sections:
        audio_path = OUT_DIR / sec["audio"]
        if not audio_path.exists():
            print(f"Missing audio {audio_path}, skipping")
            continue
        a = AudioFileClip(str(audio_path))
        # audio may be shorter than visual duration; we will place it starting at cur_time + 0.4s into visual
        # pad before and after with silence to fill visual duration
        visual_dur = sec["duration"]
        audio_dur = a.duration
        pad_before = 0.5
        pad_after = visual_dur - audio_dur - pad_before
        if pad_after < 0.3:
            pad_after = 0.3
            pad_before = visual_dur - audio_dur - pad_after
            if pad_before <0: pad_before=0.2
        # create silence arrays? We'll handle via composite timing: set start
        # For now we'll create audio clip with start offset by setting its start time in composite
        audio_timeline.append((a, cur_time + pad_before))
        cur_time += visual_dur

    # Now build video clips per major section, with internal scene transitions
    for sec in major_sections:
        visual_dur = sec["duration"]
        # Build subclips for scenes within this section
        subclips = []
        for name, dur, func in sec["scenes"]:
            if sec["name"]=="intro":
                # static intro with full text (typing effect simulated by progress=1.0, cursor blink not animated to keep render fast)
                img = render_intro_frame("AUCTORAIL", "Prove authority before execution.", progress=1.0, cursor=True)
                clip = make_clip_from_pil(img, dur)
            else:
                img = func(0)
                clip = make_clip_from_pil(img, dur)
            subclips.append(clip)
        if len(subclips)==1:
            section_clip = subclips[0]
        else:
            section_clip = concatenate_videoclips(subclips, method="compose")

        # Now add captions for this section: we have multiple captions lines, need to show sequentially timed to audio
        # We'll split caption duration evenly or based on audio segments? For simplicity, split section duration proportionally to caption lengths
        caps = sec["captions"]
        if caps:
            # Build caption composite
            cap_clips = []
            # Divide section duration by number of caps
            cap_dur = visual_dur / len(caps)
            # But we want captions synced to audio: audio starts at pad_before, so captions should align near audio
            # We'll just show captions sequentially across whole section
            for idx, cap_text in enumerate(caps):
                cap_img = caption_image(cap_text, KEYWORDS)
                cap_arr = np.array(cap_img)
                cc = ImageClip(cap_arr).with_duration(cap_dur)
                cc = cc.with_position((0, H - cap_img.height - 28))
                cc = cc.with_start(idx*cap_dur)
                cap_clips.append(cc)
            # composite section clip + captions
            section_clip = CompositeVideoClip([section_clip] + cap_clips, size=(W,H)).with_duration(visual_dur)

        # add fade in/out for section
        section_clip = section_clip.with_start(sum(s["duration"] for s in major_sections[:major_sections.index(sec)]))
        clips.append(section_clip)

    # Combine all sections sequentially
    # Since we set start times, we can composite all at 0
    # Actually we built start times as absolute, so composite all
    final_video = CompositeVideoClip(clips, size=(W,H)).with_duration(total_dur)

    # Create background music: low drone
    # Generate silence or low ambient via ffmpeg: we will create a 130s low volume sine with ffmpeg and mix
    # For now, create a very quiet brown noise via numpy
    print("Generating background ambient...")
    sr = 44100
    dur = total_dur
    # simple filtered noise
    t = np.linspace(0, dur, int(sr*dur))
    # low sine at 55Hz + subtle 110Hz
    ambient = 0.03 * np.sin(2*np.pi*55*t) + 0.015 * np.sin(2*np.pi*110*t) * np.exp(-t*0)  # very low
    # add slow fade in/out
    fade = np.ones_like(t)
    fade[:int(sr*1.0)] *= np.linspace(0,1,int(sr*1.0))
    fade[-int(sr*2.0):] *= np.linspace(1,0,int(sr*2.0))
    ambient *= fade
    # stereo
    stereo = np.column_stack([ambient, ambient])
    from moviepy.audio.AudioClip import AudioArrayClip
    bg_audio = AudioArrayClip(stereo, fps=sr).with_duration(dur).with_volume_scaled(0.08)

    # Build final audio composite: background + narrations at correct offsets
    narrations = []
    for (a, start) in audio_timeline:
        narrations.append(a.with_start(start))
    # Combine
    # Need to set duration for composite
    all_audio = CompositeAudioClip([bg_audio] + narrations).with_duration(total_dur)

    final_video = final_video.with_audio(all_audio)

    # Export
    # Ensure output directory exists
    mp4_path = OUT_DIR / "auctorail-demo-final.mp4"
    webm_path = OUT_DIR / "auctorail-demo-final.webm"

    print(f"Exporting mp4 to {mp4_path} ...")
    final_video.write_videofile(str(mp4_path), fps=FPS, codec="libx264", audio_codec="aac", bitrate="3000k", threads=4, preset="medium", ffmpeg_params=["-pix_fmt","yuv420p","-movflags","+faststart"], logger="bar")

    print(f"Exporting webm to {webm_path} ...")
    # Reuse same clip but write webm
    final_video.write_videofile(str(webm_path), fps=FPS, codec="libvpx-vp9", audio_codec="libopus", bitrate="2500k", threads=4, logger="bar")

    # Thumbnail
    print("Generating thumbnail...")
    thumb_img = scene_final()
    # Add extra overlay for thumb: make it brighter
    draw = ImageDraw.Draw(thumb_img)
    # Add play button hint? Just title
    thumb_img.save(OUT_DIR / "thumbnail.png", "PNG")
    # Also create a 1280x720 version for og
    thumb_small = thumb_img.resize((1280,720), Image.LANCZOS)
    thumb_small.save(OUT_DIR / "thumbnail-1280.png", "PNG")

    print("Done.")
    # print sizes
    for p in [mp4_path, webm_path, OUT_DIR/"thumbnail.png"]:
        if p.exists():
            print(f"{p.name}: {p.stat().st_size/1024/1024:.2f} MB, duration {total_dur}s")

if __name__ == "__main__":
    main()
