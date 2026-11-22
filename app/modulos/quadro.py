import calendar
import random
import threading
from collections import Counter
from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app import config
from app.dados import filtros
from app.dados.estado import obter_base
from app.dados.sinteticos import CLASSE_MOTIVO
from app.dominio import auditoria, reposicao
from app.dominio.calendario import inicio_da_semana
from app.modulos import cargas

router = APIRouter(prefix="/api/quadro", tags=["gestão do quadro"])

DIAS_HISTORICO = 60
DIAS_TREINAMENTO = 14
MESES_EVOLUCAO = 4
MODULO = "Gestão do Quadro"
CLASSES_SAIDA = ("Voluntário", "Involuntário", "Promoção", "Outra saída")
QUEBRAS_HISTORICO = (("situacao", "Por status"), ("gerente", "Por gerente"), ("servico", "Por serviço"),
                     ("cargo", "Por cargo"), ("sede", "Por sede"), ("turno", "Por turno"))
STATUS_QUADRO = ("Ativo", "Afastado", "Férias", "Treinamento")
SERVICOS_PGT = ("Serviço 7", "Serviço 8")
SERVICOS_AGENDAMENTO = ("Serviço 1", "Serviço 2", "Serviço 3", "Serviço 4")
SITUACOES_RELATORIO = ("Desligado", "Ativo", "Sem registro")
STATUS_PROCESSO = {
    "Fechada": "Admitido",
    "Em andamento remuneração": "Aguardando cadastro",
    "Em andamento recrutamento": "Em recrutamento",
    "Aprovação RH": "Aguardando aprovação",
    "Congelada": "Congelada",
}
EXTENSOES_ACEITAS = (".xlsx", ".xls", ".csv")
FONTES = {
    "quadro": {"titulo": "Quadro funcional", "detalhe": "Ativos e desligados", "arquivo": "quadro_funcional_completo.csv", "manual": True},
    "organizacao": {"titulo": "Arquivo organizacional", "detalhe": "Atendimento e agendamento", "arquivo": "arquivo_organizacional.xlsx", "manual": True, "dias": 1, "hora": 19},
    "relatorio": {"titulo": "Relatório de funcionários", "detalhe": "Situação no sistema de RH", "arquivo": "relatorio_funcionarios.xlsx", "manual": True, "dias": 3, "hora": 16},
    "treinamento": {"titulo": "Planilhas de acompanhamento · Treinamento", "detalhe": "Turmas de novatos", "arquivo": "turmas_treinamento.xlsx", "manual": True, "dias": 3, "hora": 10},
    "rh": {"titulo": "Planilha de acompanhamento · RH", "detalhe": "Acompanhamento do RH", "arquivo": "acompanhamento_rh.xlsx", "manual": True, "dias": 3, "hora": 13},
    "rq_semanal": {"titulo": "Planilha semanal de RQs", "detalhe": "Consolidado das planilhas", "arquivo": "planilha_semanal_rqs.xlsx", "manual": False, "dias": 2, "hora": 9},
    "referencia": {"titulo": "Arquivos mensais de ajuste", "detalhe": "Conferência pela matrícula", "arquivo": None, "manual": False},
}

_importacoes: dict = {}
_trava_importacoes = threading.Lock()


class Importacao(BaseModel):
    arquivos: list[str] = Field(min_length=1, max_length=40)

    @field_validator("arquivos")
    @classmethod
    def conferir_arquivos(cls, arquivos: list) -> list:
        limpos = [a.strip()[:200] for a in arquivos if a.strip()]
        if not limpos:
            raise ValueError("Informe ao menos um arquivo.")
        invalidos = [a for a in limpos if not a.lower().endswith(EXTENSOES_ACEITAS)]
        if invalidos:
            raise ValueError(f"Formato não aceito: {', '.join(invalidos)}. Use .xlsx, .xls ou .csv.")
        return limpos


def _contagem(linhas: list, campo: str) -> list:
    contagem = Counter(l.get(campo) or "(não informado)" for l in linhas)
    return [{"nome": nome, "total": total} for nome, total in contagem.most_common()]


def area_de(servico: str | None) -> str:
    return "PGT" if servico in SERVICOS_PGT else "Planejamento"


def setor_de(servico: str | None) -> str:
    return "Agendamento" if servico in SERVICOS_AGENDAMENTO else "Atendimento"


def _na_area(linhas: list, area: str) -> list:
    return [l for l in linhas if area_de(l.get("servico")) == area] if area else list(linhas)


