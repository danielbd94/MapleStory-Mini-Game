# Download mob frames from maplestory.io into the game's assets folder.
# Output:
#   C:\MapleStoryAssets\game\assets\mobs\<mobId>\<animName>\000.png ...

import json
import time
from pathlib import Path
from typing import Any, Dict, List

import requests

REGION = "GMS"
VERSION = "83"  # change as needed

BASE = Path(r"C:\MapleStoryAssets")
OUT_DIR = BASE / "game" / "assets" / "mobs"
STATS_JSON = BASE / "stats" / "mobs_stats.json"

MOB_LIST_URL = f"https://maplestory.io/api/{REGION}/{VERSION}/mob"
MOB_DETAIL_URL = lambda mob_id: f"https://maplestory.io/api/{REGION}/{VERSION}/mob/{mob_id}"
MOB_RENDER_URL = lambda mob_id, anim, frame: f"https://maplestory.io/api/{REGION}/{VERSION}/mob/{mob_id}/render/{anim}/{frame}"

TIMEOUT = 30
SLEEP = 0.02

def safe_get_json(s: requests.Session, url: str, retries: int = 3) -> Any:
    last = None
    for _ in range(retries):
        try:
            r = s.get(url, timeout=TIMEOUT)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = e
            time.sleep(0.4)
    raise RuntimeError(f"GET JSON failed: {url}\n{last}")

def normalize_mob_list(data: Any) -> List[int]:
    if isinstance(data, list):
        if not data:
            return []
        if isinstance(data[0], int):
            return [int(x) for x in data]
        if isinstance(data[0], dict) and "id" in data[0]:
            return [int(x["id"]) for x in data if "id" in x]
    if isinstance(data, dict):
        for k in ["data", "results", "items", "mobs"]:
            if k in data:
                return normalize_mob_list(data[k])
    raise ValueError(f"Unrecognized mob list schema: {type(data)}")

def ext_from_content_type(ct: str) -> str:
    ct = (ct or "").split(";")[0].strip().lower()
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    if ct == "image/gif":
        return ".gif"
    return ".bin"

def write_frame(s: requests.Session, url: str, out_dir: Path, frame_index: int) -> bool:
    # We try to save as 000.png by default, but will respect server content-type.
    frame_name = f"{frame_index:03d}"
    out_base = out_dir / frame_name

    # Skip if any extension exists
    for ext in [".png", ".webp", ".gif"]:
        p = out_base.with_suffix(ext)
        if p.exists() and p.stat().st_size > 0:
            return True

    r = s.get(url, timeout=60)
    if not r.ok:
        return False

    ext = ext_from_content_type(r.headers.get("Content-Type", ""))
    out_path = out_base.with_suffix(ext)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(r.content)
    return True

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stats_map: Dict[int, Dict[str, Any]] = {}
    if STATS_JSON.exists():
        stats_list = json.loads(STATS_JSON.read_text(encoding="utf-8"))
        stats_map = {int(x["id"]): x for x in stats_list if "id" in x}

    with requests.Session() as s:
        mob_list_raw = safe_get_json(s, MOB_LIST_URL)
        mob_ids = normalize_mob_list(mob_list_raw)
        print(f"Mobs: {len(mob_ids)}")

        downloaded = 0
        failed = 0

        for mid in mob_ids:
            st = stats_map.get(int(mid))
            if st and isinstance(st.get("framebooks"), dict):
                framebooks = st["framebooks"]
            else:
                detail = safe_get_json(s, MOB_DETAIL_URL(mid))
                framebooks = detail.get("framebooks") or {}

            if not framebooks:
                continue

            for anim, count in framebooks.items():
                try:
                    n = int(count)
                except Exception:
                    continue
                anim_dir = OUT_DIR / str(mid) / str(anim)
                for i in range(n):
                    ok = write_frame(s, MOB_RENDER_URL(mid, anim, i), anim_dir, i)
                    if ok:
                        downloaded += 1
                    else:
                        failed += 1
                    time.sleep(SLEEP)

            if int(mid) % 100 == 0:
                print(f"Progress mid={mid} downloaded={downloaded} failed={failed}")

        print(f"Done. downloaded={downloaded}, failed={failed}")
        print(f"Output: {OUT_DIR}")

if __name__ == "__main__":
    main()
