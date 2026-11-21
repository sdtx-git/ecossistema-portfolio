import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_FRONTEND = RAIZ / "frontend"
PASTA_VAR = Path(os.getenv("ECOSSISTEMA_VAR", RAIZ / "var"))

HOST = os.getenv("ECOSSISTEMA_HOST", "127.0.0.1")
PORTA = int(os.getenv("ECOSSISTEMA_PORTA", "8000"))
SEMENTE = int(os.getenv("ECOSSISTEMA_SEMENTE", "42"))
INTERVALO_CARGAS_S = int(os.getenv("ECOSSISTEMA_INTERVALO_CARGAS", "60"))
CARGAS_ATIVAS = os.getenv("ECOSSISTEMA_CARGAS_ATIVAS", "1") == "1"
SENHA_DEMO = os.getenv("ECOSSISTEMA_SENHA_DEMO", "demo123")
DIAS_PONTO = 30
