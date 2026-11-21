from collections import defaultdict
from datetime import date, datetime, timedelta

TOLERANCIA_MIN = 10
DESCANSO_MINIMO_MIN = 660
LIMITE_REINCIDENCIA = 3
NIVEIS = ("gerente", "coordenador", "supervisor")
SEM_AREA = "(não informado)"


def excedentes(registros: list) -> list:
    ocorrencias = []
    for r in registros:
        diferenca = r["minutos_logados"] - r["minutos_previstos"]
        if diferenca > TOLERANCIA_MIN:
            ocorrencias.append({**r, "minutos": diferenca})
    return ocorrencias


def subjornada(registros: list) -> list:
    ocorrencias = []
    for r in registros:
        diferenca = r["minutos_previstos"] - r["minutos_logados"]
        if diferenca > TOLERANCIA_MIN:
            ocorrencias.append({**r, "minutos": diferenca})
    return ocorrencias


def interjornada(registros: list) -> list:
    por_matricula = defaultdict(list)
    for r in registros:
        por_matricula[r["matricula"]].append(r)
    ocorrencias = []
    for lista in por_matricula.values():
        lista.sort(key=lambda r: r["data"])
        for anterior, atual in zip(lista, lista[1:]):
            if date.fromisoformat(atual["data"]) - date.fromisoformat(anterior["data"]) != timedelta(days=1):
                continue
            descanso = int((datetime.fromisoformat(atual["entrada"]) - datetime.fromisoformat(anterior["saida"])).total_seconds() // 60)
            if descanso < DESCANSO_MINIMO_MIN:
                ocorrencias.append({
                    **atual,
                    "saida_anterior": anterior["saida"],
                    "descanso": descanso,
                    "minutos": DESCANSO_MINIMO_MIN - descanso,
                })
    return ocorrencias


CALCULOS = {"interjornada": interjornada, "excedentes": excedentes, "subjornada": subjornada}

FAIXAS_INTERVALO = (
    ("até 8h", 0, 480), ("8 a 9h", 480, 540), ("9 a 10h", 540, 600), ("10 a 11h", 600, 660),
    ("11 a 12h", 660, 720), ("12 a 14h", 720, 840), ("14 a 16h", 840, 960), ("16 a 18h", 960, 1080),
    ("18 a 20h", 1080, 1200), ("20 a 24h", 1200, 1440), ("acima de 24h", 1440, 10 ** 9),
)


def transicoes(registros: list) -> list:
    por_matricula = defaultdict(list)
    for r in registros:
        por_matricula[r["matricula"]].append(r)
    pares = []
    for lista in por_matricula.values():
        lista.sort(key=lambda r: r["data"])
        for anterior, atual in zip(lista, lista[1:]):
            if date.fromisoformat(atual["data"]) - date.fromisoformat(anterior["data"]) != timedelta(days=1):
                continue
            descanso = int((datetime.fromisoformat(atual["entrada"]) - datetime.fromisoformat(anterior["saida"])).total_seconds() // 60)
            pares.append({"matricula": atual["matricula"], "data": atual["data"], "servico": atual.get("servico"), "descanso": descanso})
    return pares


def contexto_interjornada(registros: list, ocorrencias: list, inicio: str, fim: str) -> dict:
    pares = [p for p in transicoes(registros) if inicio <= p["data"] <= fim]
    histograma = [sum(1 for p in pares if de <= p["descanso"] < ate) for _, de, ate in FAIXAS_INTERVALO]
    por_servico = defaultdict(lambda: {"transicoes": 0, "violacoes": 0})
    for p in pares:
        por_servico[p["servico"]]["transicoes"] += 1
    for o in ocorrencias:
        por_servico[o["servico"]]["violacoes"] += 1
    return {
        "transicoes": len(pares),
        "histograma": {"rotulos": [f[0] for f in FAIXAS_INTERVALO], "valores": histograma},
        "media_intervalo_min": round(sum(p["descanso"] for p in pares) / len(pares)) if pares else 0,
        "servicos": sorted(
            (
                {"servico": s, **v, "pct": round(v["violacoes"] / v["transicoes"] * 100, 2) if v["transicoes"] else 0}
                for s, v in por_servico.items() if s
            ),
            key=lambda s: s["servico"],
        ),
    }


def enriquecer(registros: list, quadro: list) -> list:
    pessoas = {c["matricula"]: c for c in quadro}
    enriquecidos = []
    for r in registros:
        pessoa = pessoas.get(r["matricula"])
        if pessoa is None:
            continue
        enriquecidos.append({
            **r,
            "nome": pessoa["nome"],
            "diretoria": pessoa["diretoria"],
            "cargo": pessoa["cargo"],
            "sede": pessoa["sede"],
            "servico": pessoa["servico"],
            "gerente": pessoa["gerente"],
            "coordenador": pessoa["coordenador"],
            "supervisor": pessoa["supervisor"],
            "jornada": pessoa["jornada"],
        })
    return enriquecidos


def resumir(ocorrencias: list, nivel: str, base_colaboradores: int) -> dict:
    nivel = nivel if nivel in NIVEIS else "coordenador"
    por_dia = defaultdict(lambda: {"ocorrencias": 0, "minutos": 0})
    por_area = defaultdict(lambda: {"ocorrencias": 0, "minutos": 0, "matriculas": set()})
    por_pessoa = defaultdict(lambda: {"ocorrencias": 0, "minutos": 0})
    for o in ocorrencias:
        por_dia[o["data"]]["ocorrencias"] += 1
        por_dia[o["data"]]["minutos"] += o["minutos"]
        area = por_area[o.get(nivel) or SEM_AREA]
        area["ocorrencias"] += 1
        area["minutos"] += o["minutos"]
        area["matriculas"].add(o["matricula"])
        pessoa = por_pessoa[o["matricula"]]
        pessoa.update({"matricula": o["matricula"], "nome": o["nome"], "supervisor": o["supervisor"]})
        pessoa["ocorrencias"] += 1
        pessoa["minutos"] += o["minutos"]

    total_minutos = sum(o["minutos"] for o in ocorrencias)
    colaboradores = len(por_pessoa)
    reincidentes = sorted(
        (p for p in por_pessoa.values() if p["ocorrencias"] >= LIMITE_REINCIDENCIA),
        key=lambda p: (-p["ocorrencias"], -p["minutos"]),
    )
    return {
        "kpis": {
            "ocorrencias": len(ocorrencias),
            "colaboradores": colaboradores,
            "percentual_colaboradores": round(colaboradores / base_colaboradores * 100, 1) if base_colaboradores else 0,
            "total_minutos": total_minutos,
            "media_minutos": round(total_minutos / len(ocorrencias)) if ocorrencias else 0,
            "reincidentes": len(reincidentes),
        },
        "por_dia": [{"data": d, **v} for d, v in sorted(por_dia.items())],
        "por_area": sorted(
            (
                {"area": nome, "ocorrencias": v["ocorrencias"], "minutos": v["minutos"], "colaboradores": len(v["matriculas"])}
                for nome, v in por_area.items()
            ),
            key=lambda a: -a["ocorrencias"],
        ),
        "reincidentes": reincidentes[:20],
        "linhas": sorted(ocorrencias, key=lambda o: (o["data"], o["minutos"]), reverse=True),
    }