def _fonte(chave: str) -> dict:
    base = obter_base()
    definicao = FONTES[chave]
    importacao = _importacoes.get(chave)
    if importacao:
        return {"chave": chave, **definicao, "arquivos": importacao["arquivos"], "em": importacao["em"], "origem": "manual"}
    if definicao["arquivo"] is None:
        return {"chave": chave, **definicao, "arquivos": [], "em": None, "origem": None}
    if chave == "quadro":
        em = cargas.servico.recebido_em(MODULO) or base.atualizado_em.isoformat(timespec="seconds")
    else:
        em = datetime.combine(base.hoje - timedelta(days=definicao["dias"]), time(definicao["hora"])).isoformat(timespec="seconds")
    return {"chave": chave, **definicao, "arquivos": [definicao["arquivo"]], "em": em, "origem": "automatica" if chave == "quadro" else "manual"}


def _registrar(chave: str, entrada: Importacao) -> dict:
    with _trava_importacoes:
        _importacoes[chave] = {"arquivos": entrada.arquivos, "em": datetime.now().isoformat(timespec="seconds")}
    return _fonte(chave)


@router.get("/fontes")
def listar_fontes():
    return [_fonte(chave) for chave in FONTES]


@router.post("/fontes/{chave}")
def importar_fonte(chave: str, entrada: Importacao):
    if chave not in FONTES or not FONTES[chave]["manual"]:
        raise HTTPException(404, "Fonte não encontrada.")
    return _registrar(chave, entrada)


def _ativo_em(c: dict, dia_iso: str) -> bool:
    return c["admissao"] <= dia_iso and (not c["data_desligamento"] or c["data_desligamento"] > dia_iso)


def _status_no_dia(c: dict, dia: date) -> str:
    if c["situacao"] in ("Férias", "Afastado"):
        return c["situacao"]
    if (dia - date.fromisoformat(c["admissao"])).days < DIAS_TREINAMENTO:
        return "Treinamento"
    return "Ativo"


