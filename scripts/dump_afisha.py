"""Выгружает сырые посты афиши из базы tg-armenia (только чтение) в data/afisha_raw.jsonl.

Из этого файла потом собирается data/events.json (разбор по смыслу делает Claude).
Запуск: python3 scripts/dump_afisha.py [--days 30]
"""
import argparse
import json
import sqlite3
from pathlib import Path

DB = Path.home() / "work/erevan/tg-armenia/data/tg-intel.db"
OUT = Path(__file__).resolve().parents[1] / "data/afisha_raw.jsonl"
AFISHA = ("ErevanRus", "guideyerevan", "yerevanafisha")
KEYWORDS = ("концерт", "фестивал", "выставк", "афиш", "площад", "ярмарк", "спектакл", "кинопоказ",
            "лекци", "маркет", "вечеринк", "джаз", "открытие", "праздник", "шоу", "экскурси")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=30)
    a = p.parse_args()
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        f"""SELECT channel, msg_id, date, text, link FROM messages
            WHERE date >= datetime('now', ?) AND length(text) > 60
              AND (channel IN ({','.join('?' * len(AFISHA))})
                   OR (channel = 'erevan12' AND ({' OR '.join(['lower(text) LIKE ?'] * len(KEYWORDS))})))
            ORDER BY date""",
        (f"-{a.days} days", *AFISHA, *[f"%{k}%" for k in KEYWORDS]),
    ).fetchall()
    with OUT.open("w") as f:
        for r in rows:
            link = r["link"] or f"https://t.me/{r['channel']}/{r['msg_id']}"
            f.write(json.dumps({"channel": r["channel"], "date": r["date"], "link": link, "text": r["text"][:2500]},
                               ensure_ascii=False) + "\n")
    print(f"{len(rows)} постов -> {OUT}")


if __name__ == "__main__":
    main()
