import json
import threading
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app import config
from app.modulos import cargas

router = APIRouter(prefix="/api/hub", tags=["hub"])

MODULOS_ATIVOS = {"exo", "quadro", "reposicoes", "relatorios"}
LINKS_PADRAO = [
    {"id": "exo", "nome": "Exo", "descricao": "Assistente de gestão: tarefas, casos, medidas e agenda.",
     "categoria": "Sistemas internos", "tipo": "interno", "destino": "/exo/", "icone": "sparkles",
     "modulo": "exo", "manutencao": False},
    {"id": "quadro", "nome": "Gestão do Quadro", "descricao": "Manutenção do quadro funcional.",
     "categoria": "Sistemas internos", "tipo": "interno", "destino": "/quadro/", "icone": "users-group",
     "modulo": "quadro", "manutencao": False},
    {"id": "reposicoes", "nome": "Controle de Reposições", "descricao": "Gestão de reposições.",
     "categoria": "Sistemas internos", "tipo": "interno", "destino": "/reposicoes/", "icone": "arrows-exchange",
     "modulo": "reposicoes", "manutencao": False},
    {"id": "relatorios", "nome": "Relatórios Operacionais", "descricao": "Interjornada, excedentes e sub-jornada.",
     "categoria": "Sistemas internos", "tipo": "interno", "destino": "/relatorios/", "icone": "chart-bar",
     "modulo": "relatorios", "manutencao": False},
]
ACESSOS_EXEMPLO = (
    ("Controle", "Painel de indicadores"), ("Controle", "Escalas"),
    ("Gestão de pessoas", "Acompanhamento de agendamento"), ("Gestão de pessoas", "Acompanhamento de atendimento"),
    ("Gestão de pessoas", "Portal do colaborador"),
    ("Ponto", "Registrar ponto"), ("Ponto", "Solicitar ajuste"),
    ("Serviços", "Assinaturas"), ("Serviços", "Chamados"),
    ("Documentos", "Portal de documentos"),
)
LINKS_PADRAO += [
    {"id": f"externo-{i}", "nome": nome, "descricao": "Exemplo de acesso rápido.", "categoria": categoria,
     "tipo": "externo", "destino": f"https://example.com/{i}", "icone": "external-link", "modulo": None, "manutencao": False}
    for i, (categoria, nome) in enumerate(ACESSOS_EXEMPLO, start=1)
]

_trava = threading.Lock()


class LinkEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: str = Field(default="", max_length=160)
    categoria: str = Field(min_length=1, max_length=40)
    tipo: Literal["interno", "externo"]
    destino: str = Field(min_length=1, max_length=300)
    icone: str = Field(default="link", max_length=40, pattern=r"^[a-z0-9-]+$")
    manutencao: bool = False

    @model_validator(mode="after")
    def conferir_destino(self):
        if self.tipo == "externo" and not self.destino.startswith(("http://", "https://")):
            raise ValueError("Link externo precisa começar com http:// ou https://")
        if self.tipo == "interno" and not self.destino.startswith("/"):
            raise ValueError("Link interno precisa ser um caminho começando com /")
        return self


def _arquivo():
    return config.PASTA_VAR / "links.json"


def carregar() -> list:
    arquivo = _arquivo()
    if not arquivo.exists():
        return [dict(link) for link in LINKS_PADRAO]
    return json.loads(arquivo.read_text(encoding="utf-8"))


def salvar(links: list) -> None:
    config.PASTA_VAR.mkdir(parents=True, exist_ok=True)
    _arquivo().write_text(json.dumps(links, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/links")
def listar_links():
    return carregar()


@router.post("/links", status_code=201)
def criar_link(entrada: LinkEntrada):
    with _trava:
        links = carregar()
        link = {"id": uuid.uuid4().hex[:8], **entrada.model_dump(), "modulo": None}
        links.append(link)
        salvar(links)
    return link


@router.put("/links/{link_id}")
def alterar_link(link_id: str, entrada: LinkEntrada):
    with _trava:
        links = carregar()
        for link in links:
            if link["id"] == link_id:
                link.update(entrada.model_dump())
                salvar(links)
                return link
    raise HTTPException(404, "Link não encontrado.")


@router.delete("/links/{link_id}", status_code=204)
def excluir_link(link_id: str):
    with _trava:
        links = carregar()
        restantes = [link for link in links if link["id"] != link_id]
        if len(restantes) == len(links):
            raise HTTPException(404, "Link não encontrado.")
        salvar(restantes)


@router.get("/status")
def obter_status():
    situacoes = {}
    for link in carregar():
        if link["tipo"] != "interno":
            continue
        if link.get("manutencao"):
            situacoes[link["id"]] = "manutencao"
        elif link.get("modulo") in MODULOS_ATIVOS:
            situacoes[link["id"]] = "online"
        else:
            situacoes[link["id"]] = "desconhecido"
    return {"links": situacoes, "cargas": cargas.servico.saude()}
