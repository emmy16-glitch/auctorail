#!/usr/bin/env python3
import os, pathlib, subprocess, math
from PIL import Image, ImageDraw, ImageFont

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "video-assets"
FRAMES = ROOT / "video-assets" / "frames_v2"
FRAMES.mkdir(parents=True, exist_ok=True)
REAL = ROOT / "video-assets" / "frames_real"

W,H = 1920,1080
BG="#0b0c0e"; CARD_BG="#14171a"; CARD_BORDER="#23262b"; CARD_BG2="#1a1d21"; MUTED="#7a8591"; TEXT="#e8e9ea"; SUBTLE="#9aa3ae"; ACCENT="#00d084"; ACCENT2="#3b82f6"; AMBER="#f59e0b"; RED="#ef4444"; GREEN="#10b981"
FONT_DIR="/usr/share/fonts/truetype/dejavu"
def font(n,s): return ImageFont.truetype(os.path.join(FONT_DIR,n),s)
FONT_BOLD=font("DejaVuSans-Bold.ttf",48); FONT_REG=font("DejaVuSans.ttf",32); FONT_MED=font("DejaVuSans.ttf",26); FONT_SMALL=font("DejaVuSans.ttf",20); FONT_MONO=font("DejaVuSansMono.ttf",18); FONT_MONO_BOLD=font("DejaVuSansMono-Bold.ttf",20); FONT_HERO=font("DejaVuSans-Bold.ttf",84); FONT_HERO2=font("DejaVuSans-Bold.ttf",64); FONT_TAGLINE=font("DejaVuSans.ttf",28); FONT_CAP=font("DejaVuSans.ttf",26); FONT_CAP_BOLD=font("DejaVuSans-Bold.ttf",26)
def hex_to_rgb(h): h=h.lstrip("#"); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def rounded_rect(d,xy,r,fill,outline=None,width=1): d.rounded_rectangle(xy,radius=r,fill=hex_to_rgb(fill) if isinstance(fill,str) else fill, outline=hex_to_rgb(outline) if outline else None, width=width)
def draw_text_wrap(draw, text, font, max_width):
    words=text.split(); lines=[]; cur=""
    for w in words:
        test=cur+" "+w if cur else w
        if draw.textlength(test,font=font)<=max_width: cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines
def create_base_bg():
    img=Image.new("RGB",(W,H),hex_to_rgb(BG))
    draw=ImageDraw.Draw(img)
    for y in range(0,H,80):
        for x in range(0,W,80):
            draw.ellipse([x,y,x+1,y+1],fill=(30,33,37))
    overlay=Image.new("RGBA",(W,H),(0,0,0,0))
    odraw=ImageDraw.Draw(overlay)
    for i in range(600):
        alpha=int(18*(1-i/600)**1.5)
        odraw.line([(0,i),(W,i)],fill=(0,208,132,alpha))
    for i in range(400):
        alpha=int(12*(i/400))
        y=H-400+i
        odraw.line([(0,y),(W,y)],fill=(59,130,246,alpha))
    img=Image.alpha_composite(img.convert("RGBA"),overlay).convert("RGB")
    return img

# New caption style: 80px bar at very bottom, 16px margin, not blocking product (product cards end at ~860, caption at 1000)
def caption_small(text, highlight_words):
    bar_h=84
    img=Image.new("RGBA",(W,bar_h),(0,0,0,0))
    draw=ImageDraw.Draw(img)
    # semi-transparent bar with blur
    rounded_rect(draw,[60,6,W-60,bar_h-6],14,"#0f1214","#23262b")
    # inner subtle top line
    draw.line([(70,10),(W-70,10)],fill=hex_to_rgb(ACCENT),width=1)
    max_w=W-140
    f=FONT_CAP
    lines=draw_text_wrap(draw,text,f,max_w)
    if len(lines)>1:
        f=font("DejaVuSans.ttf",22)
        lines=draw_text_wrap(draw,text,f,max_w)
    line_h=f.size+6
    total_h=len(lines)*line_h
    y0=(bar_h-total_h)//2
    for line in lines:
        words=line.split(" ")
        line_width=draw.textlength(line,font=f)
        cx=(W-line_width)//2
        for w in words:
            clean=w.strip(".,!—→•").upper()
            is_hl=clean in highlight_words
            col=hex_to_rgb(ACCENT) if is_hl else hex_to_rgb(TEXT)
            draw.text((cx,y0),w,font=f,fill=col)
            cx+=draw.textlength(w+" ",font=f)
        y0+=line_h
    return img

