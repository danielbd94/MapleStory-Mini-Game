# Mini Maple (Frames Edition)

This version uses **frame images** (PNG) instead of GIFs.

## Place this project
Copy the `game` folder into:

`C:\MapleStoryAssets\game`

Your stats file should be here:

`C:\MapleStoryAssets\stats\mobs_stats.json`

## Frames layout (game assets)
Store frames under:

`C:\MapleStoryAssets\game\assets\mobs\<mobId>\<animName>\000.png`

Example for Snail 100100 (GMS 83):
- `game/assets/mobs/100100/stand/000.png`
- `game/assets/mobs/100100/move/000.png` ... `004.png`
- `game/assets/mobs/100100/hit1/000.png`
- `game/assets/mobs/100100/die1/000.png` ... `008.png`

Animation names and frame counts come from `framebooks` in `mobs_stats.json`.

## Run
```powershell
cd C:\MapleStoryAssets
py -m http.server 8000
```

Open:
`http://localhost:8000/game/`

## Controls
- Arrow Left/Right: move
- Space: attack

## Quests
Edit:
`game/data/quests.json`

## Download frames from maplestory.io
Run:
```powershell
py -m pip install requests
py .\tools\download_frames_from_maplestory_io.py
```


## Stats location (important)
This package includes a copy of the stats at `game/assets/data/mobs_stats.json` so you can run the server from either `C:\MapleStoryAssets` or `C:\MapleStoryAssets\game`.
