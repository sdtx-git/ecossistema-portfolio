import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


def _entrar(cliente, login, senha="demo123"):
    return cliente.post("/api/exo/entrar", json={"login": login, "senha": senha})


def test_endpoints_analiticos_respondem(cliente):
    for url in (
        "/api/base/hierarquia",
        "/api/hub/status",
        "/api/quadro/auditoria",
        "/api/quadro/auditoria?modo=sistema",
        "/api/quadro/desligados",
        "/api/reposicoes/abertura",
        "/api/reposicoes/quadro-vagas",
        "/api/relatorios/interjornada",
        "/api/relatorios/excedentes?nivel=supervisor",
        "/api/cargas/status",
    ):
        assert cliente.get(url).status_code == 200, url


def test_filtro_hierarquico_restringe_resultado(cliente):
    todos = cliente.get("/api/quadro/vagas").json()["linhas"]
    filtrados = cliente.get("/api/quadro/vagas?gerente=Gerente%201").json()["linhas"]
    assert 0 < len(filtrados) < len(todos)
    assert {l["gerente"] for l in filtrados} == {"Gerente 1"}


def test_exo_exige_sessao(cliente):
    cliente.cookies.clear()
    assert cliente.get("/api/exo/painel").status_code == 401


def test_exo_recusa_senha_errada(cliente):
    assert _entrar(cliente, "gerente1", "errada").status_code == 401


def test_exo_escopo_do_supervisor(cliente):
    assert _entrar(cliente, "supervisor1").status_code == 200
    pessoas = cliente.get("/api/exo/pessoas").json()
    assert pessoas and {p["supervisor"] for p in pessoas} == {"Supervisor 1"}
    assert cliente.get("/api/exo/monitoramento").status_code == 403


def test_exo_fluxo_de_tarefa(cliente):
    assert _entrar(cliente, "gerente1").status_code == 200
    criada = cliente.post("/api/exo/tarefas", json={"titulo": "Tarefa de teste", "prioridade": "Alta"}).json()
    alterada = cliente.patch(f"/api/exo/tarefas/{criada['id']}", json={"status": "Concluída"}).json()
    assert alterada["status"] == "Concluída"
    historico = cliente.get(f"/api/exo/tarefas/{criada['id']}").json()["historico"]
    assert any("Concluída" in h["texto"] for h in historico)


def test_exo_admin_solicita_extracao(cliente):
    assert _entrar(cliente, "admin").status_code == 200
    assert cliente.post("/api/exo/monitoramento/extracoes", json={"tipo": "vagas"}).status_code == 202
    assert cliente.post("/api/exo/monitoramento/extracoes", json={"tipo": "inexistente"}).status_code == 422
