import random
from collections import Counter
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends

from app import config
from app.dados import filtros
from app.dados.estado import obter_base
from app.dados.sinteticos import CLASSE_MOTIVO
from app.dominio import auditoria, reposicao
from app.dominio.calendario import inicio_da_semana
from app.modulos import cargas

router = APIRouter(prefix="/api/quadro", tags=["gestão do quadro"])

DIAS_HISTORICO = 60
MESES_EVOLUCAO = 6
MODULO = "Gestão do Quadro"
CLASSES_SAIDA = ("Voluntário", "Involuntário", "Promoção", "Outra saída")
QUEBRAS_HISTORICO = (("situacao", "Por status"), ("gerente", "Por gerente"), ("servico", "Por serviço"),
                     ("cargo", "Por cargo"), ("sede", "Por sede"), ("turno", "Por turno"))


def _contagem(linhas: list, campo: str) -> list:
    contagem = Counter(l.get(campo) or "(não informado)" for l in linhas)
    return [{"nome": nome, "total": total} for nome, total in contagem.most_common()]


def _ativo_em(c: dict, dia_iso: str) -> bool:
    return c["admissao"] <= dia_iso and (not c["data_desligamento"] or c["data_desligamento"] > dia_iso)


@router.get("/resumo")
def resumo():
    base = obter_base()
    ativos = base.ativos()
    corte_30 = (base.hoje - timedelta(days=30)).isoformat()
    return {
        "ativos": len(ativos),
        "desligados_30d": sum(1 for c in base.desligados() if c["data_desligamento"] >= corte_30),
        "novatos_30d": sum(1 for c in ativos if c["admissao"] >= corte_30),
        "divergencias": len(auditoria.auditar_quadro(ativos)),
        "recebido_em": cargas.servico.recebido_em(MODULO),
    }


