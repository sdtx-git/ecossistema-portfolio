from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends

from app.dados import filtros
from app.dados.estado import obter_base
from app.dominio import jornada
from app.modulos import cargas

router = APIRouter(prefix="/api/relatorios", tags=["relatórios operacionais"])

MODULO = "Relatórios Operacionais"
Tipo = Literal["interjornada", "excedentes", "subjornada"]


def _periodo(de: date | None, ate: date | None, base) -> tuple:
    ontem = base.hoje - timedelta(days=1)
    return filtros.periodo(de, ate, ontem, (ate or ontem).day - 1)


def _registros(inicio: date, fim: date, f: dict) -> list:
    base = obter_base()
    margem = (inicio - timedelta(days=1)).isoformat()
    registros = [r for r in base.ponto if margem <= r["data"] <= fim.isoformat()]
    return filtros.aplicar(jornada.enriquecer(registros, base.quadro), f)


@router.get("/periodo")
def periodo_disponivel():
    base = obter_base()
    datas = [r["data"] for r in base.ponto]
    return {"de": min(datas) if datas else None, "ate": max(datas) if datas else None,
            "recebido_em": cargas.servico.recebido_em(MODULO)}


@router.get("/colaborador/{matricula}")
def colaborador(matricula: str, tipo: Tipo, de: date | None = None, ate: date | None = None):
    base = obter_base()
    inicio, fim = _periodo(de, ate, base)
    registros = [r for r in base.ponto if r["matricula"] == matricula and (inicio - timedelta(days=1)).isoformat() <= r["data"] <= fim.isoformat()]
    enriquecidos = jornada.enriquecer(registros, base.quadro)
    ocorrencias = [o for o in jornada.CALCULOS[tipo](enriquecidos) if filtros.dentro(o["data"], inicio, fim)]
    pessoa = next((c for c in base.quadro if c["matricula"] == matricula), None)
    return {
        "pessoa": pessoa,
        "periodo_dias": (fim - inicio).days + 1,
        "registros": sorted((r for r in enriquecidos if filtros.dentro(r["data"], inicio, fim)), key=lambda r: r["data"], reverse=True),
        "ocorrencias": {o["data"]: o["minutos"] for o in ocorrencias},
    }


@router.get("/contagens")
def contagens(de: date | None = None, ate: date | None = None, f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    inicio, fim = _periodo(de, ate, base)
    registros = _registros(inicio, fim, f)
    return {
        tipo: sum(1 for o in calculo(registros) if filtros.dentro(o["data"], inicio, fim))
        for tipo, calculo in jornada.CALCULOS.items()
    }


@router.get("/{tipo}")
def relatorio(tipo: Tipo, de: date | None = None, ate: date | None = None, nivel: str = "coordenador",
              f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    inicio, fim = _periodo(de, ate, base)
    registros = _registros(inicio, fim, f)
    ocorrencias = [o for o in jornada.CALCULOS[tipo](registros) if filtros.dentro(o["data"], inicio, fim)]
    no_periodo = [r for r in registros if filtros.dentro(r["data"], inicio, fim)]
    trabalharam = {r["matricula"] for r in no_periodo}
    resultado = jornada.resumir(ocorrencias, nivel, len(trabalharam))
    contexto = {
        "registros_analisados": len(no_periodo),
        "operadores_analisados": len(trabalharam),
        "servicos_total": len({r["servico"] for r in no_periodo}),
    }
    if tipo == "interjornada":
        contexto.update(jornada.contexto_interjornada(registros, ocorrencias, inicio.isoformat(), fim.isoformat()))
    return {
        "tipo": tipo,
        "de": inicio.isoformat(),
        "ate": fim.isoformat(),
        "nivel": nivel if nivel in jornada.NIVEIS else "coordenador",
        "tolerancia_min": jornada.TOLERANCIA_MIN,
        "descanso_minimo_min": jornada.DESCANSO_MINIMO_MIN,
        "contexto": contexto,
        **resultado,
    }
