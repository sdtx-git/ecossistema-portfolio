import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import config
from app.dados.estado import obter_base
from app.modulos import cargas, exo, hierarquia, hub, quadro, relatorios, reposicoes


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    config.PASTA_VAR.mkdir(parents=True, exist_ok=True)
    obter_base()
    exo.preparar()
    await asyncio.to_thread(cargas.servico.rodar, "inicial")
    tarefa = asyncio.create_task(cargas.servico.ciclo(config.INTERVALO_CARGAS_S)) if config.CARGAS_ATIVAS else None
    yield
    if tarefa:
        tarefa.cancel()


app = FastAPI(
    title="Ecossistema de Governança de Pessoas",
    description="Réplica de demonstração com dados 100% sintéticos.",
    version="1.0.0",
    lifespan=ciclo_de_vida,
)

for modulo in (hierarquia, hub, exo, quadro, reposicoes, relatorios, cargas):
    app.include_router(modulo.router)

app.mount("/", StaticFiles(directory=config.PASTA_FRONTEND, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORTA)
