import random
import threading
from datetime import date, datetime

from app import config
from app.dados import sinteticos

TAXA_EVENTO = 0.3


class Base:
    def __init__(self, semente: int = config.SEMENTE, hoje: date | None = None):
        self.hoje = hoje or date.today()
        self.rng = random.Random(semente)
        dados = sinteticos.gerar(self.rng, self.hoje, config.DIAS_PONTO)
        self.gerentes = dados["gerentes"]
        self.coordenadores = dados["coordenadores"]
        self.supervisores = dados["supervisores"]
        self.quadro = dados["quadro"]
        self.organizacional = dados["organizacional"]
        self.rqs = dados["rqs"]
        self.ponto = dados["ponto"]
        self.movimentacoes = dados["movimentacoes"]
        self.mapa_supervisores = {s["nome"]: s for s in self.supervisores}
        self.trava = threading.RLock()
        self.versao = 1
        self.atualizado_em = datetime.now()

    def hierarquia(self) -> dict:
        return {
            "servicos": list(sinteticos.SERVICOS),
            "gerentes": self.gerentes,
            "coordenadores": self.coordenadores,
            "supervisores": self.supervisores,
            "hoje": self.hoje.isoformat(),
        }

    def ativos(self) -> list:
        return [c for c in self.quadro if c["situacao"] != "Desligado"]

    def desligados(self) -> list:
        return [c for c in self.quadro if c["situacao"] == "Desligado"]

    def extrair(self, tipo: str) -> list:
        with self.trava:
            if tipo == "quadro_funcional":
                return list(self.quadro)
            if tipo == "desligados":
                return self.desligados()
            if tipo == "vagas":
                return list(self.rqs)
            if tipo == "ponto":
                return list(self.ponto)
        raise ValueError(f"Tipo de carga desconhecido: {tipo}")

    def evoluir(self) -> list:
        eventos = []
        with self.trava:
            hoje = date.today()
            ativos = [c for c in self.quadro if c["situacao"] == "Ativo"]
            if ativos and self.rng.random() < TAXA_EVENTO:
                colaborador = self.rng.choice(ativos)
                colaborador["situacao"] = "Desligado"
                colaborador["data_desligamento"] = hoje.isoformat()
                colaborador["motivo_desligamento"] = self.rng.choice(sinteticos.MOTIVOS_DESLIGAMENTO)
                eventos.append(f"Desligamento registrado: {colaborador['nome']} ({colaborador['supervisor']})")

            com_rq = {r["matricula_substituido"] for r in self.rqs if r["matricula_substituido"]}
            sem_rq = [c for c in self.desligados() if c["matricula"] not in com_rq]
            if sem_rq and self.rng.random() < TAXA_EVENTO:
                colaborador = self.rng.choice(sem_rq)
                rq = sinteticos.nova_rq(len(self.rqs) + 1, self.mapa_supervisores[colaborador["supervisor"]],
                                        "Reposição", hoje, colaborador["matricula"])
                self.rqs.append(rq)
                eventos.append(f"{rq['numero']} aberta para {rq['supervisor']}")

            em_andamento = [r for r in self.rqs if r["status"] in sinteticos.ETAPAS_RQ]
            if em_andamento and self.rng.random() < TAXA_EVENTO:
                rq = self.rng.choice(em_andamento)
                indice = sinteticos.ETAPAS_RQ.index(rq["status"])
                if indice + 1 < len(sinteticos.ETAPAS_RQ):
                    rq["status"] = sinteticos.ETAPAS_RQ[indice + 1]
                else:
                    rq["status"] = "Fechada"
                    rq["data_fechamento"] = hoje.isoformat()
                eventos.append(f"{rq['numero']} passou para {rq['status']}")

            if eventos:
                self.versao += 1
                self.atualizado_em = datetime.now()
        return eventos


_base: Base | None = None
_trava_criacao = threading.Lock()


def obter_base() -> Base:
    global _base
    with _trava_criacao:
        if _base is None:
            _base = Base()
    return _base
