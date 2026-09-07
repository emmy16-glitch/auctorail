# Auctorail Hackathon Demo Video — Assets

**Creation date:** 2026-09-07  
**Tools used:** Pillow 11.3 + MoviePy 2.2.1 + FFmpeg 7.0.2 (imageio_ffmpeg) + Arena TTS (voice-00) + Python wave concat  
**Video purpose:** Judge-ready 2:10 product demonstration for hackathon submission — proves “AI agents can act, but Auctorail ensures they only execute what they’re authorized to do.”

## Files

- `auctorail-demo-final.mp4` — 1920×1080 H.264 + AAC, ~2:10, ~6.5 MB, 30 fps, faststart. Primary deliverable.
- `auctorail-demo-final.webm` — VP9 + Opus web alternative (same duration, 1080p or 720p fallback).
- `thumbnail.png` — 1920×1080 final frame (also `thumbnail-1280.png` 1280×720).
- `audio-*.mp3` — 7 TTS narration segments (Arena voice-00, male calm technical).
- `frames/*.png` — 13 high-fidelity 1080p scene renders used as slideshow source.

## Demo flow (130s)

1. **Intro (0:00-0:10)** — AUCTORAIL typing, “Prove authority before execution.” — narration: what they’re authorized to do.
2. **Problem (0:10-0:30)** — 10 USDC approved → 100 USDC injected → comparison “Same agent, different authority.”
3. **Why safety ≠ authority (0:30-0:46)** — HIGH RISK warning vs Safety ≠ Authority.
4. **Auctorail (0:46-1:18)** — Check form (invoice-bot, 5 USDC, pinned vendor) → LOCAL RULES (action frozen 0x8a3f…) → LIVE INTELLIGENCE (FRAUD_DETECTION Refut 95822412, 0.70, x402 $0.01) → Decision ALLOW + permit.
5. **Failure cases (1:18-1:36)** — Over limit 7 vs 5 → BLOCKED, Missing evidence → HOLD.
6. **Real success (1:36-1:56)** — 5-check checklist, tx 0x41b1…f2ffc Block 46301208, receipt 0x036a…91e3, BaseScan, VALID.
7. **Final (1:56-2:10)** — “SAFE IS NOT THE SAME AS AUTHORIZED” / Telegraph intelligence / Auctorail authority / github.com/emmy16-glitch/auctorail

## Technical notes

- All product UI is high-fidelity mock derived from `web/*.tsx` + `app.css` (dark #0b0c0e, cards #14171a, accent #00d084) — no invented features; only existing mandates, permits, Telegraph evidence, Base Sepolia execution.
- Narration: 7 segments, 108.6s total, concatenated with precise silence gaps to 130s via Python wave concat (no amix drift).
- Video: 13 stills @30 fps looped per segment, concat demuxer → 4.8M video-only → muxed with 129.6s audio → 6.5M final, H.264 yuv420p + AAC, movflags faststart.
- Captions: burned, 170px bar #0f1214, DejaVuSans, highlighted AUTHORITY/TELEGRAPH/PERMIT/HOLD/EXECUTION in #00d084, centered, wrapped.
- Background: very low 55 Hz + 110 Hz drone at -28 dB (voice clear).
- No PermitGate deployment claims; architecture matches current code: freeze → delegation → Telegraph (when required) → ALLOW/HOLD/BLOCK → signed permit → protected execution → receipt.

## Verification

```bash
ffprobe video-assets/auctorail-demo-final.mp4
ffprobe video-assets/auctorail-demo-final.webm
# Duration 00:02:09.58, 1920x1080, 30fps, H.264/AAC
```

Download: via GitHub raw on branch `arena/01a07a69-auctorail` under `/video-assets/`.
