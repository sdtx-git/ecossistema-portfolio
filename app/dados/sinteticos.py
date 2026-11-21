import random
from datetime import date, datetime, time, timedelta

DIRETORIA = "Diretoria 1"
GERENTES = 4
COORDENADORES_POR_GERENTE = 3
SUPERVISORES_POR_COORDENADOR = 4
AGENTES_POR_SUPERVISOR = (9, 13)
SERVICOS = tuple(f"Serviço {i}" for i in range(1, 9))

JORNADAS = {"6h": 360, "8h12": 492, "4h": 240}
PESOS_JORNADA = {"6h": 6, "8h12": 3, "4h": 1}
ENTRADAS = {
    "6h": (7, 8, 9, 10, 12, 13, 14, 15),
    "8h12": (7, 8, 9, 10),
    "4h": (8, 10, 14, 16, 18),
}

MOTIVOS_DESLIGAMENTO = (
    "Pedido de demissão",
    "Dispensa sem justa causa",
    "Término de contrato",
    "Dispensa com justa causa",
    "Abandono de emprego",
    "Promoção para outra área",
)
CLASSE_MOTIVO = {
    "Pedido de demissão": "Voluntário",
    "Dispensa sem justa causa": "Involuntário",
    "Término de contrato": "Involuntário",
    "Dispensa com justa causa": "Involuntário",
    "Abandono de emprego": "Outra saída",
    "Promoção para outra área": "Promoção",
}
SEDES = ("Sede 1", "Sede 2", "Sede 3")
TAXA_TRANSFERENCIA = 0.04


def turno_de(entrada: str) -> str:
    hora = int(entrada[:2])
    if hora < 12:
        return "Manhã"
    if hora < 17:
        return "Tarde"
    return "Noite"

DIAS_DESLIGAMENTO = 120
TAXA_DESLIGADOS = 0.1
ETAPAS_RQ = ("Aprovação RH", "Em andamento recrutamento", "Em andamento remuneração")
TAXA_CONGELADA = 0.05
TAXA_FERIAS = 0.04
TAXA_AFASTADOS = 0.02
TAXA_COORDENACAO_ERRADA = 0.03
TAXA_GERENCIA_AUSENTE = 0.01
TAXA_SUPERVISOR_DESATUALIZADO = 0.02
TAXA_CONTA_ATIVA_DESLIGADO = 0.3
TAXA_RQ_ABERTA = 0.92
RQS_AUMENTO_QUADRO = 10
TAXA_FALTA = 0.03
TAXA_DOBRA = 0.02
TAXA_EXCEDENTE = 0.06
TAXA_SAIDA_ANTECIPADA = 0.05


def gerar_hierarquia():
    gerentes, coordenadores, supervisores = [], [], []
    for g in range(1, GERENTES + 1):
        gerente = f"Gerente {g}"
        gerentes.append({"nome": gerente, "diretoria": DIRETORIA})
        for _ in range(COORDENADORES_POR_GERENTE):
            numero_coord = len(coordenadores) + 1
            coordenador = f"Coordenador {numero_coord}"
            coordenadores.append({"nome": coordenador, "gerente": gerente})
            for _ in range(SUPERVISORES_POR_COORDENADOR):
                numero_sup = len(supervisores) + 1
                supervisores.append({
                    "nome": f"Supervisor {numero_sup}",
                    "coordenador": coordenador,
                    "gerente": gerente,
                    "servico": SERVICOS[(numero_sup * 3 + numero_coord) % len(SERVICOS)],
                    "sede": SEDES[(numero_coord - 1) % len(SEDES)],
                    "diretoria": DIRETORIA,
                })
    return gerentes, coordenadores, supervisores


def _sortear_jornada(rng: random.Random) -> str:
    nomes = list(PESOS_JORNADA)
    return rng.choices(nomes, weights=[PESOS_JORNADA[n] for n in nomes])[0]


