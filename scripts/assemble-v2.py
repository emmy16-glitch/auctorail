#!/usr/bin/env python3
import pathlib, subprocess, os, wave, struct, math
ROOT = pathlib.Path(__file__).resolve().parent.parent
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
OUT = ROOT / "video-assets"
FRAMES_V2 = OUT / "frames_v2"
TMP = OUT / "frames_v2_tmp"
TMP.mkdir(exist_ok=True)

# Define segments for V2 with durations and source
# intro is now video, rest are PNGs
segments = [
    ("intro-typed.mp4", 10, "video"),  # already video
    ("problem1.png", 6, "image"),
    ("problem2.png", 6, "image"),
    ("problem3.png", 8, "image"),
    ("safety.png", 16, "image"),
    ("real-check.png", 8, "image"),
    ("real-demo.png", 7, "image"),
    ("real-miners.png", 9, "image"),
    ("real-decision.png", 8, "image"),
    ("real-fail1.png", 9, "image"),
    ("real-fail2.png", 9, "image"),
    ("real-success.png", 20, "image"),
    ("final.png", 14, "image"),
]

# Step 1: Create video segments with zoompan for images
print("Creating zoompan segments...")
seg_videos = []
for fname, dur, typ in segments:
    if typ == "video":
        # already video, just copy
        src = FRAMES_V2 / fname
        dst = TMP / f"seg_{fname}"
        import shutil
        shutil.copy(src, dst)
        seg_videos.append(dst)
        print(f"  copied video {fname} {dur}s")
    else:
        src = FRAMES_V2 / fname
        dst = TMP / f"seg_{fname}.mp4"
        # Use zoompan for subtle motion
        # zoom from 1.0 to 1.04 over duration
        # d=1 means each image holds 1 frame, fps 30
        cmd = [
            FF, "-y", "-hide_banner", "-loglevel", "error",
            "-loop", "1", "-framerate", "30", "-t", str(dur), "-i", str(src),
            "-vf", "zoompan=z='min(zoom+0.0011,1.04)':d=1:s=1920x1080:fps=30,scale=1920:1080:flags=lanczos",
            "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p",
            "-preset", "ultrafast", "-crf", "20",
            str(dst)
        ]
        print(f"  zoompan {fname} {dur}s")
        subprocess.run(cmd, check=True)
        seg_videos.append(dst)

print(f"Created {len(seg_videos)} segments")

# Step 2: Concat video segments via demuxer
concat_list = TMP / "vconcat.txt"
with open(concat_list, "w") as f:
    for p in seg_videos:
        f.write(f"file '{p.resolve()}'\n")
video_only = OUT / "video-only-v2.mp4"
cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(video_only)]
print("Concatenating video...")
subprocess.run(cmd, check=True)
# Re-encode to ensure proper timestamps and faststart
video_final = OUT / "video-only-v2-ultrafast.mp4"
cmd2 = [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video_only), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video_final)]
subprocess.run(cmd2, check=True)
print(f"Video only V2: {video_final.stat().st_size/1024/1024:.2f} MB")
# Probe
subprocess.run([FF, "-hide_banner", "-i", str(video_final)], capture_output=False)

# Step 3: Audio with SFX
print("Mixing audio with SFX...")
# Load narration wavs (already converted to 48k stereo)
import wave
# Load SFX
sfx_typing_path = OUT / "sfx_typing.wav"
sfx_click_path = OUT / "sfx_click.wav"
sfx_whoosh_path = OUT / "sfx_whoosh.wav"
# Create silent base 130s
sr=48000
total_samples=int(sr*130)
# Use numpy for mixing
import numpy as np

# Helper to load wav as numpy
def load_wav(path):
    with wave.open(str(path), 'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)
        # Convert to stereo float normalized
        arr=arr.reshape(-1,2) / 32768.0
        return arr, w.getframerate()

# Create base silent
base=np.zeros((total_samples,2), dtype=np.float32)

# Narration offsets as before
narration_offsets = {
    "audio-intro.wav": 0.5,
    "audio-problem.wav": 10.5,
    "audio-safety.wav": 30.5,
    "audio-auctorail.wav": 46.5,
    "audio-failure.wav": 78.5,
    "audio-success.wav": 96.5,
    "audio-final.wav": 116.5,
}
# Load and overlay narrations
for af, offset in narration_offsets.items():
    p = OUT / "frames" / af  # wait frames is deleted, now frames are in frames_v2? Actually audio wavs are in frames/ but we deleted frames, they are now in frames_v2? Let's check
    # Actually audio wavs are in video-assets/frames (old) which was deleted, but we have audio-intro.wav etc in frames_v2? No, we moved? Let's check
    pass
