import sqlite3
from contextlib import contextmanager
from datetime import datetime

from app import config


def arquivo():
    return config.PASTA_VAR / "exo.db"


@contextmanager
def conexao():
    con = sqlite3.connect(arquivo())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def linhas(cursor) -> list:
    return [dict(r) for r in cursor.fetchall()]
