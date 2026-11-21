from collections import Counter

from fastapi import APIRouter

from app.dados.estado import obter_base

router = APIRouter(prefix="/api/base", tags=["base compartilhada"])


@router.get("/hierarquia")
def obter_hierarquia():
    base = obter_base()
    dados = base.hierarquia()
    ativos = Counter(c["supervisor"] for c in base.ativos())
    dados["supervisores"] = [{**s, "ativos": ativos.get(s["nome"], 0)} for s in dados["supervisores"]]
    return {**dados, "versao": base.versao, "atualizado_em": base.atualizado_em.isoformat(timespec="seconds")}
