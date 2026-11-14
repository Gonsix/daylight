# README feature demos

These demos use the product's React components and CSS with an isolated, in-memory
sample store. They do not connect to Obsidian, read a vault, or write notes. The
Obsidian modal shell and notices are browser-only stand-ins. Work transitions use
`recordWorkStatus` and `pauseWork` from the product code.

All recordings use English. The clock is simulated and explicitly labeled when
advanced. The task demo contains two sessions (25 + 20 minutes), separated by a
10-minute break, and shows a second task running in parallel.

## Reproduce

From the repository root, with dependencies installed:

```sh
node docs/demos/build.mjs
python3 -m http.server 8137 --bind 127.0.0.1 --directory /private/tmp/daylight-demo
```

Open a dedicated Orca browser tab for `http://127.0.0.1:8137/?scene=events` and use
its page ID below. Orca and ffmpeg must be installed. Run each scene sequentially:

```sh
python3 docs/demos/record.py PAGE_ID events
python3 docs/demos/record.py PAGE_ID tasks
python3 docs/demos/record.py PAGE_ID projects
```

`record.py` captures actual preview frames through `orca screenshot` while
`scenes.js` operates the forms and card controls. The drag scene dispatches HTML
DragEvents to the real card and column handlers. This also works when the embedded
browser's native recording does not capture compositor updates. MP4s, timestamped
frames, and final state snapshots are written under `/private/tmp` by default.
The script verifies event creation, task completion/session duration, and task
counts. The project scene also verifies the filtered card counts.

Generate compact looping GIFs for GitHub README embedding:

```sh
ffmpeg -i /private/tmp/daylight-events.mp4 -filter_complex \
  'fps=10,scale=1000:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
  -loop 0 /private/tmp/daylight-events.gif
```

Repeat for `tasks` and `projects`. Inspect the videos before copying the MP4/GIF
pairs into `docs/videos/`. Both READMEs reference the same English media.
