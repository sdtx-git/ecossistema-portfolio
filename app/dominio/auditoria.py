from collections import Counter, defaultdict

CAMPOS = ("gerente", "coordenador", "supervisor")
ROTULOS = {"gerente": "Gerência", "coordenador": "Coordenação", "supervisor": "Supervisão"}

CHECAGENS_QUADRO = {
    "campo_ausente": "Campo hierárquico vazio",
    "coordenacao": "Coordenação diferente da supervisão",
    "gerencia": "Gerência diferente da coordenação",
}
CHECAGENS_SISTEMA = {
    "supervisao_sistema": "Supervisão diferente do sistema organizacional",
    "sem_conta": "Sem conta no sistema organizacional",
}


def moda(valores) -> tuple:
    contagem = Counter(v for v in valores if v)
    if not contagem:
        return None, 0.0
    valor, ocorrencias = contagem.most_common(1)[0]
    return valor, ocorrencias / sum(contagem.values())


def agrupar(linhas: list, campo: str) -> dict:
    grupos = defaultdict(list)
    for linha in linhas:
        if linha.get(campo):
            grupos[linha[campo]].append(linha)
    return grupos


def _divergencia(colaborador, checagem, titulos, campo, atual, referencia, origem, motivo) -> dict:
    return {
        "checagem": checagem,
        "titulo": titulos[checagem],
        "matricula": colaborador["matricula"],
        "nome": colaborador["nome"],
        "diretoria": colaborador.get("diretoria"),
        "sede": colaborador.get("sede"),
        "cargo": colaborador.get("cargo"),
        "servico": colaborador["servico"],
        "gerente": colaborador["gerente"],
        "coordenador": colaborador["coordenador"],
        "supervisor": colaborador["supervisor"],
        "campo": ROTULOS.get(campo, campo),
        "valor_atual": atual or "",
        "valor_referencia": referencia or "",
        "origem": origem,
        "motivo": motivo,
    }


def auditar_quadro(ativos: list) -> list:
    divergencias = []
    for colaborador in ativos:
        for campo in CAMPOS:
            if not colaborador.get(campo):
                divergencias.append(_divergencia(
                    colaborador, "campo_ausente", CHECAGENS_QUADRO, campo, "", None,
                    "campo_ausente", f"{ROTULOS[campo]} não informada no quadro",
                ))

    coordenacao_da_supervisao = {
        supervisor: moda(c["coordenador"] for c in grupo)[0]
        for supervisor, grupo in agrupar(ativos, "supervisor").items()
    }
    for colaborador in ativos:
        esperado = coordenacao_da_supervisao.get(colaborador["supervisor"])
        if esperado and colaborador["coordenador"] and colaborador["coordenador"] != esperado:
            divergencias.append(_divergencia(
                colaborador, "coordenacao", CHECAGENS_QUADRO, "coordenador",
                colaborador["coordenador"], esperado, "agregacao_interna",
                f"A maior parte da equipe de {colaborador['supervisor']} está em {esperado}",
            ))

    gerencia_da_coordenacao = {
        coordenador: moda(c["gerente"] for c in grupo)[0]
        for coordenador, grupo in agrupar(ativos, "coordenador").items()
    }
    for colaborador in ativos:
        esperado = gerencia_da_coordenacao.get(colaborador["coordenador"])
        if esperado and colaborador["gerente"] and colaborador["gerente"] != esperado:
            divergencias.append(_divergencia(
                colaborador, "gerencia", CHECAGENS_QUADRO, "gerente",
                colaborador["gerente"], esperado, "vinculo_hierarquico_interno",
                f"{colaborador['coordenador']} responde a {esperado} na maior parte do quadro",
            ))
    return divergencias


def auditar_sistema(ativos: list, organizacional: list) -> list:
    contas = {conta["login"]: conta for conta in organizacional}
    divergencias = []
    for colaborador in ativos:
        conta = contas.get(colaborador["login"])
        if conta is None:
            divergencias.append(_divergencia(
                colaborador, "sem_conta", CHECAGENS_SISTEMA, "supervisor",
                colaborador["supervisor"], None, "vinculo_nao_localizado",
                "Login não encontrado no sistema organizacional",
            ))
        elif conta["supervisor"] != colaborador["supervisor"]:
            divergencias.append(_divergencia(
                colaborador, "supervisao_sistema", CHECAGENS_SISTEMA, "supervisor",
                colaborador["supervisor"], conta["supervisor"], "registro_direto",
                "O sistema organizacional aponta outra supervisão para o mesmo login",
            ))
    return divergencias


def resumo_checagens(divergencias: list, titulos: dict) -> list:
    contagem = Counter(d["checagem"] for d in divergencias)
    return [{"chave": chave, "titulo": titulo, "total": contagem.get(chave, 0)} for chave, titulo in titulos.items()]


def clusters(divergencias: list, limite: int = 8) -> list:
    contagem = Counter(
        (d["titulo"], d["valor_atual"] or "(vazio)", d["valor_referencia"] or "-") for d in divergencias
    )
    return [
        {"checagem": titulo, "atual": atual, "esperado": esperado, "total": total}
        for (titulo, atual, esperado), total in contagem.most_common(limite)
    ]


def diagnostico(ativos: list) -> list:
    linhas = []
    for supervisor, grupo in agrupar(ativos, "supervisor").items():
        coordenador, pureza = moda(c["coordenador"] for c in grupo)
        linhas.append({
            "supervisor": supervisor,
            "coordenador": coordenador,
            "pureza": round(pureza * 100, 1),
            "equipe": len(grupo),
        })
    return sorted(linhas, key=lambda l: (l["pureza"], l["supervisor"]))
