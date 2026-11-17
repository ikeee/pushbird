# PushBird Breeze

Original procedural instrumental, created for this game on 2026-11-17.
100 BPM, C major, soft plucked melody, warm chords, bass and light percussion.
No downloaded recordings, external music service, paid generation or third-party samples.

`scripts/make_music.py` reuses synthesis primitives copied from the installed
`code-motion-video` skill's `audio_lib.py`; the arrangement is specific to PushBird.
Regenerate with `py -3.13 scripts/make_music.py` (numpy/scipy and ffmpeg required).
The browser plays the local `pushbird-breeze.mp3` quietly and loops it.