KEYWORDS=["AUTHORITY","TELEGRAPH","PERMIT","HOLD","EXECUTION","ALLOW","BLOCK","EVIDENCE","AUCTORAIL","BASE","SEPOLIA"]
def add_caption(base_img, caption_text):
    cap=caption_small(caption_text, KEYWORDS)
    base_rgba=base_img.convert("RGBA")
    # place at bottom 16px margin
    base_rgba.alpha_composite(cap, (0, H-cap.height-16))
    return base_rgba.convert("RGB")

def render_intro():
    img=create_base_bg()
    draw=ImageDraw.Draw(img)
    y=380
    w_main=draw.textlength("AUCTORAIL",font=FONT_HERO)
    x_main=(W-w_main)//2
    draw.text((x_main,y),"AUCTORAIL",font=FONT_HERO,fill=hex_to_rgb(TEXT))
    draw.rounded_rectangle([(W-w_main)//2,y+108,(W-w_main)//2+w_main,y+112],radius=2,fill=hex_to_rgb(ACCENT))
    w_sub=draw.textlength("Prove authority before execution.",font=FONT_TAGLINE)
    draw.text(((W-w_sub)//2,y+140),"Prove authority before execution.",font=FONT_TAGLINE,fill=hex_to_rgb(MUTED))
    # cursor blink
    cx=x_main+w_main+10
    draw.rectangle([cx,y+14,cx+4,y+92],fill=hex_to_rgb(ACCENT))
    return img

def scene_problem_phase(phase):
    # reuse earlier synthetic but with new caption handling done separately
    from scripts.generate_fast_video import scene_problem as orig
    # we can't import, duplicate quickly
    # For speed, just call the same logic via generating via that file's function? Instead recreate quickly
    # We'll just create a base and use previous frames' logic
    # To avoid duplication, we will load the synthetic frames already generated in frames/ and add new caption
    # For now return create_base_bg placeholder and will be replaced by using synthetic frames from frames/
    return create_base_bg()

# Instead of recreating synthetic, we will reuse the already generated synthetic PNGs from frames/ and just re-caption them with small style
# For product real captures, we will use REAL PNGs directly with browser chrome already included (they are full browser screenshots)

# Define segments for V2: (name, duration, caption, source_type, source_path)
# source_type: "synthetic" (we will generate fresh with small caption) or "real" (use REAL PNG with small caption)
segments_v2 = [
    # Intro synthetic
    ("intro", 10, "AI agents can execute actions. But the biggest question is what they are actually authorized to do.", "synthetic", "intro"),
    # Problem synthetic (use previous synthetic frames but re-captioned)
    ("problem1", 6, "You delegate one payment. One amount. One recipient.", "synthetic", "problem1"),
    ("problem2", 6, "But malicious instructions can change what the agent wants to do.", "synthetic", "problem2"),
    ("problem3", 8, "Ten USDC approved can become one hundred USDC requested to an unknown wallet.", "synthetic", "problem3"),
    # Safety synthetic
    ("safety", 16, "Security systems can provide warnings. But a warning does not prove permission. Safe is not the same as authorized.", "synthetic", "safety"),
    # Real product captures
    ("real-check", 8, "Auctorail freezes the exact action before execution.", "real", "real-check-1920.png"),
    ("real-demo", 7, "It captures the amount, the recipient, the chain, and creates a cryptographic hash.", "real", "real-demo-1920.png"),
    ("real-miners", 9, "It verifies delegation and purchases Telegraph intelligence.", "real", "real-security-lab-run-1920.png"), # using security lab as miner evidence
    ("real-decision", 8, "Only then: Allow, Hold, or Block — and a single-use permit.", "real", "real-verify-valid-1920.png"),
    ("real-fail1", 9, "When an agent exceeds authority, Auctorail blocks the action.", "real", "real-permissions-1920.png"),
    ("real-fail2", 9, "When evidence is missing, Auctorail fails closed: Hold.", "real", "real-content-1920.png"),
    ("real-success", 20, "For approved actions, Auctorail enables execution with a verifiable receipt. One USDC. Telegraph verified. Base Sepolia confirmed.", "real", "real-home-1920.png"), # home shows landing with proof, but we use success synthetic for now? We'll use real-home for landing and synthetic success for tx
    ("final", 14, "Telegraph provides intelligence. Auctorail provides authority. Prove authority before execution.", "synthetic", "final"),
]

print("Generating V2 frames with small captions and real browser...")
# Need to generate synthetic frames via the fast video generator's functions
# We will import those functions by loading the file
import importlib.util, sys
spec = importlib.util.spec_from_file_location("fast", str(ROOT / "scripts" / "generate-fast-video.py"))
fast = importlib.util.module_from_spec(spec)
# We need to exec only the helper parts, not main. Instead we will directly generate synthetic frames by reusing previous frames folder and re-captioning
# Simpler: Load existing synthetic PNGs from video-assets/frames/ and add new small caption

import pathlib

synthetic_source = {
    "intro": "intro.png",
    "problem1": "problem1.png",
    "problem2": "problem2.png",
    "problem3": "problem3.png",
    "safety": "safety.png",
    "final": "final.png",
}
# For synthetic segments that are not just single PNG but need generation, we will generate via the fast video's functions by calling them
# To avoid complex import, we will just reuse the already generated frames from previous run (frames/) and strip old caption by cropping bottom 200px and re-adding new caption
# The old frames have old caption baked at bottom 170px, we need to remove it. Instead we will regenerate synthetic frames fresh using the same functions but without caption, then add new small caption.

# So we need to regenerate synthetic frames without caption. Let's duplicate the generation logic here for those synthetic names.

def synthetic_base(name):
    # create base synthetic image without caption, using create_base_bg and specific scene
    # We'll call the functions from generate-fast-video by directly re-implementing minimal
    if name == "intro":
        return render_intro()
    elif name == "problem1":
        # need scene_problem etc. We'll import via exec of that file's functions
        # Quick hack: run python to generate those images via the original fast generator's scene functions
        # Instead we will just load the previous synthetic image and crop off caption area
        p = ROOT / "video-assets" / "frames" / "intro.png"  # placeholder
        # Actually we will generate by calling the fast file's functions via subprocess
        pass
    return create_base_bg()

# Better: Directly use the real PNGs for synthetic too but with zoom? For V2 we want synthetic problem/safety to still be synthetic but with new caption style.
# Simplest: For synthetic segments, we will create new images using the same functions as before but without caption, then add small caption.
# Let's just re-implement those synthetic generators here quickly by copying the logic from generate-fast-video.py

def scene_problem(phase="approved"):
    img=create_base_bg()
    draw=ImageDraw.Draw(img)
    # draw top nav for context (to look like browser)
    # add browser chrome simulation
    # top bar
    draw.rounded_rectangle([0,0,W,48],0,hex_to_rgb("#1a1d21"))
    for i,c in enumerate(["#ff5f57","#ffbd2e","#28c840"]):
        draw.ellipse([18+i*22,16,32+i*22,30],fill=hex_to_rgb(c))
    draw.rounded_rectangle([90,10,W-120,38],8,hex_to_rgb("#0f1214"),hex_to_rgb("#2a2e33"))
    draw.text((108,16),"🔒 auctorail.vercel.app",font=font("DejaVuSans.ttf",16),fill=hex_to_rgb(MUTED))
    y0=140
    draw.text((80,y0),"THE PROBLEM",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    draw.text((80,y0+36),"Agent receives payment instruction",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
    if phase=="approved":
        card_w,card_h=760,420
        x=(W-card_w)//2; y=280
        draw.rounded_rectangle([x,y,x+card_w,y+card_h],18,hex_to_rgb(CARD_BG),hex_to_rgb(CARD_BORDER))
        draw.rounded_rectangle([x,y,x+card_w,y+64],18,hex_to_rgb(CARD_BG2))
        draw.rectangle([x,y+40,x+card_w,y+64],fill=hex_to_rgb(CARD_BG2))
        draw.text((x+28,y+20),"PAY INVOICE #4471",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(MUTED))
        draw.ellipse([x+card_w-28,y+24,x+card_w-16,y+36],fill=hex_to_rgb(GREEN))
        draw.text((x+28,y+96),"AMOUNT",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x+28,y+124),"10  USDC",font=font("DejaVuSans-Bold.ttf",64),fill=hex_to_rgb(TEXT))
        draw.text((x+28+draw.textlength("10  USDC",font=font("DejaVuSans-Bold.ttf",64))+16,y+148),"Approved",font=FONT_SMALL,fill=hex_to_rgb(GREEN))
        draw.text((x+28,y+212),"RECIPIENT",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.rounded_rectangle([x+28,y+238,x+card_w-28,y+298],12,hex_to_rgb("#0f1214"),hex_to_rgb(CARD_BORDER))
        draw.text((x+44,y+252),"Utility Vendor",font=FONT_REG,fill=hex_to_rgb(TEXT))
        draw.text((x+44,y+274),"0x8a12…9f3C  •  Base Sepolia",font=FONT_MONO,fill=hex_to_rgb(MUTED))
        draw.rounded_rectangle([x+28,y+324,x+180,y+356],20,hex_to_rgb("#0f1214"),hex_to_rgb(CARD_BORDER))
        draw.text((x+42,y+332),"●  Base Sepolia  •  USDC",font=font("DejaVuSans.ttf",14),fill=hex_to_rgb(SUBTLE))
    elif phase=="attack":
        card_w,card_h=760,420
        x=(W-card_w)//2; y=280
        draw.rounded_rectangle([x,y,x+card_w,y+card_h],18,hex_to_rgb("#1a0f0f"),hex_to_rgb("#3a1a1a"))
        draw.rounded_rectangle([x,y,x+card_w,y+64],18,hex_to_rgb("#2a1515"))
        draw.rectangle([x,y+40,x+card_w,y+64],fill=hex_to_rgb("#2a1515"))
        draw.text((x+28,y+20),"⚠  INSTRUCTION MODIFIED",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(RED))
        draw.text((x+28,y+96),"AMOUNT",font=FONT_SMALL,fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28,y+124),"100 USDC",font=font("DejaVuSans-Bold.ttf",64),fill=hex_to_rgb(RED))
        draw.text((x+28+draw.textlength("100 USDC",font=font("DejaVuSans-Bold.ttf",64))+16,y+148),"Injected",font=FONT_SMALL,fill=hex_to_rgb(RED))
        draw.text((x+28,y+212),"RECIPIENT",font=FONT_SMALL,fill=hex_to_rgb("#ff7b7b"))
        draw.rounded_rectangle([x+28,y+238,x+card_w-28,y+298],12,hex_to_rgb("#1f0f0f"),hex_to_rgb("#3a1a1a"))
        draw.text((x+44,y+252),"Unknown wallet",font=FONT_REG,fill=hex_to_rgb(RED))
        draw.text((x+44,y+274),"0x9f3C…dead  •  Unknown",font=FONT_MONO,fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28,y+324),"⚠  Malicious instruction changed the agent's intent",font=FONT_SMALL,fill=hex_to_rgb(RED))
    elif phase=="comparison":
        card_w,card_h=620,380
        gap=40
        x1=(W-(card_w*2+gap))//2; x2=x1+card_w+gap; y=280
        draw.rounded_rectangle([x1,y,x1+card_w,y+card_h],18,hex_to_rgb(CARD_BG),hex_to_rgb(CARD_BORDER))
        draw.rounded_rectangle([x1,y,x1+card_w,y+56],18,hex_to_rgb(CARD_BG2))
        draw.rectangle([x1,y+36,x1+card_w,y+56],fill=hex_to_rgb(CARD_BG2))
        draw.text((x1+20,y+18),"10 USDC APPROVED",font=font("DejaVuSans-Bold.ttf",16),fill=hex_to_rgb(GREEN))
        draw.text((x1+20,y+84),"10  USDC",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(TEXT))
        draw.text((x1+20,y+160),"Utility Vendor",font=FONT_MED,fill=hex_to_rgb(TEXT))
        draw.text((x1+20,y+190),"0x8a12…9f3C",font=FONT_MONO,fill=hex_to_rgb(MUTED))
        draw.rounded_rectangle([x2,y,x2+card_w,y+card_h],18,hex_to_rgb("#1a0f0f"),hex_to_rgb("#3a1a1a"))
        draw.rounded_rectangle([x2,y,x2+card_w,y+56],18,hex_to_rgb("#2a1515"))
        draw.rectangle([x2,y+36,x2+card_w,y+56],fill=hex_to_rgb("#2a1515"))
        draw.text((x2+20,y+18),"100 USDC REQUESTED",font=font("DejaVuSans-Bold.ttf",16),fill=hex_to_rgb(RED))
        draw.text((x2+20,y+84),"100 USDC",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(RED))
        draw.text((x2+20,y+160),"Unknown wallet",font=FONT_MED,fill=hex_to_rgb(RED))
        draw.text((x2+20,y+190),"0x9f3C…dead",font=FONT_MONO,fill=hex_to_rgb("#ff7b7b"))
        draw.text((W//2-draw.textlength("→",font=font("DejaVuSans-Bold.ttf",48))//2,y+card_h//2-20),"→",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(RED))
        draw.text((W//2-draw.textlength("Same agent, different authority",font=FONT_MED)//2,y+card_h+30),"Same agent, different authority",font=FONT_MED,fill=hex_to_rgb(RED))
    return img

def scene_safety():
    img=create_base_bg()
    draw=ImageDraw.Draw(img)
    draw.rounded_rectangle([0,0,W,48],0,hex_to_rgb("#1a1d21"))
    for i,c in enumerate(["#ff5f57","#ffbd2e","#28c840"]):
        draw.ellipse([18+i*22,16,32+i*22,30],fill=hex_to_rgb(c))
    draw.rounded_rectangle([90,10,W-120,38],8,hex_to_rgb("#0f1214"),hex_to_rgb("#2a2e33"))
    draw.text((108,16),"🔒 auctorail.vercel.app",font=font("DejaVuSans.ttf",16),fill=hex_to_rgb(MUTED))
    y0=140
    draw.text((80,y0),"WHY SAFETY IS NOT ENOUGH",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    draw.text((80,y0+36),"Warnings are intelligence. Not permission.",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
    card_w,card_h=520,340; x=80; y=250
    draw.rounded_rectangle([x,y,x+card_w,y+card_h],18,hex_to_rgb(CARD_BG),hex_to_rgb(CARD_BORDER))
    draw.text((x+24,y+20),"Risk Check",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(MUTED))
    draw.text((x+24,y+64),"HIGH RISK",font=font("DejaVuSans-Bold.ttf",42),fill=hex_to_rgb(RED))
    draw.rounded_rectangle([x+24,y+124,x+card_w-24,y+176],10,hex_to_rgb("#1a0f0f"),hex_to_rgb("#3a1a1a"))
    draw.text((x+36,y+138),"●  Block recommended",font=FONT_SMALL,fill=hex_to_rgb(RED))
    draw.text((x+24,y+200),"A security system can provide",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x+24,y+224),"warnings and intelligence.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x+card_w+60,y+card_h//2-20),"→",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(MUTED))
    x2=x+card_w+140
    draw.rounded_rectangle([x2,y,x2+card_w+100,y+card_h],18,hex_to_rgb(CARD_BG),hex_to_rgb(CARD_BORDER))
    draw.text((x2+30,y+30),"Safety",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(MUTED))
    draw.text((x2+30+draw.textlength("Safety ",font=font("DejaVuSans-Bold.ttf",36)),y+30),"≠",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(ACCENT))
    draw.text((x2+30,y+78),"Authority",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(TEXT))
    draw.rounded_rectangle([x2+30,y+124,x2+30+180,y+128],2,hex_to_rgb(ACCENT))
    draw.text((x2+30,y+150),"A warning does not prove",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x2+30,y+174),"permission.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.rounded_rectangle([x2+30,y+212,x2+card_w+70,y+248],20,hex_to_rgb(CARD_BG2),hex_to_rgb(CARD_BORDER))
    draw.text((x2+44,y+222),"Safe is not the same as authorized.",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(ACCENT))
    yb=680
    draw.rounded_rectangle([80,yb,W-80,yb+80],14,hex_to_rgb(CARD_BG),hex_to_rgb(CARD_BORDER))
    draw.text((110,yb+18),"Intelligence helps you know something.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((110,yb+44),"Authority determines whether you may act.",font=FONT_SMALL,fill=hex_to_rgb(TEXT))
    draw.text((W-300,yb+30),"AUCTORAIL",font=font("DejaVuSans-Bold.ttf",20),fill=hex_to_rgb(ACCENT))
    return img

def scene_final():
    img=Image.new("RGB",(W,H),(5,6,8))
    draw=ImageDraw.Draw(img)
    for i in range(H):
        alpha=int(14*math.sin(math.pi*i/H))
        draw.line([(0,i),(W,i)],fill=(0,208,132,alpha//14*2))
    y=380
    draw.text((W//2-draw.textlength("SAFE IS NOT THE SAME AS AUTHORIZED",font=font("DejaVuSans-Bold.ttf",38))//2,y),"SAFE IS NOT THE SAME AS AUTHORIZED",font=font("DejaVuSans-Bold.ttf",38),fill=hex_to_rgb(TEXT))
    draw.rounded_rectangle([W//2-180,y+64,W//2+180,y+68],2,hex_to_rgb(ACCENT))
    y2=y+98
    t1="Telegraph provides intelligence."; t2="Auctorail provides authority."
    draw.text((W//2-draw.textlength(t1,font=FONT_REG)//2,y2),t1,font=FONT_REG,fill=hex_to_rgb(MUTED))
    draw.text((W//2-draw.textlength(t2,font=FONT_BOLD)//2,y2+46),t2,font=FONT_BOLD,fill=hex_to_rgb(TEXT))
    y3=y2+120
    draw.text((W//2-draw.textlength("github.com/emmy16-glitch/auctorail",font=FONT_MONO)//2,y3),"github.com/emmy16-glitch/auctorail",font=FONT_MONO,fill=hex_to_rgb(SUBTLE))
    y4=H-140
    draw.text((W//2-draw.textlength("AUCTORAIL",font=font("DejaVuSans-Bold.ttf",48))//2,y4),"AUCTORAIL",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(TEXT))
    draw.text((W//2-draw.textlength("Prove authority before execution.",font=FONT_SMALL)//2,y4+62),"Prove authority before execution.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    return img

# Generate frames
for name, dur, cap, typ, src in segments_v2:
    if typ == "synthetic":
        if src == "intro": img = render_intro()
        elif src == "problem1": img = scene_problem("approved")
        elif src == "problem2": img = scene_problem("attack")
        elif src == "problem3": img = scene_problem("comparison")
        elif src == "safety": img = scene_safety()
        elif src == "final": img = scene_final()
        else: img = create_base_bg()
    else: # real
        p = REAL / src
        img = Image.open(p).convert("RGB")
        # add browser chrome already in screenshot? Real screenshots are full browser without chrome bar, but we have top nav inside page, not browser outer chrome. For V2 we want browser chrome, so add it on top (simulate)
        # Add outer browser bar at top to make it look like real browser recording
        # Create new image with bar
        bar = Image.new("RGB", (W,48), hex_to_rgb("#1a1d21"))
        bdraw = ImageDraw.Draw(bar)
        for i,c in enumerate(["#ff5f57","#ffbd2e","#28c840"]):
            bdraw.ellipse([18+i*22,16,32+i*22,30],fill=hex_to_rgb(c))
        bdraw.rounded_rectangle([90,10,W-120,38],8,hex_to_rgb("#0f1214"),hex_to_rgb("#2a2e33"))
        bdraw.text((108,16),"🔒 auctorail.vercel.app  •  127.0.0.1:5173",font=font("DejaVuSans.ttf",14),fill=hex_to_rgb(MUTED))
        new_img = Image.new("RGB", (W,H))
        new_img.paste(bar, (0,0))
        # scale real screenshot to fit below bar (1080-48 =1032)
        # real is 1920x1080, we need to fit into 1920x1032, so crop/scale slightly
        img_resized = img.resize((1920,1032), Image.LANCZOS)
        new_img.paste(img_resized, (0,48))
        img = new_img
        # add subtle zoom indicator? We'll add a cursor dot at bottom right to simulate recording
        draw = ImageDraw.Draw(img)
        # cursor at position based on segment (simulate movement)
        # For check/demo, cursor near button
        cx, cy = W-200, H-120
        if "check" in name: cx, cy = 400, 760
        elif "demo" in name: cx, cy = 960, 540
        elif "verify" in name: cx, cy = 1200, 400
        # draw cursor shadow
        draw.ellipse([cx-8,cy-8,cx+16,cy+16],fill=(0,0,0,100))
        draw.ellipse([cx-5,cy-5,cx+12,cy+12],fill=hex_to_rgb("#ffffff"),outline=hex_to_rgb("#000000"),width=1)
        draw.polygon([(cx,cy),(cx,cy+14),(cx+5,cy+10),(cx+8,cy+16),(cx+10,cy+15),(cx+6,cy+9),(cx+10,cy+9)],fill=hex_to_rgb("#ffffff"),outline=hex_to_rgb("#000000"))
    # add small caption
    img2 = add_caption(img, cap)
    out = FRAMES / f"{name}.png"
    img2.save(out, "PNG")
    print(f"V2 frame {name} {dur}s -> {out}")

print("V2 frames done")