def gerar_colaboradores(rng: random.Random, supervisores: list, hoje: date) -> list:
    colaboradores = []
    for supervisor in supervisores:
        for _ in range(rng.randint(*AGENTES_POR_SUPERVISOR)):
            numero = len(colaboradores) + 1
            jornada = _sortear_jornada(rng)
            desligado = rng.random() < TAXA_DESLIGADOS
            admissao = hoje - timedelta(days=rng.randint(DIAS_DESLIGAMENTO + 10 if desligado else 3, 1100))
            data_desligamento = None
            motivo = None
            situacao = "Ativo"
            if desligado:
                data_desligamento = hoje - timedelta(days=rng.randint(1, DIAS_DESLIGAMENTO))
                motivo = rng.choices(MOTIVOS_DESLIGAMENTO, weights=(5, 3, 2, 1, 1, 1))[0]
                situacao = "Desligado"
            else:
                sorteio = rng.random()
                if sorteio < TAXA_FERIAS:
                    situacao = "Férias"
                elif sorteio < TAXA_FERIAS + TAXA_AFASTADOS:
                    situacao = "Afastado"
            entrada = f"{rng.choice(ENTRADAS[jornada]):02d}:00"
            colaboradores.append({
                "matricula": f"M{10000 + numero}",
                "login": f"ag{numero:04d}",
                "nome": f"Agente {numero:04d}",
                "cargo": rng.choices(("Agente", "Agente sênior", "Analista de qualidade"), weights=(14, 4, 1))[0],
                "diretoria": DIRETORIA,
                "gerente": supervisor["gerente"],
                "coordenador": supervisor["coordenador"],
                "supervisor": supervisor["nome"],
                "servico": supervisor["servico"],
                "sede": supervisor["sede"],
                "turno": turno_de(entrada),
                "jornada": jornada,
                "entrada": entrada,
                "admissao": admissao.isoformat(),
                "data_desligamento": data_desligamento.isoformat() if data_desligamento else None,
                "motivo_desligamento": motivo,
                "situacao": situacao,
            })
    return colaboradores


def inserir_inconsistencias(rng: random.Random, colaboradores: list, coordenadores: list) -> None:
    nomes = [c["nome"] for c in coordenadores]
    for colaborador in colaboradores:
        if colaborador["situacao"] == "Desligado":
            continue
        sorteio = rng.random()
        if sorteio < TAXA_COORDENACAO_ERRADA:
            colaborador["coordenador"] = rng.choice([n for n in nomes if n != colaborador["coordenador"]])
        elif sorteio < TAXA_COORDENACAO_ERRADA + TAXA_GERENCIA_AUSENTE:
            colaborador["gerente"] = ""


def gerar_organizacional(rng: random.Random, colaboradores: list, supervisores: list) -> list:
    nomes = [s["nome"] for s in supervisores]
    contas = []
    for colaborador in colaboradores:
        desligado = colaborador["situacao"] == "Desligado"
        if desligado and rng.random() >= TAXA_CONTA_ATIVA_DESLIGADO:
            continue
        supervisor = colaborador["supervisor"]
        if not desligado and rng.random() < TAXA_SUPERVISOR_DESATUALIZADO:
            supervisor = rng.choice([n for n in nomes if n != supervisor])
        contas.append({
            "login": colaborador["login"],
            "matricula": colaborador["matricula"],
            "supervisor": supervisor,
            "conta_ativa": True,
        })
    return contas


def nova_rq(numero: int, local: dict, motivo: str, abertura: date, matricula=None,
            status: str = "Aprovação RH", fechamento=None) -> dict:
    return {
        "numero": f"RQ-{numero:04d}",
        "motivo": motivo,
        "servico": local["servico"],
        "gerente": local["gerente"],
        "coordenador": local["coordenador"],
        "supervisor": local["supervisor"] if "supervisor" in local else local["nome"],
        "sede": local.get("sede"),
        "diretoria": DIRETORIA,
        "cargo": "Agente",
        "matricula_substituido": matricula,
        "data_abertura": abertura.isoformat(),
        "status": status,
        "data_fechamento": fechamento.isoformat() if fechamento else None,
    }


def etapa_por_idade(idade: int) -> str:
    if idade <= 4:
        return ETAPAS_RQ[0]
    if idade <= 22:
        return ETAPAS_RQ[1]
    return ETAPAS_RQ[2]


def _status_sorteado(rng: random.Random, abertura: date, hoje: date):
    idade = (hoje - abertura).days
    if rng.random() < TAXA_CONGELADA:
        return "Congelada", None
    if idade > 35 and rng.random() < 0.75:
        return "Fechada", abertura + timedelta(days=rng.randint(30, idade))
    return etapa_por_idade(idade + rng.randint(-3, 3)), None


def gerar_rqs(rng: random.Random, colaboradores: list, supervisores: list, hoje: date) -> list:
    por_nome = {s["nome"]: s for s in supervisores}
    rqs = []
    desligados = sorted(
        (c for c in colaboradores if c["situacao"] == "Desligado"),
        key=lambda c: c["data_desligamento"],
    )
    for colaborador in desligados:
        desligamento = date.fromisoformat(colaborador["data_desligamento"])
        chance = TAXA_RQ_ABERTA if (hoje - desligamento).days > 10 else 0.45
        if rng.random() >= chance:
            continue
        abertura = min(hoje, desligamento + timedelta(days=rng.choice((0, 1, 1, 2, 2, 3, 4, 6, 9))))
        status, fechamento = _status_sorteado(rng, abertura, hoje)
        rqs.append(nova_rq(len(rqs) + 1, por_nome[colaborador["supervisor"]], "Reposição",
                           abertura, colaborador["matricula"], status, fechamento))
    for _ in range(RQS_AUMENTO_QUADRO):
        supervisor = rng.choice(supervisores)
        abertura = hoje - timedelta(days=rng.randint(0, 40))
        status, fechamento = _status_sorteado(rng, abertura, hoje)
        rqs.append(nova_rq(len(rqs) + 1, supervisor, "Aumento de quadro", abertura, None, status, fechamento))
    return rqs


