import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException

from app.modulos.exo.conexao import conexao

ITERACOES = 200_000
DURACAO_SESSAO = timedelta(hours=8)
MAX_TENTATIVAS = 5
JANELA_BLOQUEIO_S = 900
COOKIE_SESSAO = "exo_sessao"

_tentativas = defaultdict(list)
_trava = threading.Lock()


def gerar_hash(senha: str, sal: str | None = None) -> tuple:
    sal = sal or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), ITERACOES)
    return digest.hex(), sal


def conferir_senha(senha: str, senha_hash: str, sal: str) -> bool:
    return hmac.compare_digest(gerar_hash(senha, sal)[0], senha_hash)


def bloqueado(login: str) -> bool:
    limite = time.monotonic() - JANELA_BLOQUEIO_S
    with _trava:
        _tentativas[login] = [t for t in _tentativas[login] if t > limite]
        return len(_tentativas[login]) >= MAX_TENTATIVAS


def registrar_falha(login: str) -> None:
    with _trava:
        _tentativas[login].append(time.monotonic())


def limpar_falhas(login: str) -> None:
    with _trava:
        _tentativas.pop(login, None)


def criar_sessao(con, usuario_id: int) -> str:
    token = secrets.token_urlsafe(32)
    con.execute("DELETE FROM sessoes WHERE expira_em < ?", (datetime.now().isoformat(),))
    con.execute(
        "INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)",
        (token, usuario_id, (datetime.now() + DURACAO_SESSAO).isoformat()),
    )
    return token


def usuario_atual(exo_sessao: str | None = Cookie(default=None)) -> dict:
    if not exo_sessao:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    with conexao() as con:
        linha = con.execute(
            "SELECT u.id, u.login, u.nome, u.papel, u.nivel, u.escopo FROM sessoes s "
            "JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira_em > ?",
            (exo_sessao, datetime.now().isoformat()),
        ).fetchone()
    if linha is None:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    return dict(linha)


def exigir_admin(usuario: dict = Depends(usuario_atual)) -> dict:
    if usuario["papel"] != "admin":
        raise HTTPException(403, "Acesso restrito a administradores.")
    return usuario


def filtro_escopo(usuario: dict, alias: str = "p") -> tuple:
    if usuario["papel"] == "admin" or usuario["nivel"] == "diretoria":
        return "1 = 1", []
    return f"{alias}.{usuario['nivel']} = ?", [usuario["escopo"]]
