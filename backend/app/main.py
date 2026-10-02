import os
import time
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Literal

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .achievements import ACHIEVEMENTS, XP_ACHIEVEMENT, XP_FIRST_PASS, XP_PER_STAR, earned, level_for
from .levels import LEVELS
from .workloads import WORKLOADS

DSN = os.environ.get("DATABASE_URL", "postgresql://infrasim:infrasim@db:5432/infrasim")

SCHEMA = """
CREATE TABLE IF NOT EXISTS progress (
    player_id  TEXT NOT NULL,
    level_idx  INT  NOT NULL,
    stars      INT  NOT NULL,
    PRIMARY KEY (player_id, level_idx)
);
CREATE TABLE IF NOT EXISTS survival (
    id         SERIAL PRIMARY KEY,
    player_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    secs       INT  NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survival_secs_idx ON survival (secs DESC);
CREATE TABLE IF NOT EXISTS player_stats (
    player_id  TEXT PRIMARY KEY,
    xp         INT  NOT NULL DEFAULT 0,
    streak     INT  NOT NULL DEFAULT 0,
    last_day   DATE,
    max_rps    REAL NOT NULL DEFAULT 0,
    best_p95   REAL
);
CREATE TABLE IF NOT EXISTS achievements (
    player_id   TEXT NOT NULL,
    code        TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, code)
);
"""


def connect():
    return psycopg.connect(DSN)


@asynccontextmanager
async def lifespan(_: FastAPI):
    for attempt in range(30):  # ждём, пока поднимется Postgres
        try:
            with connect() as conn:
                conn.execute(SCHEMA)
            break
        except psycopg.OperationalError:
            if attempt == 29:
                raise
            time.sleep(1)
    yield


app = FastAPI(title="InfraSim API", lifespan=lifespan)


class ProgressIn(BaseModel):
    player_id: str = Field(min_length=8, max_length=64)
    level_idx: int = Field(ge=0)
    stars: int = Field(ge=0, le=3)


class SurvivalIn(BaseModel):
    player_id: str = Field(min_length=8, max_length=64)
    name: str = Field(min_length=1, max_length=24)
    secs: int = Field(ge=0, le=100_000)


class ResultIn(BaseModel):
    """Итог одного прохождения: уровня кампании или забега в режиме «Выживание»."""
    player_id: str = Field(min_length=8, max_length=64)
    mode: Literal["level", "survival"]
    level_idx: int | None = Field(default=None, ge=0)
    name: str = Field(default="Аноним", max_length=24)
    passed: bool = False
    stars: int = Field(default=0, ge=0, le=3)
    avg_cost: float = Field(default=0, ge=0, le=1e6)
    secs: int = Field(default=0, ge=0, le=100_000)
    p95: float = Field(default=0, ge=0, le=1e5)
    max_rps: float = Field(default=0, ge=0, le=1e7)
    hot_best: float = Field(default=0, ge=0, le=1e5)
    over_best: float = Field(default=0, ge=0, le=1e5)


@app.get("/api/levels")
def levels():
    return LEVELS


@app.get("/api/workloads")
def workloads():
    return WORKLOADS


@app.get("/api/progress")
def get_progress(player_id: str = Query(min_length=8, max_length=64)):
    with connect() as conn:
        rows = conn.execute("SELECT level_idx, stars FROM progress WHERE player_id = %s", (player_id,)).fetchall()
    return {str(i): s for i, s in rows}


@app.post("/api/progress")
def save_progress(p: ProgressIn):
    if p.level_idx >= len(LEVELS):
        raise HTTPException(404, "no such level")
    with connect() as conn:
        conn.execute(
            """INSERT INTO progress (player_id, level_idx, stars) VALUES (%s, %s, %s)
               ON CONFLICT (player_id, level_idx) DO UPDATE SET stars = GREATEST(progress.stars, EXCLUDED.stars)""",
            (p.player_id, p.level_idx, p.stars),
        )
    return {"ok": True}


@app.post("/api/survival")
def save_survival(s: SurvivalIn):
    name = s.name.strip()
    if not name:
        raise HTTPException(422, "empty name")
    with connect() as conn:
        conn.execute("INSERT INTO survival (player_id, name, secs) VALUES (%s, %s, %s)", (s.player_id, name, s.secs))
    return {"ok": True}


@app.get("/api/leaderboard")
def leaderboard():
    with connect() as conn:
        rows = conn.execute(
            """SELECT name, MAX(secs) AS best FROM survival GROUP BY player_id, name
               ORDER BY best DESC LIMIT 10"""
        ).fetchall()
    return [{"name": n, "secs": s} for n, s in rows]


