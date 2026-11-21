import random

from app.dados import sinteticos
from tests.conftest import HOJE


def test_hierarquia_tem_nomes_genericos_e_estrutura_fixa(dados):
    assert [g["nome"] for g in dados["gerentes"]] == ["Gerente 1", "Gerente 2", "Gerente 3", "Gerente 4"]
    assert len(dados["coordenadores"]) == sinteticos.GERENTES * sinteticos.COORDENADORES_POR_GERENTE
    assert len(dados["supervisores"]) == len(dados["coordenadores"]) * sinteticos.SUPERVISORES_POR_COORDENADOR
    assert all(c["nome"].startswith("Agente ") for c in dados["quadro"])


def test_geracao_e_deterministica():
    a = sinteticos.gerar(random.Random(7), HOJE, 10)
    b = sinteticos.gerar(random.Random(7), HOJE, 10)
    assert a == b


def test_matriculas_e_logins_sao_unicos(dados):
    matriculas = [c["matricula"] for c in dados["quadro"]]
    logins = [c["login"] for c in dados["quadro"]]
    assert len(set(matriculas)) == len(matriculas)
    assert len(set(logins)) == len(logins)


def test_desligamento_posterior_a_admissao(dados):
    for c in dados["quadro"]:
        if c["data_desligamento"]:
            assert c["admissao"] < c["data_desligamento"] <= HOJE.isoformat()


def test_ponto_nao_ultrapassa_desligamento(dados):
    desligamentos = {c["matricula"]: c["data_desligamento"] for c in dados["quadro"] if c["data_desligamento"]}
    for r in dados["ponto"]:
        if r["matricula"] in desligamentos:
            assert r["data"] < desligamentos[r["matricula"]]


def test_rq_de_reposicao_aponta_para_desligado(dados):
    desligados = {c["matricula"] for c in dados["quadro"] if c["situacao"] == "Desligado"}
    for rq in dados["rqs"]:
        if rq["motivo"] == "Reposição":
            assert rq["matricula_substituido"] in desligados
