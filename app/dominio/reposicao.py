from collections import Counter, defaultdict
from datetime import date, timedelta

from app.dados.sinteticos import ETAPAS_RQ, etapa_por_idade

SLA_CARENCIA_DIAS = 3
SLA_DIAS_RQ_ABERTO = 7
SLA_LIMITE_RQ_DIAS = 180
ABERTURA = "Abertura RQ"
STATUS_EM_ANDAMENTO = ETAPAS_RQ
ETAPAS = (ABERTURA, *ETAPAS_RQ)
DENTRO, PROXIMO, FORA = "Dentro do prazo", "Próximo do prazo", "Fora do prazo"
DESCRICAO_ETAPAS = {
    ABERTURA: f"Desligamento registrado e RQ de reposição ainda não aberta. Prazo de {SLA_DIAS_RQ_ABERTO} dias, com carência de {SLA_CARENCIA_DIAS}.",
    "Aprovação RH": "RQ aberta, aguardando aprovação do RH para iniciar a seleção.",
    "Em andamento recrutamento": "Vaga aprovada e em divulgação, triagem e entrevistas.",
    "Em andamento remuneração": "Candidato escolhido, proposta e admissão em andamento.",
}
JANELA_VAGAS_DIAS = 60


def classificar_prazo(status: str, dias: int | None) -> str:
    if dias is None:
        return ""
    if status == ABERTURA:
        if dias > SLA_DIAS_RQ_ABERTO:
            return FORA
        if dias > SLA_CARENCIA_DIAS:
            return PROXIMO
        return DENTRO
    if status in STATUS_EM_ANDAMENTO and dias >= SLA_LIMITE_RQ_DIAS:
        return FORA
    return ""


def _linha(base: dict, rq: dict | None, hoje: date, aumento: bool = False) -> dict:
    desligamento = None if aumento else base.get("data_desligamento")
    abertura = rq["data_abertura"] if rq else None
    status = rq["status"] if rq else ABERTURA
    dias = (hoje - date.fromisoformat(abertura if aumento else desligamento)).days
    return {
        "matricula": "-" if aumento else base["matricula"],
        "nome": "Vaga nova" if aumento else base["nome"],
        "cargo": base.get("cargo", "Agente"),
        "diretoria": base.get("diretoria", "Diretoria 1"),
        "sede": base.get("sede", "-"),
        "servico": base["servico"],
        "gerente": base["gerente"],
        "coordenador": base["coordenador"],
        "supervisor": base["supervisor"],
        "data_desligamento": desligamento,
        "motivo_desligamento": None if aumento else base.get("motivo_desligamento"),
        "rq": rq["numero"] if rq else None,
        "motivo_rq": rq["motivo"] if rq else "Reposição",
        "data_abertura": abertura,
        "data_fechamento": rq["data_fechamento"] if rq else None,
        "status": status,
        "dias_em_aberto": dias,
        "tempo_abrir": (date.fromisoformat(abertura) - date.fromisoformat(desligamento)).days if abertura and desligamento else None,
        "prazo": classificar_prazo(status, dias),
        "dias_para_prazo": SLA_DIAS_RQ_ABERTO - dias if status == ABERTURA else None,
    }


def reposicoes(colaboradores: list, rqs: list, hoje: date) -> list:
    rq_por_matricula = {r["matricula_substituido"]: r for r in rqs if r["matricula_substituido"]}
    linhas = [_linha(c, rq_por_matricula.get(c["matricula"]), hoje) for c in colaboradores if c["situacao"] == "Desligado"]
    linhas += [_linha(r, r, hoje, aumento=True) for r in rqs if not r["matricula_substituido"]]
    return sorted(linhas, key=lambda l: -l["dias_em_aberto"])


def status_em(linha: dict, dia: date, hoje: date) -> str | None:
    dia_iso = dia.isoformat()
    aumento = linha["motivo_rq"] == "Aumento de quadro"
    if not aumento and linha["data_desligamento"] > dia_iso:
        return None
    if aumento and linha["data_abertura"] > dia_iso:
        return None
    if linha["data_fechamento"] and linha["data_fechamento"] <= dia_iso:
        return "Fechada"
    if not linha["data_abertura"] or linha["data_abertura"] > dia_iso:
        return ABERTURA
    if linha["status"] == "Congelada" or dia >= hoje:
        return linha["status"]
    return etapa_por_idade((dia - date.fromisoformat(linha["data_abertura"])).days)