def _escala(c: dict, dia: date) -> str:
    numero = int(c["matricula"][1:])
    folgas = {5, 6} if c["jornada"] == "8h12" else {numero % 7, (numero + 3) % 7}
    return "Folga" if dia.weekday() in folgas else "Escalado"


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
def auditar(modo: Literal["quadro", "sistema"] = "quadro", area: Literal["", "Planejamento", "PGT"] = "",
            f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    ativos = base.ativos()
    if modo == "quadro":
        divergencias = auditoria.auditar_quadro(ativos)
        titulos = auditoria.CHECAGENS_QUADRO
    else:
        divergencias = auditoria.auditar_sistema(ativos, base.organizacional)
        titulos = auditoria.CHECAGENS_SISTEMA
    filtradas = _na_area(filtros.aplicar(divergencias, f), area)
    pessoas = {d["matricula"] for d in filtradas}
    universo = _na_area(filtros.aplicar(ativos, f), area)
    return {
        "modo": modo,
        "fonte": _fonte("quadro" if modo == "quadro" else "relatorio"),
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


@router.post("/novatos/arquivo")
def gerar_arquivo_novatos(entrada: Importacao):
    base = obter_base()
    corte = (base.hoje - timedelta(days=45)).isoformat()
    campos = ("matricula", "nome", "cargo", "servico", "supervisor", "coordenador", "gerente", "sede", "turno", "admissao")
    linhas = [{campo: c[campo] for campo in campos} for c in base.ativos() if c["admissao"] >= corte]
    return {
        "planilhas": entrada.arquivos,
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "linhas": sorted(linhas, key=lambda l: (l["admissao"], l["matricula"])),
    }


def _cruzamento_referencia() -> list:
    base = obter_base()
    rng = random.Random(config.SEMENTE + 5)
    ativos = sorted(base.ativos(), key=lambda c: c["matricula"])
    linhas = []
    for c in rng.sample(ativos, min(80, len(ativos))):
        campo, chave = rng.choice((("Supervisão", "supervisor"), ("Cargo", "cargo"), ("Turno", "turno")))
        atual = c[chave]
        if rng.random() < 0.8:
            situacao, informado = "Confere", atual
        else:
            opcoes = sorted({o[chave] for o in ativos if o[chave] != atual})
            situacao, informado = "Diverge", rng.choice(opcoes) if opcoes else atual
        linhas.append({"matricula": c["matricula"], "nome": c["nome"], "campo": campo, "no_arquivo": informado,
                       "no_quadro": atual, "situacao": situacao, "gerente": c["gerente"], "servico": c["servico"]})
    for i in range(6):
        linhas.append({"matricula": f"M9{i:04d}", "nome": "-", "campo": "Supervisão", "no_arquivo": rng.choice(base.supervisores)["nome"],
                       "no_quadro": "-", "situacao": "Não localizada", "gerente": "", "servico": ""})
    ordem = {"Diverge": 0, "Não localizada": 1, "Confere": 2}
    return sorted(linhas, key=lambda l: (ordem[l["situacao"]], l["matricula"]))


def _referencia() -> dict:
    fonte = _fonte("referencia")
    linhas = _cruzamento_referencia() if fonte["em"] else []
    return {"fonte": fonte, "contagem": dict(Counter(l["situacao"] for l in linhas)), "linhas": linhas}


@router.get("/referencia")
def referencia():
    return _referencia()


@router.post("/referencia")
def importar_referencia(entrada: Importacao):
    _registrar("referencia", entrada)
    return _referencia()


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
    consolidado = []
    for rq in filtros.aplicar(base.rqs, f):
        numero = int(rq["numero"].split("-")[1])
        status = STATUS_PROCESSO.get(rq["status"], rq["status"])
        abertura = date.fromisoformat(rq["data_abertura"])
        com_candidato = status in ("Admitido", "Aguardando cadastro")
        admissao = rq["data_fechamento"] or (abertura + timedelta(days=30)).isoformat()
        consolidado.append({
            "id": 1100000 + numero, "rq": rq["numero"], "status": status,
            "candidato": f"Candidato {numero:04d}" if com_candidato else "-",
            "matricula": f"M{20000 + numero}" if com_candidato else "-",
            "admissao": admissao if com_candidato else None,
            "gerente": rq["gerente"], "planilha": inicio_da_semana(abertura).isoformat(),
        })
    ordem_status = {s: i for i, s in enumerate(STATUS_PROCESSO.values())}
    return {
        "fonte": _fonte("rq_semanal"),
        "planilhas": len({c["planilha"] for c in consolidado}),
        "consolidado": sorted(consolidado, key=lambda c: (ordem_status.get(c["status"], 99), c["admissao"] or "", c["id"])),
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


@router.post("/vagas/planilha")
def importar_planilha_vagas(entrada: Importacao):
    return _registrar("rq_semanal", entrada)


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
    colaboradores = [{**c, "status": _status_no_dia(c, dia), "escala": _escala(c, dia)} for c in no_dia]
    status = Counter(c["status"] for c in colaboradores)
    gerencias = Counter(c["gerente"] for c in no_dia if c["gerente"]).most_common(2)
    return {
        "data": dia.isoformat(),
        "atualizado_em": base.atualizado_em.isoformat(timespec="seconds"),
        "colaboradores": sorted(colaboradores, key=lambda c: c["nome"]),
        "por_status": [{"nome": s, "total": status.get(s, 0)} for s in STATUS_QUADRO],
        "concentracao": {
            "gerentes": [g for g, _ in gerencias],
            "percentual": round(sum(t for _, t in gerencias) / len(no_dia) * 100, 1) if no_dia else 0,
        },
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


def _periodo_anterior(inicio: date, fim: date) -> tuple:
    if inicio.day == 1 and (inicio.year, inicio.month) == (fim.year, fim.month):
        fim_anterior = inicio - timedelta(days=1)
        inicio_anterior = fim_anterior.replace(day=1)
        return inicio_anterior, min(fim_anterior, inicio_anterior + timedelta(days=fim.day - 1))
    fim_anterior = inicio - timedelta(days=1)
    return fim_anterior - (fim - inicio), fim_anterior


def _desligados_entre(quadro: list, inicio: date, fim: date) -> list:
    return [{**c, "classe": CLASSE_MOTIVO.get(c["motivo_desligamento"], "Outra saída")}
            for c in quadro if c["situacao"] == "Desligado" and filtros.dentro(c["data_desligamento"], inicio, fim)]


@router.get("/desligados")
def desligados(de: date | None = None, ate: date | None = None, area: Literal["", "Planejamento", "PGT"] = "",
               classe: Literal["", "Voluntário", "Involuntário", "Promoção", "Outra saída"] = "",
               f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    fim = min(ate or base.hoje, base.hoje)
    inicio = de or fim.replace(day=1)
    if inicio > fim:
        inicio, fim = fim, inicio
    quadro = _na_area(filtros.aplicar(base.quadro, f), area)
    da_classe = [c for c in quadro if not classe or CLASSE_MOTIVO.get(c["motivo_desligamento"], "Outra saída") == classe]
    linhas = _desligados_entre(da_classe, inicio, fim)
    inicio_anterior, fim_anterior = _periodo_anterior(inicio, fim)
    anteriores = _desligados_entre(da_classe, inicio_anterior, fim_anterior)
    efetivo_inicial = sum(1 for c in quadro if _ativo_em(c, inicio.isoformat()))
    classes = Counter(l["classe"] for l in linhas)
    classes_anteriores = Counter(l["classe"] for l in anteriores)
    ultimo_dia_mes = calendar.monthrange(base.hoje.year, base.hoje.month)[1]
    mes_parcial = base.hoje.day < ultimo_dia_mes
    meses = []
    referencia = base.hoje.replace(day=1)
    for i in range(MESES_EVOLUCAO - 1, -1, -1):
        ano, mes = referencia.year, referencia.month - i
        while mes <= 0:
            ano, mes = ano - 1, mes + 12
        chave = f"{ano:04d}-{mes:02d}"
        do_mes = [c for c in da_classe if c["data_desligamento"] and c["data_desligamento"].startswith(chave)]
        meses.append({"mes": chave, "parcial": mes_parcial and i == 0,
                      **{classe: sum(1 for c in do_mes if CLASSE_MOTIVO.get(c["motivo_desligamento"]) == classe) for classe in CLASSES_SAIDA}})
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
        "parcial": fim == base.hoje and mes_parcial,
        "corte": base.hoje.isoformat(),
        "atualizado_em": base.atualizado_em.isoformat(timespec="seconds"),
        "anterior": {"de": inicio_anterior.isoformat(), "ate": fim_anterior.isoformat(), "desligados": len(anteriores),
                     **{c: classes_anteriores.get(c, 0) for c in CLASSES_SAIDA}},
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


def _situacao_relatorio(c: dict) -> tuple:
    rng = random.Random(f"{config.SEMENTE}-{c['matricula']}")
    sorteio = rng.random()
    if sorteio < 0.72:
        return "Desligado", (date.fromisoformat(c["data_desligamento"]) - timedelta(days=rng.randint(0, 3))).isoformat()
    if sorteio < 0.94:
        return "Ativo", None
    return "Sem registro", None


@router.get("/organizacao")
def organizacao(setor: Literal["", "Agendamento", "Atendimento"] = "",
                situacao: Literal["", "Desligado", "Ativo", "Sem registro"] = "Desligado",
                f: dict = Depends(filtros.filtros_hierarquia)):
    base = obter_base()
    contas = {c["login"]: c for c in base.organizacional if c["conta_ativa"]}
    todas = []
    for c in filtros.aplicar(base.desligados(), f):
        conta = contas.get(c["login"])
        if conta is None:
            continue
        no_relatorio, data_relatorio = _situacao_relatorio(c)
        todas.append({
            **c, "supervisor_sistema": conta["supervisor"], "setor": setor_de(c["servico"]),
            "perfil": f"{setor_de(c['servico'])} · {c['servico']}",
            "classe": CLASSE_MOTIVO.get(c["motivo_desligamento"], "Outra saída"),
            "situacao_relatorio": no_relatorio, "data_relatorio": data_relatorio,
            "dias_desligado": (base.hoje - date.fromisoformat(c["data_desligamento"])).days,
        })
    na_situacao = [l for l in todas if not situacao or l["situacao_relatorio"] == situacao]
    no_setor = [l for l in todas if not setor or l["setor"] == setor]
    linhas = [l for l in na_situacao if not setor or l["setor"] == setor]
    return {
        "total": len(linhas),
        "fontes": {"organizacao": _fonte("organizacao"), "relatorio": _fonte("relatorio")},
        "contagem_setor": {"": len(na_situacao), **{s: sum(1 for l in na_situacao if l["setor"] == s) for s in ("Agendamento", "Atendimento")}},
        "contagem_situacao": {s: sum(1 for l in no_setor if l["situacao_relatorio"] == s) for s in SITUACOES_RELATORIO},
        "linhas": sorted(linhas, key=lambda l: (l["data_desligamento"], l["matricula"]), reverse=True),
    }