@app.post("/api/result")
def save_result(r: ResultIn):
    """Сохраняет прогресс, начисляет XP, обновляет серию дней и выдаёт ачивки."""
    if r.mode == "level" and (r.level_idx is None or r.level_idx >= len(LEVELS)):
        raise HTTPException(404, "no such level")
    gained = 0
    today = date.today()
    with connect() as conn:
        if r.mode == "level" and r.passed:
            row = conn.execute("SELECT stars FROM progress WHERE player_id = %s AND level_idx = %s",
                               (r.player_id, r.level_idx)).fetchone()
            stars = max(r.stars, 1)
            gained += (0 if row else XP_FIRST_PASS) + XP_PER_STAR * max(0, stars - (row[0] if row else 0))
            conn.execute(
                """INSERT INTO progress (player_id, level_idx, stars) VALUES (%s, %s, %s)
                   ON CONFLICT (player_id, level_idx) DO UPDATE SET stars = GREATEST(progress.stars, EXCLUDED.stars)""",
                (r.player_id, r.level_idx, stars),
            )
        elif r.mode == "survival":
            gained += r.secs // 5
            conn.execute("INSERT INTO survival (player_id, name, secs) VALUES (%s, %s, %s)",
                         (r.player_id, r.name.strip() or "Аноним", r.secs))

        conn.execute("INSERT INTO player_stats (player_id) VALUES (%s) ON CONFLICT DO NOTHING", (r.player_id,))
        xp, streak, last_day, max_rps, best_p95 = conn.execute(
            "SELECT xp, streak, last_day, max_rps, best_p95 FROM player_stats WHERE player_id = %s FOR UPDATE",
            (r.player_id,)).fetchone()
        if last_day != today:
            streak = streak + 1 if last_day == today - timedelta(days=1) else 1
        max_rps = max(max_rps, r.max_rps)
        if r.mode == "level" and r.passed and r.p95 > 0:
            best_p95 = r.p95 if best_p95 is None else min(best_p95, r.p95)

        have = {c for (c,) in conn.execute("SELECT code FROM achievements WHERE player_id = %s", (r.player_id,))}
        fresh = [a for a in ACHIEVEMENTS if a["code"] in earned(r.model_dump(), streak) - have]
        for a in fresh:
            conn.execute("INSERT INTO achievements (player_id, code) VALUES (%s, %s)", (r.player_id, a["code"]))
        gained += XP_ACHIEVEMENT * len(fresh)
        xp += gained
        conn.execute("UPDATE player_stats SET xp = %s, streak = %s, last_day = %s, max_rps = %s, best_p95 = %s WHERE player_id = %s",
                     (xp, streak, today, max_rps, best_p95, r.player_id))
    return {"xp_gained": gained, "xp": xp, "achievements": fresh, **level_for(xp)}


@app.get("/api/stats")
def get_stats(player_id: str = Query(min_length=8, max_length=64)):
    with connect() as conn:
        row = conn.execute("SELECT xp, streak, last_day, max_rps, best_p95 FROM player_stats WHERE player_id = %s",
                           (player_id,)).fetchone()
        xp, streak, last_day, max_rps, best_p95 = row or (0, 0, None, 0, None)
        if last_day is not None and last_day < date.today() - timedelta(days=1):
            streak = 0  # серия прервалась
        done, stars = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(stars), 0) FROM progress WHERE player_id = %s AND stars > 0",
            (player_id,)).fetchone()
        (best_survival,) = conn.execute("SELECT MAX(secs) FROM survival WHERE player_id = %s", (player_id,)).fetchone()
        have = {c for (c,) in conn.execute("SELECT code FROM achievements WHERE player_id = %s", (player_id,))}
    return {
        "xp": xp, **level_for(xp), "streak": streak, "max_rps": max_rps, "best_p95": best_p95,
        "best_survival": best_survival, "levels_done": done, "stars": int(stars),
        "levels_total": len(LEVELS), "stars_total": 3 * len(LEVELS),
        "achievements": [{**a, "unlocked": a["code"] in have} for a in ACHIEVEMENTS],
    }


@app.delete("/api/player")
def reset_player(player_id: str = Query(min_length=8, max_length=64)):
    with connect() as conn:
        for table in ("progress", "survival", "player_stats", "achievements"):
            conn.execute(f"DELETE FROM {table} WHERE player_id = %s", (player_id,))
    return {"ok": True}