@router.get("/auditoria")
def auditar(modo: Literal["quadro", "sistema"] = "quadro", f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    ativos = base.ativos()
    if modo == "quadro":
        divergencias = auditoria.auditar_quadro(ativos)
        titulos = auditoria.CHECAGENS_QUADRO
    else:
        divergencias = auditoria.auditar_sistema(ativos, base.organizacional)
        titulos = auditoria.CHECAGENS_SISTEMA
    filtradas = filtros.aplicar(divergencias, f)
    pessoas = {d["matricula"] for d in filtradas}
    universo = filtros.aplicar(ativos, f)
    return {
        "modo": modo,
        "kpis": {
            "registros_auditados": len(universo),
            "divergencias": len(filtradas),
            "colaboradores_afetados": len(pessoas),
            "percentual_afetado": round(len(pessoas) / len(universo) * 100, 1) if universo else 0,
        },
        "checagens": auditoria.resumo_checagens(filtradas, titulos),
        "clusters": auditoria.clusters(filtradas),
        "divergencias": filtradas,
    }


@router.get("/diagnostico")
def diagnostico():
    linhas = auditoria.diagnostico(obter_base().ativos())
    return {
        "pureza_media": round(sum(l["pureza"] for l in linhas) / len(linhas), 1) if linhas else 0,
        "supervisoes_mistas": sum(1 for l in linhas if l["pureza"] < 100),
        "linhas": linhas,
    }


@router.get("/novatos")
def novatos(dias: int = 45, f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    corte = (base.hoje - timedelta(days=dias)).isoformat()
    linhas = [c for c in filtros.aplicar(base.ativos(), f) if c["admissao"] >= corte]
    rng = random.Random(config.SEMENTE + 3)
    turmas = {}
    for c in sorted(linhas, key=lambda c: c["admissao"]):
        inicio = inicio_da_semana(date.fromisoformat(c["admissao"]))
        chave = (inicio.isoformat(), c["servico"])
        turma = turmas.setdefault(chave, {"inicio": inicio.isoformat(), "servico": c["servico"], "sede": c["sede"], "no_quadro": 0})
        turma["no_quadro"] += 1
    resultado = []
    for numero, turma in enumerate(sorted(turmas.values(), key=lambda t: (t["inicio"], t["servico"])), start=1):
        faltam = rng.choices((0, 0, 0, 1, 2), k=1)[0]
        previstas = turma["no_quadro"] + faltam
        situacao = "Incluída" if not faltam else ("Parcial" if turma["no_quadro"] else "Falta")
        entrega = (date.fromisoformat(turma["inicio"]) + timedelta(days=14)).isoformat()
        resultado.append({**turma, "turma": f"Turma {numero:02d}", "previstas": previstas, "faltam": faltam, "situacao": situacao, "entrega_prevista": entrega})
    resultado.reverse()
    return {
        "total": len(linhas),
        "kpis": {
            "turmas": len(resultado),
            "incluidas": sum(1 for t in resultado if t["situacao"] == "Incluída"),
            "parciais": sum(1 for t in resultado if t["situacao"] == "Parcial"),
            "faltam": sum(t["faltam"] for t in resultado),
        },
        "turmas": resultado,
        "por_supervisor": _contagem(linhas, "supervisor"),
        "linhas": sorted(linhas, key=lambda c: c["admissao"], reverse=True),
    }


@router.get("/vagas")
def vagas(f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    rng = random.Random(config.SEMENTE + 4)
    reposicoes = {l["rq"]: l for l in reposicao.reposicoes(base.quadro, base.rqs, base.hoje) if l["rq"]}
    planilha = []
    for rq in base.rqs:
        if rq["status"] == "Fechada" and rng.random() < 0.7:
            continue
        atual = reposicoes.get(rq["numero"])
        sorteio = rng.random()
        if rq["status"] == "Fechada":
            situacao, informado = "Ciclo concluído", rng.choice(reposicao.STATUS_EM_ANDAMENTO)
        elif rq["motivo"] == "Aumento de quadro":
            situacao, informado = "Fora do escopo", rq["status"]
        elif sorteio < 0.12:
            situacao = "Divergência"
            informado = rng.choice([s for s in reposicao.STATUS_EM_ANDAMENTO if s != rq["status"]] or [rq["status"]])
        else:
            situacao, informado = "Já em dia", rq["status"]
        planilha.append({
            "rq": rq["numero"], "colaborador": atual["nome"] if atual else "Vaga nova", "matricula": atual["matricula"] if atual else "-",
            "no_quadro": rq["status"], "planilha": informado, "situacao": situacao, "motivo": rq["motivo"],
            "servico": rq["servico"], "gerente": rq["gerente"], "coordenador": rq["coordenador"], "supervisor": rq["supervisor"],
            "sede": rq.get("sede"), "diretoria": rq.get("diretoria"),
        })
    for i in range(max(2, len(planilha) // 25)):
        modelo = rng.choice(planilha)
        planilha.append({**modelo, "rq": f"RQ-9{i:03d}", "colaborador": "Não localizado", "matricula": "-", "no_quadro": "-", "situacao": "Não localizada"})
    linhas = filtros.aplicar(planilha, f)
    contagem = Counter(l["situacao"] for l in linhas)
    return {
        "kpis": {
            "linhas_planilha": len(linhas),
            "rqs_quadro": sum(1 for l in linhas if l["no_quadro"] != "-"),
            "divergencias": contagem["Divergência"],
            "nao_localizadas": contagem["Não localizada"],
            "em_dia": contagem["Já em dia"],
            "ciclo_concluido": contagem["Ciclo concluído"],
            "fora_escopo": contagem["Fora do escopo"],
        },
        "linhas": sorted(linhas, key=lambda l: (l["situacao"] == "Já em dia", l["rq"])),
    }


@router.get("/historico")
def historico(data: date | None = None, f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    linhas = filtros.aplicar(base.quadro, f)
    dia = min(data or base.hoje, base.hoje)
    comparado = dia - timedelta(days=30)
    serie = []
    for i in range(DIAS_HISTORICO - 1, -1, -1):
        dia_iso = (base.hoje - timedelta(days=i)).isoformat()
        serie.append({"data": dia_iso, "ativos": sum(1 for c in linhas if _ativo_em(c, dia_iso))})
    no_dia = [c for c in linhas if _ativo_em(c, dia.isoformat())]
    antes = [c for c in linhas if _ativo_em(c, comparado.isoformat())]
    movimentos = [m for m in filtros.aplicar(base.movimentacoes, {"gerente": f["gerente"]}) if comparado.isoformat() < m["data"] <= dia.isoformat()]
    for c in linhas:
        if comparado.isoformat() < c["admissao"] <= dia.isoformat():
            movimentos.append({"data": c["admissao"], "matricula": c["matricula"], "nome": c["nome"], "gerente": c["gerente"], "tipo": "Entrada", "campo": "Admissão", "de": "-", "para": c["supervisor"]})
        if c["data_desligamento"] and comparado.isoformat() < c["data_desligamento"] <= dia.isoformat():
            movimentos.append({"data": c["data_desligamento"], "matricula": c["matricula"], "nome": c["nome"], "gerente": c["gerente"], "tipo": "Saída", "campo": "Desligamento", "de": c["supervisor"], "para": "-"})
    return {
        "data": dia.isoformat(),
        "comparado_com": comparado.isoformat(),
        "serie": serie,
        "total_no_dia": len(no_dia),
        "total_comparado": len(antes),
        "quebras": [
            {
                "titulo": titulo,
                "linhas": [{"nome": n, "total": t, "antes": Counter(c.get(campo) or "(não informado)" for c in antes).get(n, 0)}
                           for n, t in Counter(c.get(campo) or "(não informado)" for c in no_dia).most_common()],
            }
            for campo, titulo in QUEBRAS_HISTORICO
        ],
        "movimentacoes": sorted(movimentos, key=lambda m: m["data"], reverse=True),
    }


@router.get("/desligados")
def desligados(de: date | None = None, ate: date | None = None, f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    inicio, fim = filtros.periodo(de, ate, base.hoje, 30)
    quadro = filtros.aplicar(base.quadro, f)
    linhas = [{**c, "classe": CLASSE_MOTIVO.get(c["motivo_desligamento"], "Outra saída")}
              for c in quadro if c["situacao"] == "Desligado" and filtros.dentro(c["data_desligamento"], inicio, fim)]
    efetivo_inicial = sum(1 for c in quadro if _ativo_em(c, inicio.isoformat()))
    classes = Counter(l["classe"] for l in linhas)
    meses = []
    referencia = base.hoje.replace(day=1)
    for i in range(MESES_EVOLUCAO - 1, -1, -1):
        ano, mes = referencia.year, referencia.month - i
        while mes <= 0:
            ano, mes = ano - 1, mes + 12
        chave = f"{ano:04d}-{mes:02d}"
        do_mes = [c for c in quadro if c["data_desligamento"] and c["data_desligamento"].startswith(chave)]
        meses.append({"mes": chave, **{classe: sum(1 for c in do_mes if CLASSE_MOTIVO.get(c["motivo_desligamento"]) == classe) for classe in CLASSES_SAIDA}})
    por_gerencia = []
    for gerente, total in Counter(l["gerente"] or "Sem gerência" for l in linhas).most_common():
        efetivo = sum(1 for c in quadro if (c["gerente"] or "Sem gerência") == gerente and _ativo_em(c, inicio.isoformat()))
        do_gerente = [l for l in linhas if (l["gerente"] or "Sem gerência") == gerente]
        por_gerencia.append({
            "gerente": gerente, "efetivo": efetivo, "total": total,
            **{classe: sum(1 for l in do_gerente if l["classe"] == classe) for classe in CLASSES_SAIDA},
            "taxa": round(total / efetivo * 100, 1) if efetivo else 0,
        })
    return {
        "de": inicio.isoformat(),
        "ate": fim.isoformat(),
        "kpis": {
            "desligados": len(linhas),
            "efetivo_inicial": efetivo_inicial,
            "turnover": round(len(linhas) / efetivo_inicial * 100, 1) if efetivo_inicial else 0,
            **{classe: classes.get(classe, 0) for classe in CLASSES_SAIDA},
        },
        "classes": list(CLASSES_SAIDA),
        "evolucao": meses,
        "por_sede": _contagem(linhas, "sede"),
        "por_motivo": _contagem(linhas, "motivo_desligamento"),
        "por_gerencia": por_gerencia,
        "linhas": sorted(linhas, key=lambda c: c["data_desligamento"], reverse=True),
    }


@router.get("/organizacao")
def organizacao(f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    contas = {c["login"]: c for c in base.organizacional if c["conta_ativa"]}
    linhas = []
    for c in filtros.aplicar(base.desligados(), f):
        conta = contas.get(c["login"])
        if conta is None:
            continue
        linhas.append({**c, "supervisor_sistema": conta["supervisor"], "dias_desligado": (base.hoje - date.fromisoformat(c["data_desligamento"])).days})
    return {"total": len(linhas), "linhas": sorted(linhas, key=lambda l: -l["dias_desligado"])}
