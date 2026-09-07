#!/usr/bin/env python3
import os, pathlib, subprocess, json, math
from PIL import Image, ImageDraw, ImageFont

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "video-assets"
OUT.mkdir(parents=True, exist_ok=True)

W,H = 1920,1080
BG="#0b0c0e"; CARD_BG="#14171a"; CARD_BORDER="#23262b"; CARD_BG2="#1a1d21"; MUTED="#7a8591"; TEXT="#e8e9ea"; SUBTLE="#9aa3ae"; ACCENT="#00d084"; ACCENT2="#3b82f6"; AMBER="#f59e0b"; RED="#ef4444"; GREEN="#10b981"
FONT_DIR="/usr/share/fonts/truetype/dejavu"
def font(n,s): return ImageFont.truetype(os.path.join(FONT_DIR,n),s)
FONT_BOLD=font("DejaVuSans-Bold.ttf",48); FONT_REG=font("DejaVuSans.ttf",32); FONT_MED=font("DejaVuSans.ttf",26); FONT_SMALL=font("DejaVuSans.ttf",20); FONT_MONO=font("DejaVuSansMono.ttf",18); FONT_MONO_BOLD=font("DejaVuSansMono-Bold.ttf",20); FONT_HERO=font("DejaVuSans-Bold.ttf",84); FONT_HERO2=font("DejaVuSans-Bold.ttf",64); FONT_TAGLINE=font("DejaVuSans.ttf",28); FONT_CAPTION=font("DejaVuSans-Bold.ttf",36); FONT_CAPTION_SMALL=font("DejaVuSans.ttf",30)
def hex_to_rgb(h): h=h.lstrip("#"); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def rounded_rect(d,xy,r,fill,outline=None,width=1): d.rounded_rectangle(xy,radius=r,fill=hex_to_rgb(fill) if isinstance(fill,str) else fill, outline=hex_to_rgb(outline) if outline else None, width=width)
def draw_text_wrap(draw, text, font, max_width, fill, line_spacing=6, align="left"):
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
def draw_top_nav(img):
    draw=ImageDraw.Draw(img)
    nav_h=72
    rounded_rect(draw,[32,22,W-32,22+nav_h],14,CARD_BG,CARD_BORDER)
    sx,sy=52,32
    draw.rounded_rectangle([sx,sy,sx+40,sy+44],6,hex_to_rgb(ACCENT))
    draw.text((sx+12,sy+10),"◆",font=font("DejaVuSans-Bold.ttf",22),fill=(11,12,14))
    draw.text((sx+52,sy+4),"AUCTORAIL",font=font("DejaVuSans-Bold.ttf",20),fill=hex_to_rgb(TEXT))
    draw.text((sx+52,sy+28),"Authorization rails",font=font("DejaVuSans.ttf",13),fill=hex_to_rgb(MUTED))
    links=["CHECK","ACTIVITY","PERMISSIONS","SECURITY LAB"]
    x=340
    for j,l in enumerate(links):
        active=(j==0)
        if active:
            rounded_rect(draw,[x-10,sy+8,x+draw.textlength(l,font=FONT_SMALL)+10,sy+32],20,ACCENT,None)
            draw.text((x,sy+12),l,font=FONT_SMALL,fill=(0,0,0))
        else: draw.text((x,sy+12),l,font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        x+=int(draw.textlength(l,font=FONT_SMALL)+28)
    draw.text((W-420,sy+12),"TRUST",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((W-340,sy+12),"DOCS",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((W-260,sy+12),"GITHUB ↗",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[W-185,sy+6,W-38,sy+36],20,"#0f1214",CARD_BORDER)
    draw.ellipse([W-172,sy+16,W-162,sy+26],fill=hex_to_rgb(GREEN))
    draw.text((W-156,sy+12),"BASE SEPOLIA",font=font("DejaVuSans.ttf",12),fill=hex_to_rgb(SUBTLE))
    draw.text((W-156,sy+22),"TESTNET",font=font("DejaVuSans.ttf",10),fill=hex_to_rgb(MUTED))
    return img

def render_intro_frame(text_main="AUCTORAIL", text_sub="Prove authority before execution.", progress=1.0, cursor=True):
    img=create_base_bg()
    draw=ImageDraw.Draw(img)
    y=380
    w_main=draw.textlength(text_main,font=FONT_HERO)
    x_main=(W-w_main)//2
    draw.text((x_main,y),text_main,font=FONT_HERO,fill=hex_to_rgb(TEXT))
    line_w=int(w_main*progress)
    draw.rounded_rectangle([(W-w_main)//2,y+108,(W-w_main)//2+line_w,y+112],radius=2,fill=hex_to_rgb(ACCENT))
    y2=y+140
    w_sub=draw.textlength(text_sub,font=FONT_TAGLINE)
    draw.text(((W-w_sub)//2,y2),text_sub,font=FONT_TAGLINE,fill=hex_to_rgb(MUTED))
    if cursor:
        cx=x_main+draw.textlength(text_main,font=FONT_HERO)+10
        draw.rectangle([cx,y+14,cx+4,y+92],fill=hex_to_rgb(ACCENT))
    draw.text((W//2-draw.textlength("Prove authority before execution.",font=FONT_SMALL)//2,H-120),"Prove authority before execution.",font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
    return img

def scene_problem(phase="approved"):
    img=create_base_bg()
    img=draw_top_nav(img)
    draw=ImageDraw.Draw(img)
    y0=140
    draw.text((80,y0),"THE PROBLEM",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    draw.text((80,y0+36),"Agent receives payment instruction",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
    if phase=="approved":
        card_w,card_h=760,420
        x=(W-card_w)//2; y=280
        rounded_rect(draw,[x,y,x+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
        rounded_rect(draw,[x,y,x+card_w,y+64],18,CARD_BG2,None)
        draw.rectangle([x,y+40,x+card_w,y+64],fill=hex_to_rgb(CARD_BG2))
        draw.text((x+28,y+20),"PAY INVOICE #4471",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(MUTED))
        draw.ellipse([x+card_w-28,y+24,x+card_w-16,y+36],fill=hex_to_rgb(GREEN))
        draw.text((x+28,y+96),"AMOUNT",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x+28,y+124),"10  USDC",font=FONT_HERO2,fill=hex_to_rgb(TEXT))
        draw.text((x+28+draw.textlength("10  USDC",font=FONT_HERO2)+16,y+148),"Approved",font=FONT_SMALL,fill=hex_to_rgb(GREEN))
        draw.text((x+28,y+212),"RECIPIENT",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        rounded_rect(draw,[x+28,y+238,x+card_w-28,y+298],12,"#0f1214",CARD_BORDER)
        draw.text((x+44,y+252),"Utility Vendor",font=FONT_REG,fill=hex_to_rgb(TEXT))
        draw.text((x+44,y+274),"0x8a12…9f3C  •  Base Sepolia",font=FONT_MONO,fill=hex_to_rgb(MUTED))
        rounded_rect(draw,[x+28,y+324,x+180,y+356],20,"#0f1214",CARD_BORDER)
        draw.text((x+42,y+332),"●  Base Sepolia  •  USDC",font=font("DejaVuSans.ttf",14),fill=hex_to_rgb(SUBTLE))
    elif phase=="attack":
        card_w,card_h=760,420
        x=(W-card_w)//2; y=280
        rounded_rect(draw,[x,y,x+card_w,y+card_h],18,"#1a0f0f","#3a1a1a")
        rounded_rect(draw,[x,y,x+card_w,y+64],18,"#2a1515",None)
        draw.rectangle([x,y+40,x+card_w,y+64],fill=hex_to_rgb("#2a1515"))
        draw.text((x+28,y+20),"⚠  INSTRUCTION MODIFIED",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(RED))
        draw.text((x+28,y+96),"AMOUNT",font=FONT_SMALL,fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28,y+124),"100 USDC",font=FONT_HERO2,fill=hex_to_rgb(RED))
        draw.text((x+28+draw.textlength("100 USDC",font=FONT_HERO2)+16,y+148),"Injected",font=FONT_SMALL,fill=hex_to_rgb(RED))
        draw.text((x+28,y+212),"RECIPIENT",font=FONT_SMALL,fill=hex_to_rgb("#ff7b7b"))
        rounded_rect(draw,[x+28,y+238,x+card_w-28,y+298],12,"#1f0f0f","#3a1a1a")
        draw.text((x+44,y+252),"Unknown wallet",font=FONT_REG,fill=hex_to_rgb(RED))
        draw.text((x+44,y+274),"0x9f3C…dead  •  Unknown",font=FONT_MONO,fill=hex_to_rgb("#ff7b7b"))
        draw.text((x+28,y+324),"⚠  Malicious instruction changed the agent's intent",font=FONT_SMALL,fill=hex_to_rgb(RED))
    elif phase=="comparison":
        card_w,card_h=620,380
        gap=40
        x1=(W-(card_w*2+gap))//2; x2=x1+card_w+gap; y=280
        rounded_rect(draw,[x1,y,x1+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
        rounded_rect(draw,[x1,y,x1+card_w,y+56],18,CARD_BG2,None)
        draw.rectangle([x1,y+36,x1+card_w,y+56],fill=hex_to_rgb(CARD_BG2))
        draw.text((x1+20,y+18),"10 USDC APPROVED",font=font("DejaVuSans-Bold.ttf",16),fill=hex_to_rgb(GREEN))
        draw.text((x1+20,y+84),"10  USDC",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(TEXT))
        draw.text((x1+20,y+160),"Utility Vendor",font=FONT_MED,fill=hex_to_rgb(TEXT))
        draw.text((x1+20,y+190),"0x8a12…9f3C",font=FONT_MONO,fill=hex_to_rgb(MUTED))
        rounded_rect(draw,[x2,y,x2+card_w,y+card_h],18,"#1a0f0f","#3a1a1a")
        rounded_rect(draw,[x2,y,x2+card_w,y+56],18,"#2a1515",None)
        draw.rectangle([x2,y+36,x2+card_w,y+56],fill=hex_to_rgb("#2a1515"))
        draw.text((x2+20,y+18),"100 USDC REQUESTED",font=font("DejaVuSans-Bold.ttf",16),fill=hex_to_rgb(RED))
        draw.text((x2+20,y+84),"100 USDC",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(RED))
        draw.text((x2+20,y+160),"Unknown wallet",font=FONT_MED,fill=hex_to_rgb(RED))
        draw.text((x2+20,y+190),"0x9f3C…dead",font=FONT_MONO,fill=hex_to_rgb("#ff7b7b"))
        draw.text((W//2-draw.textlength("→",font=font("DejaVuSans-Bold.ttf",48))//2,y+card_h//2-20),"→",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(RED))
        draw.text((W//2-draw.textlength("Same agent, different authority",font=FONT_MED)//2,y+card_h+30),"Same agent, different authority",font=FONT_MED,fill=hex_to_rgb(RED))
    return img

def scene_safety():
    img=create_base_bg(); img=draw_top_nav(img); draw=ImageDraw.Draw(img)
    y0=140
    draw.text((80,y0),"WHY SAFETY IS NOT ENOUGH",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    draw.text((80,y0+36),"Warnings are intelligence. Not permission.",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
    card_w,card_h=520,340; x=80; y=250
    rounded_rect(draw,[x,y,x+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
    draw.text((x+24,y+20),"Risk Check",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(MUTED))
    draw.text((x+24,y+64),"HIGH RISK",font=font("DejaVuSans-Bold.ttf",42),fill=hex_to_rgb(RED))
    rounded_rect(draw,[x+24,y+124,x+card_w-24,y+176],10,"#1a0f0f","#3a1a1a")
    draw.text((x+36,y+138),"●  Block recommended",font=FONT_SMALL,fill=hex_to_rgb(RED))
    draw.text((x+24,y+200),"A security system can provide",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x+24,y+224),"warnings and intelligence.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x+card_w+60,y+card_h//2-20),"→",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(MUTED))
    x2=x+card_w+140
    rounded_rect(draw,[x2,y,x2+card_w+100,y+card_h],18,CARD_BG,CARD_BORDER)
    draw.text((x2+30,y+30),"Safety",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(MUTED))
    draw.text((x2+30+draw.textlength("Safety ",font=font("DejaVuSans-Bold.ttf",36)),y+30),"≠",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(ACCENT))
    draw.text((x2+30,y+78),"Authority",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(TEXT))
    draw.rounded_rectangle([x2+30,y+124,x2+30+180,y+128],radius=2,fill=hex_to_rgb(ACCENT))
    draw.text((x2+30,y+150),"A warning does not prove",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x2+30,y+174),"permission.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x2+30,y+212,x2+card_w+70,y+248],20,CARD_BG2,CARD_BORDER)
    draw.text((x2+44,y+222),"Safe is not the same as authorized.",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(ACCENT))
    yb=680
    rounded_rect(draw,[80,yb,W-80,yb+80],14,CARD_BG,CARD_BORDER)
    draw.text((110,yb+18),"Intelligence helps you know something.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((110,yb+44),"Authority determines whether you may act.",font=FONT_SMALL,fill=hex_to_rgb(TEXT))
    draw.text((W-300,yb+30),"AUCTORAIL",font=font("DejaVuSans-Bold.ttf",20),fill=hex_to_rgb(ACCENT))
    return img

def scene_check_form():
    img=create_base_bg(); img=draw_top_nav(img); draw=ImageDraw.Draw(img)
    card_w,card_h=640,620; x=80; y=140
    rounded_rect(draw,[x,y,x+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
    rounded_rect(draw,[x,y,x+card_w,y+64],18,CARD_BG2,None)
    draw.rectangle([x,y+40,x+card_w,y+64],fill=hex_to_rgb(CARD_BG2))
    draw.text((x+20,y+20),"AGENT PERMISSION",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(MUTED))
    draw.text((x+20,y+34),"invoice-bot",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(TEXT))
    rounded_rect(draw,[x+card_w-110,y+18,x+card_w-20,y+44],20,ACCENT,None)
    draw.text((x+card_w-94,y+24),"● ACTIVE",font=font("DejaVuSans-Bold.ttf",13),fill=(0,0,0))
    draw.text((x+20,y+84),"MAX PAYMENT",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
    draw.text((x+card_w-140,y+84),"5.00 USDC",font=FONT_MONO_BOLD,fill=hex_to_rgb(TEXT))
    rounded_rect(draw,[x+20,y+108,x+card_w-20,y+154],10,"#0f1214",CARD_BORDER)
    draw.text((x+48,y+122),"−",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    wmid=draw.textlength("5.00 USDC",font=FONT_MONO_BOLD)
    draw.text((x+(card_w-wmid)//2,y+122),"5.00 USDC",font=FONT_MONO_BOLD,fill=hex_to_rgb(TEXT))
    draw.text((x+card_w-56,y+122),"+",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    draw.text((x+20,y+174),"ALLOWED RECIPIENT",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+20,y+198,x+card_w-20,y+258],12,"#0f1214",CARD_BORDER)
    draw.text((x+32,y+210),"Auctorail Vendor",font=font("DejaVuSans-Bold.ttf",16),fill=hex_to_rgb(TEXT))
    draw.text((x+32,y+232),"0xB38d…2c14   •   Base Sepolia test recipient",font=FONT_MONO,fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+card_w-80,y+210,x+card_w-30,y+232],8,CARD_BG,CARD_BORDER)
    draw.text((x+card_w-72,y+214),"PINNED",font=font("DejaVuSans-Bold.ttf",10),fill=hex_to_rgb(MUTED))
    draw.text((x+20,y+278),"PERMISSION WINDOW",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+20,y+302,x+card_w-20,y+348],10,"#0f1214",CARD_BORDER)
    draw.text((x+48,y+316),"−",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    w2=draw.textlength("1 hour",font=FONT_MONO_BOLD)
    draw.text((x+(card_w-w2)//2,y+316),"1 hour",font=FONT_MONO_BOLD,fill=hex_to_rgb(TEXT))
    draw.text((x+card_w-56,y+316),"+",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    y2=y+380
    rounded_rect(draw,[x,y2,x+card_w,y2+140],14,CARD_BG,CARD_BORDER)
    draw.text((x+20,y2+16),"CURRENT REQUEST",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
    draw.text((x+20,y2+42),"1.00 USDC  →  Auctorail Vendor",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(TEXT))
    draw.text((x+20,y2+70),"Supplier invoice #4471  •  Ref: INV-4471",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((x+20,y2+96),"⬢",font=font("DejaVuSans.ttf",18),fill=hex_to_rgb(MUTED))
    yb=y2+164
    rounded_rect(draw,[x,yb,x+card_w,yb+56],10,ACCENT,None)
    draw.text((x+card_w//2-draw.textlength("CHECK THIS REQUEST  →",font=font("DejaVuSans-Bold.ttf",18))//2,yb+18),"CHECK THIS REQUEST  →",font=font("DejaVuSans-Bold.ttf",18),fill=(0,0,0))
    rx=x+card_w+40; rw=W-rx-80; rh=620; ry=140
    rounded_rect(draw,[rx,ry,rx+rw,ry+rh],18,CARD_BG,CARD_BORDER)
    draw.text((rx+24,ry+20),"The decision appears here.",font=font("DejaVuSans-Bold.ttf",18),fill=hex_to_rgb(TEXT))
    draw.text((rx+24,ry+50),"Run the check and every stage — rules, evidence,",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    draw.text((rx+24,ry+70),"decision — is shown exactly as it happens.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    steps=["Request frozen & hashed","Permission checked first","Evidence bound to the action","Decision: ALLOW · HOLD · BLOCK"]
    yy=ry+120
    for i,s in enumerate(steps):
        rounded_rect(draw,[rx+24,yy,rx+rw-24,yy+44],10,"#0f1214",CARD_BORDER)
        draw.text((rx+36,yy+14),f"{i+1:02}",font=FONT_MONO,fill=hex_to_rgb(MUTED))
        draw.text((rx+80,yy+14),s,font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
        yy+=54
    draw.text((rx+rw//2-10,ry+420),"⬢",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(CARD_BORDER))
    return img

def scene_checking_progress(stage="rules"):
    img=create_base_bg(); img=draw_top_nav(img); draw=ImageDraw.Draw(img)
    draw.text((80,120),"AUTHORIZATION IN PROGRESS",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(MUTED))
    stages=[("rules","LOCAL RULES","01"),("miners","LIVE INTELLIGENCE","02"),("decision","DECISION","03")]
    x0=80; w_step=(W-160)//3; y=180
    for i,(key,label,num) in enumerate(stages):
        active=(key==stage) or (stage=="miners" and i==0) or (stage=="decision" and i<2)
        done=(stage=="miners" and i==0) or (stage=="decision" and i<3)
        cx=x0+i*w_step+w_step//2
        if i<2: draw.line([(cx+30,y+18),(cx+w_step-30,y+18)],fill=hex_to_rgb(CARD_BORDER if not done else ACCENT),width=2)
        if done:
            draw.ellipse([cx-18,y,cx+18,y+36],fill=hex_to_rgb(ACCENT))
            draw.text((cx-8,y+8),"✓",font=font("DejaVuSans-Bold.ttf",16),fill=(0,0,0))
        elif active:
            draw.ellipse([cx-18,y,cx+18,y+36],fill=hex_to_rgb(BG),outline=hex_to_rgb(ACCENT),width=2)
            draw.text((cx-6,y+8),"◐",font=font("DejaVuSans.ttf",16),fill=hex_to_rgb(ACCENT))
        else:
            draw.ellipse([cx-18,y,cx+18,y+36],fill=hex_to_rgb(CARD_BG),outline=hex_to_rgb(CARD_BORDER),width=2)
            draw.text((cx-8,y+8),num,font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((cx-draw.textlength(label,font=font("DejaVuSans-Bold.ttf",13))//2,y+52),label,font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(TEXT if active else MUTED))
        draw.text((cx-draw.textlength("09:42:10",font=FONT_MONO)//2,y+72),"09:42:1"+str(i),font=FONT_MONO,fill=hex_to_rgb(MUTED))
    card_w,card_h=W-160,580; x,y=80,280
    rounded_rect(draw,[x,y,x+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
    if stage=="rules":
        draw.text((x+32,y+24),"Checking permission…",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
        draw.text((x+32,y+64),"Action hash created and verified against mandate",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        rounded_rect(draw,[x+32,y+110,x+card_w-32,y+200],12,"#0f1214",CARD_BORDER)
        draw.text((x+48,y+124),"ACTION FROZEN",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
        draw.text((x+48,y+148),"0x8a3f…e91e",font=FONT_MONO_BOLD,fill=hex_to_rgb(ACCENT))
        draw.text((x+48,y+170),"1.00 USDC  →  0xB38d…2c14  •  Base Sepolia 84532",font=FONT_MONO,fill=hex_to_rgb(SUBTLE))
        rounded_rect(draw,[x+32,y+220,x+card_w-32,y+300],12,"#0f1410","#1e2a22")
        draw.text((x+48,y+234),"DELEGATION VERIFIED",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(GREEN))
        draw.text((x+48,y+258),"invoice-bot  •  within 5.00 USDC limit",font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
    elif stage=="miners":
        draw.text((x+32,y+24),"Acquiring Telegraph evidence…",font=FONT_BOLD,fill=hex_to_rgb(TEXT))
        draw.text((x+32,y+64),"FRAUD_DETECTION  •  exact subject & chain binding",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        rows=[("FRAUD_DETECTION","Refut On-Chain Risk  •  95822412","ALLOW  •  0.70",GREEN),("Intent","Auto-route  •  Base Sepolia 84532","Pending",MUTED)]
        yy=y+110
        for title,sub,status,col in rows:
            rounded_rect(draw,[x+32,yy,x+card_w-32,yy+72],12,"#0f1214" if col==MUTED else "#0f1410",CARD_BORDER if col==MUTED else "#1e2a22")
            draw.text((x+48,yy+16),title,font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(col if col!=MUTED else MUTED))
            draw.text((x+48,yy+36),sub,font=FONT_MONO,fill=hex_to_rgb(SUBTLE))
            draw.text((x+card_w-140,yy+26),status,font=FONT_SMALL,fill=hex_to_rgb(col))
            yy+=84
        rounded_rect(draw,[x+32,yy+10,x+card_w-32,yy+64],10,CARD_BG2,CARD_BORDER)
        draw.text((x+48,yy+22),"Signal commitment",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x+48,yy+38),"0x1349…cae4c  •  x402 $0.01",font=FONT_MONO,fill=hex_to_rgb(TEXT))
    else:
        draw.text((x+32,y+24),"Decision: ALLOW",font=FONT_BOLD,fill=hex_to_rgb(GREEN))
        rounded_rect(draw,[x+32,y+64,x+220,y+96],20,GREEN,None)
        draw.text((x+52,y+72),"●  ALLOW",font=font("DejaVuSans-Bold.ttf",16),fill=(0,0,0))
        draw.text((x+240,y+72),"All required checks passed for the exact action.",font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
        rounded_rect(draw,[x+32,y+110,x+card_w-32,y+200],12,"#0f1410","#1e2a22")
        draw.text((x+48,y+124),"EVIDENCE BUNDLE",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
        draw.text((x+48,y+148),"Bundle hash  0x9f3c…8a2e  •  1 distinct Miner  •  Confidence ≥0.70",font=FONT_MONO,fill=hex_to_rgb(SUBTLE))
        rounded_rect(draw,[x+32,y+220,x+card_w-32,y+300],12,"#0f1214",CARD_BORDER)
        draw.text((x+48,y+234),"PERMIT READY",font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
        draw.text((x+48,y+258),"Signed one-use permit  •  expires in 120s  •  hash 0x4a8b…c91e",font=FONT_MONO,fill=hex_to_rgb(TEXT))
    return img

def scene_failure(typ="overlimit"):
    img=create_base_bg(); img=draw_top_nav(img); draw=ImageDraw.Draw(img)
    if typ=="overlimit":
        draw.text((80,120),"FAILURE CASE  •  OVER LIMIT",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(RED))
        draw.text((80,154),"When an agent exceeds delegated authority, Auctorail stops the action.",font=FONT_REG,fill=hex_to_rgb(MUTED))
        card_w,card_h=520,260; x1,y=80,240
        rounded_rect(draw,[x1,y,x1+card_w,y+card_h],16,"#1a0f0f","#3a1a1a")
        draw.text((x1+24,y+20),"REQUESTED",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb("#ff7b7b"))
        draw.text((x1+24,y+52),"7.00 USDC",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(RED))
        draw.text((x1+24,y+114),"Auctorail Vendor",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x1+24,y+170),"Blocked before any Telegraph call",font=FONT_SMALL,fill=hex_to_rgb(RED))
        x2=W-80-card_w
        rounded_rect(draw,[x2,y,x2+card_w,y+card_h],16,CARD_BG,CARD_BORDER)
        draw.text((x2+24,y+20),"ALLOWED",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(MUTED))
        draw.text((x2+24,y+52),"5.00 USDC",font=font("DejaVuSans-Bold.ttf",48),fill=hex_to_rgb(TEXT))
        draw.text((x2+24,y+114),"Per-action ceiling",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((W//2-20,y+card_h//2-20),"→",font=font("DejaVuSans-Bold.ttf",36),fill=hex_to_rgb(RED))
        yb=560
        rounded_rect(draw,[80,yb,W-80,yb+180],16,"#1a0f0f","#3a1a1a")
        draw.text((W//2-draw.textlength("BLOCKED",font=font("DejaVuSans-Bold.ttf",56))//2,yb+24),"BLOCKED",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(RED))
        draw.text((W//2-draw.textlength("No evidence purchased  •  No permit issued",font=FONT_SMALL)//2,yb+96),"No evidence purchased  •  No permit issued",font=FONT_SMALL,fill=hex_to_rgb("#ff7b7b"))
        draw.text((W//2-draw.textlength("Deterministic policy enforced the mandate ceiling.",font=FONT_SMALL)//2,yb+126),"Deterministic policy enforced the mandate ceiling.",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    else:
        draw.text((80,120),"FAILURE CASE  •  MISSING EVIDENCE",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(AMBER))
        draw.text((80,154),"When required evidence cannot be obtained, Auctorail fails closed.",font=FONT_REG,fill=hex_to_rgb(MUTED))
        card_w,card_h=W-160,340; x,y=80,240
        rounded_rect(draw,[x,y,x+card_w,y+card_h],16,"#1a160f","#3a2a0a")
        draw.text((x+32,y+24),"Evidence unavailable",font=FONT_BOLD,fill=hex_to_rgb(AMBER))
        draw.text((x+32,y+64),"FRAUD_DETECTION  •  route unavailable within 12s deadline",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        rounded_rect(draw,[x+32,y+120,x+card_w-32,y+180],10,"#0f1214",CARD_BORDER)
        draw.text((x+48,y+134),"Attempt 1  •  Telegraph timeout",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x+card_w-140,y+134),"Retry",font=FONT_SMALL,fill=hex_to_rgb(AMBER))
        rounded_rect(draw,[x+32,y+192,x+card_w-32,y+252],10,"#0f1214",CARD_BORDER)
        draw.text((x+48,y+206),"Attempt 2  •  insufficient confidence",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
        draw.text((x+card_w-140,y+206),"Retry",font=FONT_SMALL,fill=hex_to_rgb(AMBER))
        rounded_rect(draw,[x+32,y+264,x+card_w-32,y+316],10,"#1a160f","#3a2a0a")
        draw.text((x+48,y+278),"Quorum not reached  •  0/1 distinct Miner",font=FONT_SMALL,fill=hex_to_rgb(AMBER))
        yb=620
        rounded_rect(draw,[80,yb,W-80,yb+140],16,"#1a160f","#3a2a0a")
        draw.text((W//2-draw.textlength("HOLD",font=font("DejaVuSans-Bold.ttf",56))//2,yb+20),"HOLD",font=font("DejaVuSans-Bold.ttf",56),fill=hex_to_rgb(AMBER))
        draw.text((W//2-draw.textlength("No execution authority  •  Safe Hold, not silent permission",font=FONT_SMALL)//2,yb+90),"No execution authority  •  Safe Hold, not silent permission",font=FONT_SMALL,fill=hex_to_rgb(AMBER))
    return img

def scene_success():
    img=create_base_bg(); img=draw_top_nav(img); draw=ImageDraw.Draw(img)
    draw.text((80,120),"REAL SUCCESS  •  PROTECTED EXECUTION",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(GREEN))
    draw.text((80,154),"For approved actions, execution is verifiable.",font=FONT_REG,fill=hex_to_rgb(MUTED))
    checks=["Authorization Passed","Telegraph Evidence ✓","Permit Issued ✓","Execution Complete ✓","Base Sepolia Confirmed ✓"]
    x,y=80,210
    for i,c in enumerate(checks):
        col=GREEN if "✓" in c else MUTED
        rounded_rect(draw,[x+i*((W-160-60)//5+15),y,x+i*((W-160-60)//5+15)+(W-160-60)//5,y+48],10,"#0f1410" if "✓" in c else CARD_BG,"#1e2a22" if "✓" in c else CARD_BORDER)
        draw.text((x+i*((W-160-60)//5+15)+16,y+14),c,font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(col if col==GREEN else TEXT))
    card_w,card_h=900,460; x,y=80,300
    rounded_rect(draw,[x,y,x+card_w,y+card_h],18,CARD_BG,CARD_BORDER)
    draw.text((x+24,y+20),"TRANSACTION",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+24,y+50,x+card_w-24,y+92],10,GREEN,None)
    draw.text((x+40,y+62),"●  CONFIRMED  •  Block 46301208",font=font("DejaVuSans-Bold.ttf",14),fill=(0,0,0))
    draw.text((x+24,y+110),"1.00 USDC  →  Auctorail Vendor",font=font("DejaVuSans-Bold.ttf",22),fill=hex_to_rgb(TEXT))
    draw.text((x+24,y+144),"0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",font=FONT_MONO,fill=hex_to_rgb(MUTED))
    draw.text((x+24,y+190),"TRANSACTION HASH",font=font("DejaVuSans-Bold.ttf",12),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+24,y+212,x+card_w-24,y+252],8,"#0f1214",CARD_BORDER)
    draw.text((x+36,y+224),"0x41b1…f2ffc",font=FONT_MONO_BOLD,fill=hex_to_rgb(TEXT))
    draw.text((x+24,y+270),"RECEIPT HASH",font=font("DejaVuSans-Bold.ttf",12),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x+24,y+292,x+card_w-24,y+332],8,"#0f1214",CARD_BORDER)
    draw.text((x+36,y+304),"0x036a…91e3",font=FONT_MONO_BOLD,fill=hex_to_rgb(ACCENT))
    draw.text((x+24,y+356),"Signal 0x1349…cae4c  •  Miner 95822412  •  $0.01 x402",font=FONT_SMALL,fill=hex_to_rgb(MUTED))
    x2=x+card_w+40; rw=W-x2-80
    rounded_rect(draw,[x2,y,x2+rw,y+card_h],18,CARD_BG,CARD_BORDER)
    draw.text((x2+24,y+20),"PROOF RECEIPT  •  VERIFY",font=font("DejaVuSans-Bold.ttf",14),fill=hex_to_rgb(MUTED))
    rounded_rect(draw,[x2+24,y+54,x2+rw-24,y+124],12,"#0f1410","#1e2a22")
    draw.text((x2+40,y+66),"VALID",font=font("DejaVuSans-Bold.ttf",28),fill=hex_to_rgb(GREEN))
    draw.text((x2+130,y+72),"Receipt signature verified",font=FONT_SMALL,fill=hex_to_rgb(SUBTLE))
    lines=[("Policy","payments.adaptive.v1"),("Risk tier","LOW  •  ≤5 USDC"),("Permit","0x4a8b…c91e  •  120s"),("Action hash","0x8a3f…e91e"),("Evidence","FRAUD_DETECTION  •  0.70")]
    yy=y+140
    for k,v in lines:
        draw.text((x2+24,yy),k,font=font("DejaVuSans-Bold.ttf",13),fill=hex_to_rgb(MUTED))
        draw.text((x2+160,yy),v,font=FONT_MONO,fill=hex_to_rgb(TEXT))
        yy+=28
    rounded_rect(draw,[x2+24,y+card_h-50,x2+rw-24,y+card_h-16],8,CARD_BG2,CARD_BORDER)
    draw.text((x2+36,y+card_h-40),"🔗  View on BaseScan ↗",font=FONT_SMALL,fill=hex_to_rgb(ACCENT2))
    return img

def scene_final():
    img=Image.new("RGB",(W,H),(5,6,8))
    draw=ImageDraw.Draw(img)
    for i in range(H):
        alpha=int(14*math.sin(math.pi*i/H))
        draw.line([(0,i),(W,i)],fill=(0,208,132,alpha//14*2))
    y=380
    draw.text((W//2-draw.textlength("SAFE IS NOT THE SAME AS AUTHORIZED",font=font("DejaVuSans-Bold.ttf",38))//2,y),"SAFE IS NOT THE SAME AS AUTHORIZED",font=font("DejaVuSans-Bold.ttf",38),fill=hex_to_rgb(TEXT))
    draw.rounded_rectangle([W//2-180,y+64,W//2+180,y+68],radius=2,fill=hex_to_rgb(ACCENT))
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

KEYWORDS=["AUTHORITY","TELEGRAPH","PERMIT","HOLD","EXECUTION","ALLOW","BLOCK","EVIDENCE","AUCTORAIL","BASE SEPOLIA"]
def caption_image(text, highlight_words):
    bar_h=170
    img=Image.new("RGBA",(W,bar_h),(0,0,0,0))
    draw=ImageDraw.Draw(img)
    rounded_rect(draw,[80,18,W-80,bar_h-18],14,"#0f1214","#23262b")
    max_w=W-180
    f=FONT_CAPTION_SMALL if len(text)>90 else FONT_CAPTION
    lines=draw_text_wrap(draw,text,f,max_w,hex_to_rgb(TEXT))
    if len(lines)>2:
        f=FONT_CAPTION_SMALL
        lines=draw_text_wrap(draw,text,f,max_w,hex_to_rgb(TEXT))
    line_h=f.size+10
    total_h=len(lines)*line_h
    y0=(bar_h-total_h)//2
    for line in lines:
        words=line.split(" ")
        line_width=draw.textlength(line,font=f)
        cx=(W-line_width)//2
        for w in words:
            clean=w.strip(".,!—→•").upper()
            is_highlight=clean in highlight_words
            col=hex_to_rgb(ACCENT) if is_highlight else hex_to_rgb(TEXT)
            draw.text((cx,y0),w,font=f,fill=col)
            cx+=draw.textlength(w+" ",font=f)
        y0+=line_h
    return img

def add_caption_to_image(base_img, caption_text):
    cap= caption_image(caption_text, KEYWORDS)
    base_rgba = base_img.convert("RGBA")
    base_rgba.alpha_composite(cap, (0, H-cap.height-28))
    return base_rgba.convert("RGB")

# Build segments: (filename, duration, caption, generator)
segments = [
    ("intro.png", 10, "AI agents can execute actions. But the biggest question is what they are actually authorized to do.", lambda: render_intro_frame("AUCTORAIL","Prove authority before execution.",1.0,True)),
    ("problem1.png", 6, "You delegate one payment. One amount. One recipient.", lambda: scene_problem("approved")),
    ("problem2.png", 6, "But malicious instructions can change what the agent wants to do.", lambda: scene_problem("attack")),
    ("problem3.png", 8, "Ten USDC approved can become one hundred USDC requested to an unknown wallet.", lambda: scene_problem("comparison")),
    ("safety.png", 16, "Security systems can provide warnings. But a warning does not prove permission. Safe is not the same as authorized.", lambda: scene_safety()),
    ("check.png", 8, "Auctorail freezes the exact action before execution.", lambda: scene_check_form()),
    ("rules.png", 7, "It captures the amount, the recipient, the chain, and creates a cryptographic hash.", lambda: scene_checking_progress("rules")),
    ("miners.png", 9, "It verifies delegation and purchases Telegraph intelligence.", lambda: scene_checking_progress("miners")),
    ("decision.png", 8, "Only then: Allow, Hold, or Block — and a single-use permit.", lambda: scene_checking_progress("decision")),
    ("fail1.png", 9, "When an agent exceeds authority, Auctorail blocks the action.", lambda: scene_failure("overlimit")),
    ("fail2.png", 9, "When evidence is missing, Auctorail fails closed: Hold.", lambda: scene_failure("hold")),
    ("success.png", 20, "For approved actions, Auctorail enables execution with a verifiable receipt. One USDC. Telegraph verified. Base Sepolia confirmed.", lambda: scene_success()),
    ("final.png", 14, "Telegraph provides intelligence. Auctorail provides authority. Prove authority before execution.", lambda: scene_final()),
]

print("Generating PNGs...")
tmp = ROOT / "video-assets" / "frames"
tmp.mkdir(exist_ok=True)
for name, dur, cap, gen in segments:
    img = gen()
    img2 = add_caption_to_image(img, cap)
    out = tmp / name
    img2.save(out, "PNG")
    print(f"  {name} {dur}s")

# Build ffmpeg concat demuxer file
list_path = tmp / "concat.txt"
with open(list_path,"w") as f:
    for name, dur, cap, gen in segments:
        f.write(f"file '{(tmp/name).absolute()}'\n")
        f.write(f"duration {dur}\n")
    # last file needs extra entry per ffmpeg concat spec
    f.write(f"file '{(tmp/segments[-1][0]).absolute()}'\n")

# Create silent video from images
video_tmp = OUT / "video-only.mp4"
cmd = [FF, "-y", "-f", "concat", "-safe", "0", "-r", "30", "-i", str(list_path), "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p", "-vf", "scale=1920:1080:flags=lanczos", "-preset", "ultrafast", "-crf", "18", "-movflags", "+faststart", str(video_tmp)]
print("Encoding video stream...")
print(" ".join(cmd))
subprocess.run(cmd, check=True)
print(f"Video-only: {video_tmp.stat().st_size/1024/1024:.2f} MB")

# Build audio: need to create 130s audio with narrations at offsets
# Offsets as earlier: intro 0.5, problem 10.5, safety 30.5, auctorail 46.5, failure 78.5, success 96.5, final 116.5
# We'll create a 130s silent base then overlay
# First create silence with ffmpeg anullsrc
import glob as g
audio_files = {
    "audio-intro.mp3": 0.5,
    "audio-problem.mp3": 10.5,
    "audio-safety.mp3": 30.5,
    "audio-auctorail.mp3": 46.5,
    "audio-failure.mp3": 78.5,
    "audio-success.mp3": 96.5,
    "audio-final.mp3": 116.5,
}
# Build filter_complex
# Inputs: 0 = silent base, 1..n = narration files
# We'll generate silent base via anullsrc in filter, but easier: use ffmpeg to create 130s silent wav then amix
silent = tmp / "silence.wav"
cmd_sil = [FF, "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=130", "-c:a", "pcm_s16le", str(silent)]
subprocess.run(cmd_sil, check=True)
# Build final audio mix
inputs = ["-i", str(silent)]
for af in audio_files:
    inputs += ["-i", str(OUT/af)]
# filter_complex: [0][1] etc with adelay
filter_parts = []
amix_inputs = []
for idx, (af, offset) in enumerate(audio_files.items(), start=1):
    ms = int(offset*1000)
    filter_parts.append(f"[{idx}:a]adelay={ms}|{ms}[a{idx}]")
    amix_inputs.append(f"[a{idx}]")
# Also need to keep silent as [0:a]
# Now amix all: [0:a] + all delayed
all_labels = "[0:a]" + "".join(amix_inputs)
n = len(audio_files)+1
# also add ambient low drone: we skip for speed, just use narrations + silence
filter_complex = ";".join(filter_parts) + f";{all_labels}amix=inputs={n}:duration=longest:dropout_transition=0:normalize=0[aout]"
# add volume for bg? we have silence as base, so just amix
# Add final loudnorm? skip
audio_mixed = tmp / "mixed.aac"
cmd_aud = [FF, "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[aout]", "-c:a", "aac", "-b:a", "128k", str(audio_mixed)]
print("Mixing audio...")
print(" ".join(cmd_aud))
subprocess.run(cmd_aud, check=True)
print(f"Mixed audio: {audio_mixed.stat().st_size/1024:.1f} KB")

# Mux video + audio
final_mp4 = OUT / "auctorail-demo-final.mp4"
cmd_mux = [FF, "-y", "-i", str(video_tmp), "-i", str(audio_mixed), "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(final_mp4)]
print("Muxing final mp4...")
subprocess.run(cmd_mux, check=True)
print(f"Final MP4: {final_mp4.stat().st_size/1024/1024:.2f} MB")

# WebM
final_webm = OUT / "auctorail-demo-final.webm"
cmd_webm = [FF, "-y", "-i", str(final_mp4), "-c:v", "libvpx-vp9", "-b:v", "2500k", "-c:a", "libopus", "-b:a", "128k", str(final_webm)]
print("Encoding webm...")
subprocess.run(cmd_webm, check=True)
print(f"Final WebM: {final_webm.stat().st_size/1024/1024:.2f} MB")

# Thumbnail from final frame
thumb = OUT / "thumbnail.png"
import shutil
shutil.copy(tmp / "final.png", thumb)
print(f"Thumbnail: {thumb}")
thumb_small = OUT / "thumbnail-1280.png"
Image.open(thumb).resize((1280,720), Image.LANCZOS).save(thumb_small)
print("Done fast video")
for p in [final_mp4, final_webm, thumb]:
    print(p, f"{p.stat().st_size/1024/1024:.2f} MB")