def retrato(linhas: list, dia: date, hoje: date) -> list:
    resultado = []
    for linha in linhas:
        status = status_em(linha, dia, hoje)
        if status is None:
            continue
        inicio = linha["data_abertura"] if linha["motivo_rq"] == "Aumento de quadro" else linha["data_desligamento"]
        dias = (dia - date.fromisoformat(inicio)).days
        resultado.append({**linha, "status": status, "dias_em_aberto": dias, "prazo": classificar_prazo(status, dias),
                          "dias_para_prazo": SLA_DIAS_RQ_ABERTO - dias if status == ABERTURA else None})
    return resultado


def contagem_etapas(linhas: list) -> dict:
    contagem = Counter(l["status"] for l in linhas)
    return {etapa: contagem.get(etapa, 0) for etapa in ETAPAS}


def evolucao(linhas: list, hoje: date, dias: int) -> list:
    chaves = ("abertura", "aprovacao", "recrutamento", "remuneracao")
    serie = []
    for i in range(dias - 1, -1, -1):
        dia = hoje - timedelta(days=i)
        foto = retrato(linhas, dia, hoje)
        etapas = contagem_etapas(foto)
        serie.append({
            "data": dia.isoformat(),
            **{chave: etapas[etapa] for chave, etapa in zip(chaves, ETAPAS)},
            "total": sum(etapas.values()),
            "fora": sum(1 for l in foto if l["prazo"] == FORA),
        })
    return serie


def comparativo(linhas: list, inicio: date, fim: date, hoje: date) -> list:
    def contar(dia):
        mapa = defaultdict(int)
        for l in retrato(linhas, dia, hoje):
            if l["status"] in ETAPAS:
                mapa[(l["gerente"] or "Sem gerência", l["coordenador"])] += 1
        return mapa
    antes, depois = contar(inicio), contar(fim)
    chaves = sorted(set(antes) | set(depois))
    return [{"gerente": g, "coordenador": c, "inicio": antes.get((g, c), 0), "fim": depois.get((g, c), 0)} for g, c in chaves]


def vagas_por_supervisao(colaboradores: list, rqs: list, supervisores: list, hoje: date) -> list:
    corte = hoje - timedelta(days=JANELA_VAGAS_DIAS)
    itens = {
        s["nome"]: {"supervisor": s["nome"], "coordenador": s["coordenador"], "gerente": s["gerente"], "servico": s["servico"],
                    "ativos": 0, "desligados": 0, "aumentos": 0, "rqs_em_andamento": 0}
        for s in supervisores
    }
    for c in colaboradores:
        item = itens.get(c["supervisor"])
        if item is None:
            continue
        if c["situacao"] != "Desligado":
            item["ativos"] += 1
        elif date.fromisoformat(c["data_desligamento"]) >= corte:
            item["desligados"] += 1
    for rq in rqs:
        item = itens.get(rq["supervisor"])
        if item is None or rq["status"] not in STATUS_EM_ANDAMENTO:
            continue
        item["rqs_em_andamento"] += 1
        if rq["motivo"] == "Aumento de quadro":
            item["aumentos"] += 1
    linhas = []
    for item in itens.values():
        previsto = item["ativos"] + item["desligados"] + item["aumentos"]
        vagas = previsto - item["ativos"]
        descobertas = max(vagas - item["rqs_em_andamento"], 0)
        if vagas == 0 and item["rqs_em_andamento"] == 0:
            situacao = "Completo"
        elif descobertas > 0:
            situacao = "Descoberto"
        elif item["rqs_em_andamento"] > vagas:
            situacao = "RQ acima das vagas"
        else:
            situacao = "Coberto"
        linhas.append({**item, "previsto": previsto, "vagas": vagas, "descobertas": descobertas, "situacao": situacao})
    return sorted(linhas, key=lambda l: (-l["descobertas"], l["supervisor"]))
