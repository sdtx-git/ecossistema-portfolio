from datetime import date, timedelta

from fastapi import APIRouter, Depends

from app.dados import filtros
from app.dados.estado import obter_base
from app.dominio import reposicao
from app.modulos import cargas

router = APIRouter(prefix="/api/reposicoes", tags=["controle de reposições"])

MODULO = "Controle de Reposições"


def _linhas(f: dict, dia: date | None = None) -> tuple:
    base = obter_base()
    todas = reposicao.reposicoes(base.quadro, base.rqs, base.hoje)
    if dia and dia < base.hoje:
        todas = reposicao.retrato(todas, dia, base.hoje)
    return filtros.aplicar(todas, f), base


def _regras() -> dict:
    return {
        "carencia_dias": reposicao.SLA_CARENCIA_DIAS,
        "prazo_dias": reposicao.SLA_DIAS_RQ_ABERTO,
        "limite_dias": reposicao.SLA_LIMITE_RQ_DIAS,
        "etapas": list(reposicao.ETAPAS),
        "descricoes": reposicao.DESCRICAO_ETAPAS,
    }


@router.get("/abertura")
def abertura(f: dict = Depends(filtros.filtros_hierarquia)):
    linhas, _ = _linhas(f)
    pendentes = [l for l in linhas if l["status"] == reposicao.ABERTURA]
    return {"regras": _regras(), "recebido_em": cargas.servico.recebido_em(MODULO), "linhas": pendentes}


@router.get("/controle")
def controle(data: date | None = None, f: dict = Depends(filtros.filtros_hierarquia)):
    linhas, base = _linhas(f, data)
    dia = min(data or base.hoje, base.hoje)
    inicio_mes = dia.replace(day=1).isoformat()
    todas, _ = _linhas(f)
    serie = reposicao.evolucao(todas, base.hoje, 30) if dia == base.hoje else []
    return {
        "regras": _regras(),
        "data": dia.isoformat(),
        "hoje": dia == base.hoje,
        "linhas": [l for l in linhas if l["status"] in reposicao.ETAPAS],
        "fechadas_mes": sum(1 for l in linhas if l["data_fechamento"] and inicio_mes <= l["data_fechamento"] <= dia.isoformat()),
        "fechadas": [l for l in linhas if l["data_fechamento"] and inicio_mes <= l["data_fechamento"] <= dia.isoformat()],
        "congeladas": [l for l in linhas if l["status"] == "Congelada"],
        "serie": serie,
    }


@router.get("/quadro-vagas")
def quadro_vagas(f: dict = Depends(filtros.filtros_hierarquia)):
    linhas, _ = _linhas(f)
    return {"regras": _regras(), "linhas": [l for l in linhas if l["status"] in reposicao.ETAPAS]}


@router.get("/evolucao")
def evolucao(dias: int = 90, f: dict = Depends(filtros.filtros_hierarquia)):
    linhas, base = _linhas(f)
    dias = max(14, min(dias, 120))
    inicio = base.hoje - timedelta(days=dias - 1)
    return {
        "serie": reposicao.evolucao(linhas, base.hoje, dias),
        "comparativo": reposicao.comparativo(linhas, inicio, base.hoje, base.hoje),
        "inicio": inicio.isoformat(),
        "fim": base.hoje.isoformat(),
    }
