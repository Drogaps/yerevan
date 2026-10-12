"""Обновляет в sw.js список картинок для офлайна и версию кэша. Запускать перед каждым деплоем."""
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
imgs = sorted(str(p.relative_to(ROOT)) for p in (ROOT / "img").rglob("*.jpg"))
sw = (ROOT / "sw.js").read_text()
sw = re.sub(r'const VERSION = ".*?";', f'const VERSION = "v{time.strftime("%Y%m%d%H%M")}";', sw)
sw = re.sub(r"const IMGS = \[.*?\];", "const IMGS = " + json.dumps(imgs) + ";", sw, flags=re.S)
shell = ["./", "index.html", "css/app.css", "js/app.js", "js/data.js", "vendor/leaflet.js", "vendor/leaflet.css",
         "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "data/events.json", "data/cinema.json"]
shell += [f"data/{n}" for n in ("food_user.json", "food_top.json", "city_extra.json") if (ROOT / "data" / n).exists()]
sw = re.sub(r"const SHELL = \[.*?\];", "const SHELL = " + json.dumps(shell) + ";", sw, flags=re.S)
(ROOT / "sw.js").write_text(sw)
print(f"{len(imgs)} картинок, {len(shell)} файлов оболочки")
