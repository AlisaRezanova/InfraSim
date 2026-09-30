import os
import time
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .levels import LEVELS

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


@app.get("/api/levels")
def levels():
    return LEVELS


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
