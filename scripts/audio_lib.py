"""Procedural SFX + music primitives (numpy/scipy only). No samples, no network.

    from audio_lib import Mix, nf
    m = Mix(26.0)
    m.kick(6.5); m.clap(7.5); m.hat(7.75); m.bass(6.5, nf(48)); m.pluck(7.0, nf(72))
    m.whoosh(5.5, 1.0, up=True); m.boom(6.5); m.hit(7.65); m.blip(9.5, 520)
    m.bell(21.0, nf(72)); m.err(0.05); m.pad(6.5, [48, 60, 64, 67], 2.0)
    m.save('audio.wav')

Rules of thumb (learned the hard way):
  * Put every sound on a timestamp that equals a visual event in render(t). Use BPM grid: BEAT = 60/bpm.
  * 120 BPM => 0.5 s beat, 2 s bar. Snap scene changes to beats/bars so picture and music lock.
  * Leave a short silence/hum (~0.5 s) before the "drop"; it makes the drop hit harder.
  * Master with tanh soft-clip then loudnorm (-13 LUFS) in mux.sh. Never hard-clip.
"""
import wave
import numpy as np
from scipy import signal

SR = 44100
nf = lambda m: 440 * 2 ** ((m - 69) / 12)          # MIDI note -> Hz


class Mix:
    def __init__(self, dur, seed=11):
        self.dur = dur; self.N = int(SR * dur)
        self.L = np.zeros(self.N); self.R = np.zeros(self.N)
        self.rng = np.random.default_rng(seed)

    # ---- low-level -------------------------------------------------
    def add(self, t, x, g=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0 or i >= self.N: return
        x = x[:self.N - i]
        self.L[i:i + len(x)] += x * g * (1 - max(0, pan))
        self.R[i:i + len(x)] += x * g * (1 + min(0, pan))

    @staticmethod
    def tt(d): return np.arange(int(d * SR)) / SR

    def env(self, d, a=0.003, dec=8.0):
        t = self.tt(d); e = np.exp(-dec * t); n = int(a * SR) + 1; e[:n] *= np.linspace(0, 1, n); return e

    def sine(self, f, d, a=0.003, dec=8.0): return np.sin(2 * np.pi * f * self.tt(d)) * self.env(d, a, dec)

    def sweep(self, f0, f1, d, dec=6.0):
        t = self.tt(d); f = f0 * (f1 / f0) ** (t / d)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * self.env(d, 0.002, dec)

    def noise(self, d): return self.rng.standard_normal(int(d * SR))

    @staticmethod
    def filt(x, kind, fc, order=4):
        return signal.sosfilt(signal.butter(order, fc, btype=kind, fs=SR, output='sos'), x)

    def saw(self, f, d): return 2 * ((self.tt(d) * f) % 1.0) - 1

    # ---- drums -----------------------------------------------------
    def kick(self, t, g=1.0):
        self.add(t, self.sweep(160, 42, 0.32, 9) * g)
        self.add(t, self.filt(self.noise(0.01), 'low', 4000) * 0.2 * g)

    def clap(self, t, g=1.0):
        x = np.zeros(int(0.25 * SR))
        for o in (0, 0.012, 0.024):
            n = self.filt(self.noise(0.2), 'band', [1200, 3800]) * self.env(0.2, 0.001, 22); i = int(o * SR)
            x[i:i + len(n)] += n[:len(x) - i]
        self.add(t, x * 0.5 * g, 0.1)

    def hat(self, t, g=1.0):
        self.add(t, self.filt(self.noise(0.06), 'high', 7000) * self.env(0.06, 0.001, 55) * 0.35 * g, -0.2)

    # ---- pitched ---------------------------------------------------
    def bass(self, t, f, d=0.45, g=1.0):
        x = (np.sin(2 * np.pi * f * self.tt(d)) + 0.35 * self.filt(self.saw(f, d), 'low', 500)) * self.env(d, 0.004, 4.5)
        self.add(t, x * 0.55 * g)

    def pluck(self, t, f, g=1.0, pan=0.0, d=0.5):
        T = self.tt(d)
        x = (np.sin(2 * np.pi * f * T) + 0.4 * np.sin(4 * np.pi * f * T) + 0.2 * np.sin(6 * np.pi * f * T)) * self.env(d, 0.002, 9)
        self.add(t, x * 0.22 * g, pan)

    def pad(self, t, midi_notes, d, g=1.0):
        x = sum(np.sin(2 * np.pi * nf(n) * self.tt(d) + k) for k, n in enumerate(midi_notes)) * 0.07
        x = x * np.minimum(1, self.tt(d) / 0.3) * np.clip((d - self.tt(d)) / 0.3, 0, 1)
        self.add(t, x * g)

    def bell(self, t, f, g=1.0, d=3.0):
        T = self.tt(d); x = np.zeros(len(T))
        for r, a in ((1, 1), (2.76, .5), (5.4, .25), (1.5, .3), (4.1, .18)):
            x += a * np.sin(2 * np.pi * f * r * T) * np.exp(-T * (1.6 + r * 0.9))
        self.add(t, x * 0.2 * g, 0.1)

    # ---- effects ---------------------------------------------------
    def whoosh(self, t, d, up=True, g=1.0):
        n = self.noise(d); out = np.zeros_like(n); nb = 24; seg = len(n) // nb
        for k in range(nb):
            fc = 400 + 7000 * ((k / nb) if up else (1 - k / nb)) ** 2
            y = self.filt(n[k * seg:(k + 1) * seg + 2000], 'band', [fc * 0.6, fc * 1.5], 2)[:seg]
            out[k * seg:k * seg + len(y)] = y
        p = np.linspace(0, 1, len(out))
        e = p ** 1.6 if up else (1 - p) ** 1.5
        self.add(t, out * e * 2.2 * g)

    def boom(self, t, g=1.0, d=1.2):
        self.add(t, self.sweep(120, 38, d, 3.2) * g)
        self.add(t, self.filt(self.noise(0.5), 'low', 2500) * self.env(0.5, 0.001, 8) * 0.5 * g)

    def hit(self, t, g=1.0):                        # headline slam / stamp
        self.add(t, self.sweep(220, 55, 0.35, 10) * 0.9 * g)
        self.add(t, self.filt(self.noise(0.08), 'band', [800, 5000]) * self.env(0.08, 0.001, 40) * 0.35 * g)

    def blip(self, t, f, g=1.0):                    # card pop-in
        self.add(t, self.sweep(f, f * 2, 0.12, 14) * 0.5 * g)
        self.add(t, self.filt(self.noise(0.03), 'high', 3000) * self.env(0.03, 0.001, 70) * 0.25 * g)

    def err(self, t, f=740, g=1.0):                 # error-dialog ding
        self.add(t, (self.sine(f, 0.14, 0.001, 14) + 0.5 * self.sine(f * 2, 0.14, 0.001, 20)) * 0.30 * g, 0.2)
        self.add(t + 0.11, (self.sine(f * 0.79, 0.2, 0.001, 11) + 0.5 * self.sine(f * 1.58, 0.2, 0.001, 16)) * 0.30 * g, 0.2)

    def click(self, t, g=1.0):
        self.add(t, self.filt(self.noise(0.04), 'band', [1000, 6000]) * self.env(0.04, .001, 60) * 0.6 * g)

    # ---- output ----------------------------------------------------
    def save(self, path='audio.wav'):
        fade = np.ones(self.N); fi = int(0.01 * SR); fade[:fi] = np.linspace(0, 1, fi)
        fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo)
        out = np.tanh(np.stack([self.L, self.R]) * fade * 1.1)
        out = out / max(1e-9, np.abs(out).max()) * 0.89
        pcm = (out.T * 32767).astype('<i2')
        with wave.open(path, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        return path
