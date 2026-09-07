#!/usr/bin/env python3
import wave, pathlib, struct, math, numpy as np, os
ROOT = pathlib.Path("/home/user/auctorail")
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
OUT = ROOT / "video-assets"
TMP = OUT / "frames_v2_tmp"
sr=48000
total_samples=int(sr*130)
base=np.zeros((total_samples,2), dtype=np.float32)

def load_wav(path, target_sr=48000):
    # Use ffmpeg to decode if needed? But our wavs are already 48k stereo pcm_s16le, so we can load via wave
    with wave.open(str(path), 'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)/32768.0
        arr=arr.reshape(-1,2)
        # If mono, duplicate? But our wavs are stereo
        return arr

def overlay(base, wav_arr, offset_sec, volume=1.0):
    offset=int(offset_sec*sr)
    end=offset+len(wav_arr)
    if end>len(base):
        wav_arr=wav_arr[:len(base)-offset]
        end=len(base)
    base[offset:end] += wav_arr*volume
    # Clamp
    np.clip(base, -1.0, 1.0, out=base)

# Load narrations (converted wavs)
narration_offsets = {
    "audio-intro.wav": 0.5,
    "audio-problem.wav": 10.5,
    "audio-safety.wav": 30.5,
    "audio-auctorail.wav": 46.5,
    "audio-failure.wav": 78.5,
    "audio-success.wav": 96.5,
    "audio-final.wav": 116.5,
}
print("Loading narrations...")
for af, offset in narration_offsets.items():
    p = TMP / af
    if not p.exists():
        p = OUT / f"{af.replace('.wav','.mp3')}"  # fallback
        # Convert via ffmpeg if needed
        import subprocess
        tmp_wav = TMP / af
        subprocess.run([FF, "-y", "-hide_banner","-loglevel","error","-i", str(p if p.exists() else OUT / af.replace('.wav','.mp3')), "-ar","48000","-ac","2","-c:a","pcm_s16le", str(tmp_wav)], check=True)
        p=tmp_wav
    arr,_=None,None
    # Actually load_wav expects wav, so ensure p is wav
    if p.suffix==".mp3":
        # convert
        tmp2=TMP / (p.stem+".wav")
        import subprocess
        subprocess.run([FF,"-y","-hide_banner","-loglevel","error","-i",str(p),"-ar","48000","-ac","2","-c:a","pcm_s16le",str(tmp2)], check=True)
        p=tmp2
    # Now load
    with wave.open(str(p),'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)/32768.0
        arr=arr.reshape(-1,2)
    print(f"  {af} at {offset}s len {len(arr)/sr:.2f}s")
    overlay(base, arr, offset, volume=1.0)

# SFX
# Typing at 0s (10s file, but only first 2.5s has content, so we overlay at 0)
sfx_typing = TMP / "sfx_typing.wav"
if sfx_typing.exists():
    with wave.open(str(sfx_typing),'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)/32768.0
        arr=arr.reshape(-1,2)
    print(f"  sfx_typing at 0s")
    overlay(base, arr, 0, volume=0.35)

# Clicks at each segment boundary (12 clicks)
click_offsets = [10, 16, 22, 30, 46, 54, 61, 70, 78, 87, 96, 116]
sfx_click = TMP / "sfx_click.wav"
if sfx_click.exists():
    with wave.open(str(sfx_click),'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)/32768.0
        arr=arr.reshape(-1,2)
    for off in click_offsets:
        overlay(base, arr, off, volume=0.45)
        print(f"  click at {off}s")

# Whoosh at major transitions
whoosh_offsets = [10, 30, 46, 78, 96, 116]
sfx_whoosh = TMP / "sfx_whoosh.wav"
if sfx_whoosh.exists():
    with wave.open(str(sfx_whoosh),'rb') as w:
        n=w.getnframes()
        data=w.readframes(n)
        arr=np.frombuffer(data, dtype=np.int16).astype(np.float32)/32768.0
        arr=arr.reshape(-1,2)
    for off in whoosh_offsets:
        # Whoosh slightly before transition, at off -0.2
        overlay(base, arr, max(0, off-0.2), volume=0.25)
        print(f"  whoosh at {off-0.2}s")

# Low drone background (55Hz + 110Hz) at low volume for whole duration
print("  adding drone...")
t=np.arange(total_samples)/sr
drone = 0.03*np.sin(2*np.pi*55*t)[:,None] + 0.015*np.sin(2*np.pi*110*t)[:,None]
# Fade in/out
fade=np.ones(total_samples)
fade[:int(sr*1.0)] = np.linspace(0,1,int(sr*1.0))
fade[-int(sr*2.0):] = np.linspace(1,0,int(sr*2.0))
drone *= fade[:,None]
base += drone*0.6  # low
np.clip(base, -1.0, 1.0, out=base)

# Normalize slightly to prevent clipping (peak)
peak=np.max(np.abs(base))
if peak>0.95:
    base *= 0.95/peak
    print(f"  normalized peak {peak:.3f} -> 0.95")

# Write final wav
out_path = TMP / "final_mixed.wav"
with wave.open(str(out_path),'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    # Convert float to int16
    data=(base*32767).astype(np.int16)
    w.writeframes(data.tobytes())
print(f"Final mixed wav: {out_path} {out_path.stat().st_size/1024/1024:.2f} MB duration {len(base)/sr:.2f}s")

# Convert to aac via ffmpeg
import subprocess
aac_path = TMP / "final_mixed.aac"
subprocess.run([FF, "-y", "-hide_banner","-loglevel","error","-i", str(out_path), "-c:a","aac","-b:a","128k", str(aac_path)], check=True)
print(f"AAC: {aac_path} {aac_path.stat().st_size/1024:.1f} KB")
