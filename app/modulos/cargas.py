import asyncio
import hashlib
import json
import random
import threading
from collections import deque
from datetime import datetime, timedelta

from fastapi import APIRouter

from app import config
from app.dados.estado import obter_base

router = APIRouter(prefix="/api/cargas", tags=["cargas automáticas"])

TIPOS = {
    "quadro_funcional": {
        "titulo": "Quadro funcional",
        "destinos": ["Gestão do Quadro", "Controle de Reposições", "Relatórios Operacionais"],
        "colunas": ["matricula", "nome", "gerente", "coordenador", "supervisor", "situacao"],
    },
    "desligados": {
        "titulo": "Desligados",
        "destinos": ["Gestão do Quadro", "Controle de Reposições"],
        "colunas": ["matricula", "data_desligamento", "motivo_desligamento"],
    },
    "vagas": {
        "titulo": "Vagas (RQs)",
        "destinos": ["Controle de Reposições", "Gestão do Quadro"],
        "colunas": ["numero", "status", "data_abertura"],
    },
    "ponto": {
        "titulo": "Login e logout",
        "destinos": ["Relatórios Operacionais"],
        "colunas": ["matricula", "data", "entrada", "saida"],
    },
}
TAXA_FALHA_ENTREGA = 0.05
LIMITE_FALHAS_SEGUIDAS = 5
PAUSA_CIRCUITO = timedelta(minutes=5)
HISTORICO_MAXIMO = 60
INTERVALO_VERIFICACAO_S = 2


def _agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


class Cargas:
    def __init__(self, semente: int = config.SEMENTE + 1):
        self.rng = random.Random(semente)
        self.trava = threading.Lock()
        self.assinaturas = {}
        self.pendentes = set()
        self.entregas = {}
        self.historico = deque(maxlen=HISTORICO_MAXIMO)
        self.fila = deque()
        self.falhas_seguidas = 0
        self.circuito_aberto_ate = None
        self.proxima_rodada = None

    def validar(self, tipo: str, linhas: list) -> str | None:
        if not linhas:
            return "arquivo vazio"
        faltando = [c for c in TIPOS[tipo]["colunas"] if c not in linhas[0]]
        return f"colunas ausentes: {', '.join(faltando)}" if faltando else None

    def rodar(self, origem: str = "agendada", tipos: list | None = None) -> dict:
        with self.trava:
            agora = datetime.now()
            if origem == "agendada" and self.circuito_aberto_ate and agora < self.circuito_aberto_ate:
                registro = {"em": _agora(), "origem": origem, "situacao": "circuito_aberto", "eventos": [], "entregas": []}
                self.historico.appendleft(registro)
                return registro

            base = obter_base()
            eventos = base.evoluir() if origem == "agendada" else []
            entregas = []
            houve_falha = False
            for tipo in tipos or list(TIPOS):
                linhas = base.extrair(tipo)
                erro = self.validar(tipo, linhas)
                if erro:
                    houve_falha = True
                    entregas.append({"tipo": tipo, "destino": None, "resultado": "reprovado", "detalhe": erro})
                    continue
                assinatura = hashlib.md5(json.dumps(linhas, sort_keys=True, default=str).encode("utf-8")).hexdigest()
                mudou = assinatura != self.assinaturas.get(tipo)
                for destino in TIPOS[tipo]["destinos"]:
                    chave = (tipo, destino)
                    if origem == "agendada" and not mudou and chave not in self.pendentes:
                        entregas.append({"tipo": tipo, "destino": destino, "resultado": "sem_mudanca"})
                        continue
                    if self.rng.random() < TAXA_FALHA_ENTREGA:
                        houve_falha = True
                        self.pendentes.add(chave)
                        entregas.append({
                            "tipo": tipo, "destino": destino, "resultado": "falha",
                            "detalhe": "Destino não respondeu; nova tentativa na próxima rodada",
                        })
                        continue
                    self.pendentes.discard(chave)
                    self.entregas[chave] = {"em": _agora(), "linhas": len(linhas)}
                    entregas.append({"tipo": tipo, "destino": destino, "resultado": "ok", "linhas": len(linhas)})
                self.assinaturas[tipo] = assinatura

            if houve_falha:
                self.falhas_seguidas += 1
                if self.falhas_seguidas >= LIMITE_FALHAS_SEGUIDAS:
                    self.circuito_aberto_ate = agora + PAUSA_CIRCUITO
                    self.falhas_seguidas = 0
            else:
                self.falhas_seguidas = 0
                self.circuito_aberto_ate = None

            registro = {
                "em": _agora(),
                "origem": origem,
                "situacao": "parcial" if houve_falha else "ok",
                "eventos": eventos,
                "entregas": entregas,
            }
            self.historico.appendleft(registro)
            return registro

    def solicitar(self, tipo: str) -> int:
        if tipo not in TIPOS:
            raise ValueError(f"Tipo de extração desconhecido: {tipo}")
        self.fila.append(tipo)
        return len(self.fila)

    def recebido_em(self, destino: str) -> str | None:
        datas = [e["em"] for (_, d), e in self.entregas.items() if d == destino]
        return max(datas) if datas else None

    def saude(self) -> dict:
        ultima = self.historico[0] if self.historico else None
        if self.circuito_aberto_ate and datetime.now() < self.circuito_aberto_ate:
            situacao = "circuito_aberto"
        elif ultima is None:
            situacao = "aguardando"
        elif datetime.now() - datetime.fromisoformat(ultima["em"]) > timedelta(seconds=config.INTERVALO_CARGAS_S * 3):
            situacao = "atrasada"
        else:
            situacao = "ok"
        return {
            "situacao": situacao,
            "ultima_rodada": ultima["em"] if ultima else None,
            "proxima_rodada": self.proxima_rodada.isoformat(timespec="seconds") if self.proxima_rodada else None,
        }

    def status(self) -> dict:
        return {
            **self.saude(),
            "circuito_aberto_ate": self.circuito_aberto_ate.isoformat(timespec="seconds") if self.circuito_aberto_ate else None,
            "intervalo_segundos": config.INTERVALO_CARGAS_S,
            "tipos": {chave: dados["titulo"] for chave, dados in TIPOS.items()},
            "pendentes": [{"tipo": t, "destino": d} for t, d in sorted(self.pendentes)],
            "entregas": [
                {"tipo": t, "destino": d, **e} for (t, d), e in sorted(self.entregas.items())
            ],
            "fila": list(self.fila),
            "historico": list(self.historico)[:20],
            "versao_base": obter_base().versao,
        }

    async def ciclo(self, intervalo: int) -> None:
        proxima = datetime.now() + timedelta(seconds=intervalo)
        self.proxima_rodada = proxima
        while True:
            if self.fila:
                tipo = self.fila.popleft()
                await asyncio.to_thread(self.rodar, "sob_pedido", [tipo])
            if datetime.now() >= proxima:
                await asyncio.to_thread(self.rodar, "agendada")
                proxima = datetime.now() + timedelta(seconds=intervalo)
                self.proxima_rodada = proxima
            await asyncio.sleep(INTERVALO_VERIFICACAO_S)


servico = Cargas()


@router.get("/status")
def obter_status():
    return servico.status()


@router.get("/saude")
def obter_saude():
    return servico.saude()
