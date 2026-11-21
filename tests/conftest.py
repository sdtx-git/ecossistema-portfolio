import os
import random
import sys
import tempfile
from datetime import date
from pathlib import Path

os.environ.setdefault("ECOSSISTEMA_VAR", tempfile.mkdtemp(prefix="ecossistema_testes_"))
os.environ.setdefault("ECOSSISTEMA_CARGAS_ATIVAS", "0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.dados import sinteticos

HOJE = date(2026, 6, 15)


@pytest.fixture(scope="session")
def dados():
    return sinteticos.gerar(random.Random(42), HOJE, 30)
