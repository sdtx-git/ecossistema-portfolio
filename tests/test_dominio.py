from datetime import date

from app.dominio import auditoria, jornada, reposicao
from app.dominio.calendario import dias_uteis
from tests.conftest import HOJE


def _pessoa(matricula, supervisor, coordenador, gerente="Gerente 1", login=None):
    return {
        "matricula": matricula, "login": login or matricula, "nome": f"Agente {matricula}", "servico": "Atendimento",
        "gerente": gerente, "coordenador": coordenador, "supervisor": supervisor,
    }


def test_dias_uteis_ignora_fim_de_semana():
    assert dias_uteis(date(2026, 6, 12), date(2026, 6, 15)) == 1
    assert dias_uteis(date(2026, 6, 15), date(2026, 6, 15)) == 0


def test_auditoria_aponta_coordenacao_fora_da_maioria():
    ativos = [_pessoa(str(i), "Supervisor 1", "Coordenador 1") for i in range(5)]
    ativos.append(_pessoa("x", "Supervisor 1", "Coordenador 9"))
    divergencias = [d for d in auditoria.auditar_quadro(ativos) if d["checagem"] == "coordenacao"]
    assert [d["matricula"] for d in divergencias] == ["x"]
    assert divergencias[0]["valor_referencia"] == "Coordenador 1"


def test_auditoria_aponta_campo_vazio():
    ativos = [_pessoa("1", "Supervisor 1", "Coordenador 1", gerente="")]
    checagens = {d["checagem"] for d in auditoria.auditar_quadro(ativos)}
    assert "campo_ausente" in checagens


def test_auditoria_contra_sistema():
    ativos = [_pessoa("1", "Supervisor 1", "Coordenador 1"), _pessoa("2", "Supervisor 1", "Coordenador 1")]
    organizacional = [{"login": "1", "supervisor": "Supervisor 1"}, {"login": "2", "supervisor": "Supervisor 7"}]
    divergencias = auditoria.auditar_sistema(ativos, organizacional)
    assert [(d["matricula"], d["valor_referencia"]) for d in divergencias] == [("2", "Supervisor 7")]


def test_auditoria_encontra_inconsistencias_injetadas(dados):
    ativos = [c for c in dados["quadro"] if c["situacao"] != "Desligado"]
    assert auditoria.auditar_quadro(ativos)
    assert auditoria.auditar_sistema(ativos, dados["organizacional"])


def _registro(matricula, dia, entrada, saida, previstos, logados):
    return {
        "matricula": matricula, "data": dia, "entrada": f"{dia}T{entrada}", "saida": saida,
        "minutos_previstos": previstos, "minutos_logados": logados,
    }


def test_excedente_e_subjornada_respeitam_tolerancia():
    registros = [
        _registro("1", "2026-06-10", "08:00", "2026-06-10T14:10", 360, 370),
        _registro("2", "2026-06-10", "08:00", "2026-06-10T14:30", 360, 390),
        _registro("3", "2026-06-10", "08:00", "2026-06-10T13:30", 360, 330),
    ]
    assert [o["matricula"] for o in jornada.excedentes(registros)] == ["2"]
    assert [o["matricula"] for o in jornada.subjornada(registros)] == ["3"]


def test_interjornada_detecta_descanso_curto_entre_dias_consecutivos():
    registros = [
        _registro("1", "2026-06-10", "07:00", "2026-06-10T22:00", 360, 900),
        _registro("1", "2026-06-11", "07:00", "2026-06-11T13:00", 360, 360),
        _registro("1", "2026-06-13", "07:00", "2026-06-13T13:00", 360, 360),
    ]
    ocorrencias = jornada.interjornada(registros)
    assert len(ocorrencias) == 1
    assert ocorrencias[0]["descanso"] == 540
    assert ocorrencias[0]["minutos"] == 120


def test_prazo_de_abertura_respeita_carencia_e_limite():
    assert reposicao.classificar_prazo(reposicao.ABERTURA, 3) == reposicao.DENTRO
    assert reposicao.classificar_prazo(reposicao.ABERTURA, 5) == reposicao.PROXIMO
    assert reposicao.classificar_prazo(reposicao.ABERTURA, 8) == reposicao.FORA
    assert reposicao.classificar_prazo("Aprovação RH", 179) == ""
    assert reposicao.classificar_prazo("Aprovação RH", 180) == reposicao.FORA


def test_desligado_sem_rq_fica_em_abertura():
    desligados = [
        {**_pessoa("1", "S", "C"), "cargo": "Agente", "situacao": "Desligado", "data_desligamento": "2026-06-01", "motivo_desligamento": "x"},
        {**_pessoa("2", "S", "C"), "cargo": "Agente", "situacao": "Desligado", "data_desligamento": "2026-06-10", "motivo_desligamento": "x"},
    ]
    rqs = [{"matricula_substituido": "1", "numero": "RQ-1", "motivo": "Reposição", "data_abertura": "2026-06-02",
            "data_fechamento": None, "status": "Em andamento recrutamento"}]
    linhas = {l["matricula"]: l for l in reposicao.reposicoes(desligados, rqs, HOJE)}
    assert linhas["1"]["status"] == "Em andamento recrutamento"
    assert linhas["1"]["tempo_abrir"] == 1
    assert linhas["2"]["status"] == reposicao.ABERTURA
    assert linhas["2"]["prazo"] == reposicao.PROXIMO


def test_retrato_reconstroi_etapa_no_passado(dados):
    linhas = reposicao.reposicoes(dados["quadro"], dados["rqs"], HOJE)
    passado = reposicao.retrato(linhas, date(2026, 5, 1), HOJE)
    assert all(l["data_desligamento"] is None or l["data_desligamento"] <= "2026-05-01" for l in passado)


def test_quadro_vagas_fecha_com_os_totais(dados):
    linhas = reposicao.vagas_por_supervisao(dados["quadro"], dados["rqs"], dados["supervisores"], HOJE)
    ativos = sum(1 for c in dados["quadro"] if c["situacao"] != "Desligado")
    assert sum(l["ativos"] for l in linhas) == ativos
    assert all(l["previsto"] == l["ativos"] + l["vagas"] for l in linhas)