def _minutos(inicio: datetime, fim: datetime) -> int:
    return int((fim - inicio).total_seconds() // 60)


def gerar_ponto(rng: random.Random, colaboradores: list, hoje: date, dias: int) -> list:
    registros = []
    inicio_janela = hoje - timedelta(days=dias)
    for colaborador in colaboradores:
        if colaborador["situacao"] in ("Férias", "Afastado"):
            continue
        fim = date.fromisoformat(colaborador["data_desligamento"]) if colaborador["data_desligamento"] else hoje
        admissao = date.fromisoformat(colaborador["admissao"])
        folgas = {5, 6} if colaborador["jornada"] == "8h12" else {6, rng.randint(0, 5)}
        minutos_previstos = JORNADAS[colaborador["jornada"]]
        hora, minuto = map(int, colaborador["entrada"].split(":"))
        dia = max(inicio_janela, admissao)
        while dia < fim:
            if dia.weekday() not in folgas and rng.random() >= TAXA_FALTA:
                entrada_prevista = datetime.combine(dia, time(hora, minuto))
                saida_prevista = entrada_prevista + timedelta(minutes=minutos_previstos)
                entrada = entrada_prevista + timedelta(minutes=round(rng.gauss(0, 5)))
                saida = saida_prevista + timedelta(minutes=round(rng.gauss(2, 4)))
                sorteio = rng.random()
                if sorteio < TAXA_DOBRA:
                    saida = saida_prevista + timedelta(minutes=rng.randint(300, 540))
                elif sorteio < TAXA_DOBRA + TAXA_EXCEDENTE:
                    saida += timedelta(minutes=rng.randint(15, 90))
                elif sorteio < TAXA_DOBRA + TAXA_EXCEDENTE + TAXA_SAIDA_ANTECIPADA:
                    saida -= timedelta(minutes=rng.randint(15, 120))
                registros.append({
                    "matricula": colaborador["matricula"],
                    "data": dia.isoformat(),
                    "entrada_prevista": entrada_prevista.isoformat(timespec="minutes"),
                    "saida_prevista": saida_prevista.isoformat(timespec="minutes"),
                    "entrada": entrada.isoformat(timespec="minutes"),
                    "saida": saida.isoformat(timespec="minutes"),
                    "minutos_previstos": minutos_previstos,
                    "minutos_logados": _minutos(entrada, saida),
                })
            dia += timedelta(days=1)
    return registros


def gerar_movimentacoes(rng: random.Random, colaboradores: list, supervisores: list, hoje: date) -> list:
    por_coordenacao = {}
    for s in supervisores:
        por_coordenacao.setdefault(s["coordenador"], []).append(s["nome"])
    movimentos = []
    for c in colaboradores:
        if c["situacao"] == "Desligado" or rng.random() >= TAXA_TRANSFERENCIA:
            continue
        colegas = [n for n in por_coordenacao[c["coordenador"]] if n != c["supervisor"]]
        movimentos.append({
            "data": (hoje - timedelta(days=rng.randint(1, 59))).isoformat(),
            "matricula": c["matricula"],
            "nome": c["nome"],
            "gerente": c["gerente"],
            "tipo": "Alteração",
            "campo": "Supervisão",
            "de": rng.choice(colegas),
            "para": c["supervisor"],
        })
    return movimentos


def gerar(rng: random.Random, hoje: date, dias_ponto: int) -> dict:
    gerentes, coordenadores, supervisores = gerar_hierarquia()
    colaboradores = gerar_colaboradores(rng, supervisores, hoje)
    rqs = gerar_rqs(rng, colaboradores, supervisores, hoje)
    organizacional = gerar_organizacional(rng, colaboradores, supervisores)
    ponto = gerar_ponto(rng, colaboradores, hoje, dias_ponto)
    movimentacoes = gerar_movimentacoes(rng, colaboradores, supervisores, hoje)
    inserir_inconsistencias(rng, colaboradores, coordenadores)
    return {
        "movimentacoes": movimentacoes,
        "gerentes": gerentes,
        "coordenadores": coordenadores,
        "supervisores": supervisores,
        "quadro": colaboradores,
        "organizacional": organizacional,
        "rqs": rqs,
        "ponto": ponto,
    }
