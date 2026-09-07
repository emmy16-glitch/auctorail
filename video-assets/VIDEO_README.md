# Auctorail Hackathon Demo Video — Assets (V2 Final)

**Creation date:** 2026-09-07  
**Version:** V2 — Real Browser + Typing + Zoom + SFX  
**Tools:** Pillow 11.3 + FFmpeg 7.0.2 + Arena TTS voice-00 + Python wave + Puppeteer @sparticuz/chromium (real 1920×1080 captures)  
**Duration:** 2:10 (130.00s) — 1920×1080 H.264 yuv420p + AAC 48kHz stereo, 30fps, faststart, 7.7 MB

## What's V2 vs V1

- **V1 (6.5 MB):** 13 synthetic stills looped — looked patched.
- **V2 (7.7 MB):** **Real browser recording** from `http://127.0.0.1:5173` and `https://auctorail.vercel.app` pattern — 10 captures at 1920×1080 with **browser chrome** (traffic lights + `auctorail.vercel.app` bar), **cursor dot**, **zoompan 1.0→1.04** (Ken Burns), and **slide transitions** — feels like navigating the live site.

## Intro — Typing AUCTORAIL (0:00-0:10)

- Black `#0b0c0e` → `AUCTORAIL` **types letter-by-letter** with **scramble decode** (`AUCTORAILXKMNZ0123456789#` flicker) and **slide 20px→0** per letter (0.27s each, 9 letters over 2.5s)
- **Keyboard `tick` SFX** at each letter (900Hz, 40ms, 0.35 vol) + green underline draws 0→100%
- Tagline `Prove authority before execution.` fades in at 2.8s (0.7s fade)
- Cursor blinks at 2Hz, bottom hint `Keyboard typing • AUCTORAIL`

## Captions — Not Blocking

- Old: 170px bar at y=882 (blocked cards)
- **New: 84px bar at y=980 (bottom 16px margin)** — `DejaVuSans 26pt`, `max_w 1780`, `line_h 32`, centered, **highlighted** `AUTHORITY/TELEGRAPH/PERMIT/HOLD/EXECUTION` in `#00d084` on `#0f1214` with `1px #00d084` top line. Product cards end at y≈860, captions at y≈980 — **20px gap, never overlaps**.

## Sound Design

- **Narration:** 7 TTS segments (108.6s) at offsets 0.5s, 10.5s, 30.5s, 46.5s, 78.5s, 96.5s, 116.5s — male calm technical, 1.0 vol
- **SFX Typing:** 9 clicks at 0s-2.5s (0.35 vol)
- **Clicks:** 12× `1200Hz 80ms` at each segment boundary (10s,16s,22s,30s,46s,54s,61s,70s,78s,87s,96s,116s) — 0.45 vol
- **Whoosh:** 6× `80→400Hz sweep 0.4s` at 9.8s,29.8s,45.8s,77.8s,95.8s,115.8s — 0.25 vol
- **Drone:** 55Hz+110Hz 0.03/0.015 at -28dB, fade in 1s / out 2s, mixed at 0.6 — voice always clear

## Product Flow (Real Browser where it matters)

1. **Intro 10s** — typed AUCTORAIL (synthetic, as above)
2. **Problem 20s** — synthetic `10 USDC` vs `100 USDC` with browser chrome — still conceptual, but now with outer chrome so it feels like browser
3. **Safety 16s** — synthetic `HIGH RISK` vs `Safety ≠ Authority`
4. **Auctorail 32s** — **REAL** `real-check.png` (8s, cursor at CHECK button) → `real-demo.png` (7s, guided demo) → `real-miners.png` (9s, security-lab-run) → `real-decision.png` (8s, verify VALID) — all with zoompan + cursor + click SFX
5. **Failure 18s** — REAL `real-permissions`/`real-content` with permissions screen
6. **Success 20s** — REAL `real-success` (home landing) + synthetic tx card `0x41b1…f2ffc` / `0x036a…91e3` / `Block 46301208` (since tx is real but not captured as product screen)
7. **Final 14s** — `SAFE IS NOT THE SAME AS AUTHORIZED` / `github.com/emmy16-glitch/auctorail`

## Files

- `auctorail-demo-final.mp4` — 7.7 MB, 1920×1080, 2:10.00, H.264 + AAC, faststart
- `auctorail-demo-final.webm` — 10 MB, 1920×1080, VP9 + Opus, same duration
- `thumbnail.png` — 1920×1080 final frame (V2, with browser chrome where applicable)
- `VIDEO_README.md` — this file
- `frames_v2/*.png` — 13 source frames (synthetic + real) + `intro-typed.mp4` + `frames_real/*.png` (10 real captures)

## Verification

```bash
ffprobe video-assets/auctorail-demo-final.mp4  # Duration 00:02:10.00, 1920x1080, 30fps
ffprobe video-assets/auctorail-demo-final.webm
# Captions at y=980, bar 84px, never covers cards
# Audio: narration + typing + whoosh + clicks + drone, voice at 0dB, SFX at -8 to -12dB
```

No fake claims: only existing mandates, permits, Telegraph FRAUD_DETECTION, Base Sepolia execution.
