#!/usr/bin/env python3
import os, pathlib, subprocess, math, random
from PIL import Image, ImageDraw, ImageFont
import numpy as np, wave, struct

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "video-assets" / "frames_v2"
TMP = ROOT / "video-assets" / "intro_frames"
TMP.mkdir(parents=True, exist_ok=True)

W,H=1920,1080
BG="#0b0c0e"; TEXT="#e8e9ea"; MUTED="#7a8591"; ACCENT="#00d084"; SUBTLE="#9aa3ae"
FONT_DIR="/usr/share/fonts/truetype/dejavu"
def font(n,s): return ImageFont.truetype(os.path.join(FONT_DIR,n),s)
FONT_HERO=font("DejaVuSans-Bold.ttf",84); FONT_TAGLINE=font("DejaVuSans.ttf",28); FONT_SMALL=font("DejaVuSans.ttf",20)
def hex_to_rgb(h): h=h.lstrip("#"); return tuple(int(h[i:i+2],16) for i in (0,2,4))
SCRAMBLE="AUCTORAILXKMNZ0123456789#"
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

def render_intro_frame(progress, cursor, tagline_alpha=0):
    img=create_base_bg()
    draw=ImageDraw.Draw(img)
    text="AUCTORAIL"
    y=380
    # Scramble decode
    revealed=int(progress*len(text))
    displayed=""
    for i,ch in enumerate(text):
        if i < revealed:
            displayed+=ch
        else:
            displayed+=random.choice(SCRAMBLE) if random.random()<0.7 else ch
            # Actually for unrevealed we show random
    # But to make typing clean, we show only revealed chars plus random for remainder
    # Let's do properly: revealed chars are correct, rest are random
    out_text=""
    for i in range(len(text)):
        if i < revealed:
            out_text+=text[i]
        else:
            out_text+=random.choice(SCRAMBLE)
    # Center
    w_main=draw.textlength(out_text,font=FONT_HERO)
    x_main=(W-w_main)//2
    draw.text((x_main,y),out_text,font=FONT_HERO,fill=hex_to_rgb(TEXT))
    # underline
    w_full=draw.textlength(text,font=FONT_HERO)
    line_w=int(w_full*progress)
    draw.rounded_rectangle([(W-w_full)//2,y+108,(W-w_full)//2+line_w,y+112],radius=2,fill=hex_to_rgb(ACCENT))
    # tagline with alpha
    if tagline_alpha>0:
        # Use alpha composite for fade
        tag="Prove authority before execution."
        w_sub=draw.textlength(tag,font=FONT_TAGLINE)
        # Create overlay for tagline with alpha
        txt_img=Image.new("RGBA",(W,H),(0,0,0,0))
        tdraw=ImageDraw.Draw(txt_img)
        # Color with alpha
        col=hex_to_rgb(MUTED)
        # Simulate alpha by blending: draw with opacity
        # PIL doesn't support alpha text directly, so we draw and then put alpha
        tdraw.text(((W-w_sub)//2,y+140),tag,font=FONT_TAGLINE,fill=col+(int(255*tagline_alpha),))
        img=Image.alpha_composite(img.convert("RGBA"), txt_img).convert("RGB")
        draw=ImageDraw.Draw(img)
    # cursor
    if cursor and progress<1.0:
        # cursor at end of revealed text
        revealed_text=text[:revealed]
        w_rev=draw.textlength(revealed_text,font=FONT_HERO)
        cx=(W-w_full)//2 + w_rev + 6
        draw.rectangle([cx,y+14,cx+4,y+92],fill=hex_to_rgb(ACCENT))
    elif cursor and progress>=1.0:
        # blinking after done
        # alternate on/off already handled by caller
        w_full2=draw.textlength(text,font=FONT_HERO)
        cx=(W-w_full2)//2 + w_full2 + 10
        draw.rectangle([cx,y+14,cx+4,y+92],fill=hex_to_rgb(ACCENT))
    # bottom hint
    draw.text((W//2-draw.textlength("Keyboard typing • AUCTORAIL",font=FONT_SMALL)//2,H-120),"Keyboard typing • AUCTORAIL",font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
    return img

# Generate frames
import random, math
random.seed(42)
FPS=30
DUR=10
total_frames=FPS*DUR
print(f"Generating {total_frames} intro frames...")
for i in range(total_frames):
    t=i/FPS
    # progress for typing: 0->1 over 2.5s, then hold
    if t < 2.5:
        prog=t/2.5
        cursor=(int(t*4)%2==0)  # blink at 2Hz during typing
    elif t < 3.0:
        prog=1.0
        cursor=True
    else:
        prog=1.0
        cursor=(int((t-3)*2)%2==0)  # blink after
    tag_alpha=0
    if t>2.8:
        tag_alpha=min(1.0, (t-2.8)/0.7)
    img=render_intro_frame(prog, cursor, tag_alpha)
    # Add small caption at bottom (84px bar) - but for intro we don't want caption blocking, so we add it as small bar
    # Use same small caption as V2
    from PIL import Image as PILImage
    # Caption bar
    bar_h=84
    cap=Image.new("RGBA",(W,bar_h),(0,0,0,0))
    cdraw=ImageDraw.Draw(cap)
    # bar bg
    cdraw.rounded_rectangle([60,6,W-60,bar_h-6],14,fill=hex_to_rgb("#0f1214"),outline=hex_to_rgb("#23262b"))
    cdraw.line([(70,10),(W-70,10)],fill=hex_to_rgb(ACCENT),width=1)
    cap_text="AI agents can execute actions. But the biggest question is what they are actually authorized to do."
    fcap=font("DejaVuSans.ttf",26)
    # wrap
    max_w=W-140
    words=cap_text.split()
    lines=[]; cur=""
    for w in words:
        test=cur+" "+w if cur else w
        if cdraw.textlength(test,font=fcap)<=max_w:
            cur=test
        else:
            lines.append(cur); cur=w
    if cur: lines.append(cur)
    line_h=fcap.size+6
    y0=(bar_h-len(lines)*line_h)//2
    for line in lines:
        words2=line.split(" ")
        lw=cdraw.textlength(line,font=fcap)
        cx=(W-lw)//2
        for w in words2:
            clean=w.strip(".,!—→•").upper()
            col=hex_to_rgb(ACCENT) if clean in ["AUTHORITY","TELEGRAPH","PERMIT","HOLD","EXECUTION","ALLOW","BLOCK","EVIDENCE","AUCTORAIL"] else hex_to_rgb(TEXT)
            cdraw.text((cx,y0),w,font=fcap,fill=col)
            cx+=cdraw.textlength(w+" ",font=fcap)
        y0+=line_h
    img_rgba=img.convert("RGBA")
    img_rgba.alpha_composite(cap, (0, H-cap.height-16))
    img=img_rgba.convert("RGB")
    out=TMP / f"intro_{i:04d}.png"
    img.save(out, "PNG")
    if i%60==0:
        print(f"  {i}/{total_frames}")

print("Encoding intro video...")
# Encode PNG sequence to mp4 with rawvideo via ffmpeg
# Use ffmpeg to read image sequence
# Pattern intro_%04d.png
# We need to use -framerate 30 -i intro_%04d.png
import subprocess
cmd=[
    FF, "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", "30", "-i", str(TMP / "intro_%04d.png"),
    "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p",
    "-preset", "ultrafast", "-crf", "18",
    "-movflags", "+faststart",
    str(ROOT / "video-assets" / "frames_v2" / "intro-typed.mp4")
]
print(" ".join(cmd))
subprocess.run(cmd, check=True)
print("Intro typed mp4 done")
# Also generate typing sound
print("Generating typing sound...")
import wave, struct, math as m
sr=48000
# typing clicks: 9 letters over 2.5s, each click is 800Hz sine for 40ms with decay
typing_path = ROOT / "video-assets" / "sfx_typing.wav"
with wave.open(str(typing_path), 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    total_samples=int(sr*10)  # 10s total (intro duration)
    # base silence
    data=[0]*total_samples*2
    # add clicks
    import math
    for i in range(9):
        t0=i*0.277  # 2.5/9
        start=int(t0*sr)
        # click duration 40ms
        for n in range(int(0.04*sr)):
            idx=start+n
            if idx>=total_samples: break
            # sine 900Hz with exponential decay
            amp=0.4*math.exp(-n/(0.008*sr))  # decay 8ms
            val=int(amp*32767*math.sin(2*math.pi*900*n/sr))
            # stereo
            data[idx*2]+=val
            data[idx*2+1]+=val
            # clamp
            for ch in [0,1]:
                if data[idx*2+ch]>32767: data[idx*2+ch]=32767
                if data[idx*2+ch]<-32768: data[idx*2+ch]=-32768
    # Convert to bytes
    import struct as st
    out_bytes=b''.join(st.pack('<h', max(-32768,min(32767,int(v)))) for v in data)
    w.writeframes(out_bytes)
print(f"Typing sound {typing_path} {typing_path.stat().st_size/1024:.1f} KB")

# Also generate whoosh and click
for name, freq, dur, vol in [("sfx_click.wav", 1200, 0.08, 0.5), ("sfx_whoosh.wav", None, 0.4, 0.3)]:
    path=ROOT/"video-assets"/name
    with wave.open(str(path),'w') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        total=int(sr*dur)
        data=[]
        for n in range(total):
            t=n/sr
            if "whoosh" in name:
                # sweep 80->400Hz
                f=80+(400-80)*(t/dur)
                amp=vol*math.sin(math.pi*t/dur)  # fade in/out
                val=int(amp*32767*math.sin(2*math.pi*f*t))
            else:
                # click: 1200Hz decaying
                amp=vol*math.exp(-t/0.02)
                val=int(amp*32767*math.sin(2*math.pi*freq*t))
            data.append(val); data.append(val)
        out_bytes=b''.join(st.pack('<h', max(-32768,min(32767,int(v)))) for v in data)
        w.writeframes(out_bytes)
    print(f"SFX {name} done")

print("All intro assets done")
