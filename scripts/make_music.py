"""Original gentle game loop. Reuses code-motion-video skill synth primitives.
Run: py -3.13 scripts/make_music.py (numpy, scipy, ffmpeg required).
No downloaded samples, accounts, or API calls.
"""
from pathlib import Path
import subprocess
import numpy as np
from audio_lib import Mix, SR, nf

ROOT = Path(__file__).resolve().parents[1]
BEAT = .6  # 100 BPM, musical pulse is independent of the exercise rhythm.
DURATION = 16 * 4 * BEAT
mix = Mix(DURATION * 3, seed=17)
chords = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62])]
melodies = [
    [76, 79, 81, 79, 76, 74, 72, 74],
    [72, 76, 79, 76, 74, 72, 69, 72],
    [77, 81, 79, 77, 76, 72, 74, 76],
    [74, 79, 77, 74, 71, 74, 76, 79],
]
for cycle in range(3):
    for bar in range(16):
        time = cycle * DURATION + bar * 4 * BEAT
        bass, notes = chords[bar % 4]
        mix.pad(time, notes, 4 * BEAT + .2, .32)
        for beat in range(4):
            at = time + beat * BEAT
            mix.pluck(at + .02, nf(notes[beat % 3]), .45, -.16, d=.4)
            if beat in (0, 2):
                mix.bass(at, nf(bass), d=.45, g=.35)
                mix.kick(at, .11)
            mix.hat(at + BEAT / 2, .15)
            if beat in (1, 3): mix.click(at, .06)
        for half, note in enumerate(melodies[bar % 4]):
            if half == 7 and bar % 2: continue
            mix.pluck(time + half * BEAT / 2 + .05, nf(note), .62, .14, d=.48)

# Keep a middle repetition so pad tails continue naturally across the loop seam.
start, size = round(DURATION * SR), round(DURATION * SR)
samples = np.stack([mix.L[start:start+size], mix.R[start:start+size]], axis=1)
samples = np.tanh(samples * .9)
samples *= .65 / max(1e-9, np.abs(samples).max())
wav = ROOT / 'scripts' / 'music-master.wav'
import wave
with wave.open(str(wav), 'wb') as stream:
    stream.setnchannels(2); stream.setsampwidth(2); stream.setframerate(SR)
    stream.writeframes((samples * 32767).astype('<i2').tobytes())
destination = ROOT / 'public' / 'audio' / 'pushbird-breeze.mp3'
destination.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                '-codec:a', 'libmp3lame', '-b:a', '160k', str(destination)], check=True)
print(f'{destination}: {DURATION:.1f}s, peak={np.abs(samples).max():.3f}, RMS={np.sqrt(np.mean(samples**2)):.3f}')
