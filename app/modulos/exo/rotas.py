from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from app.dados.estado import obter_base
from app.dados.filtros import lista_parametro
from app.dominio import jornada
from app.dominio.reposicao import STATUS_EM_ANDAMENTO
from app.modulos import cargas
from app.modulos.exo import banco, seguranca
from app.modulos.exo.conexao import agora, conexao, linhas
from app.modulos.exo.seguranca import exigir_admin, filtro_escopo, usuario_atual

router = APIRouter(prefix="/api/exo", tags=["exo"])

Prioridade = Literal["Baixa", "Média", "Alta"]
StatusTarefa = Literal["A fazer", "Em andamento", "Aguardando", "Concluída"]
StatusCaso = Literal["Aberto", "Em acompanhamento", "Encerrado"]
TipoCaso = Literal["Absenteísmo", "Conduta", "Desempenho", "Saúde e bem-estar", "Jornada"]
TipoMedida = Literal["Orientação verbal", "Advertência escrita", "Suspensão"]
JANELA_MEDIDAS_DIAS = 180


class Credenciais(BaseModel):
    login: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=200)


class TarefaNova(BaseModel):
    titulo: str = Field(min_length=3, max_length=120)
    descricao: str = Field(default="", max_length=2000)
    responsavel_id: int | None = None
    prazo: date | None = None
    prioridade: Prioridade = "Média"


class TarefaAlteracao(BaseModel):
    titulo: str | None = Field(default=None, min_length=3, max_length=120)
    descricao: str | None = Field(default=None, max_length=2000)
    responsavel_id: int | None = None
    prazo: date | None = None
    prioridade: Prioridade | None = None
    status: StatusTarefa | None = None


class Texto(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)


class CasoNovo(BaseModel):
    tipo: TipoCaso
    pessoa_id: int
    descricao: str = Field(default="", max_length=2000)
    prioridade: Prioridade = "Média"
    responsavel_id: int | None = None


class CasoAlteracao(BaseModel):
    status: StatusCaso | None = None
    prioridade: Prioridade | None = None
    responsavel_id: int | None = None


class MedidaNova(BaseModel):
    pessoa_id: int
    tipo: TipoMedida
    data: date
    motivo: str = Field(min_length=3, max_length=500)
    caso_id: int | None = None


class ReuniaoNova(BaseModel):
    titulo: str = Field(min_length=3, max_length=120)
    inicio: datetime
    fim: datetime
    local: str = Field(default="", max_length=80)
    pauta: str = Field(default="", max_length=2000)
    participantes: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def conferir_horario(self):
        if self.fim <= self.inicio:
            raise ValueError("O fim da reunião precisa ser depois do início")
        return self


class DecisaoNova(BaseModel):
    texto: str = Field(min_length=3, max_length=500)
    gerar_tarefa: bool = False
    responsavel_id: int | None = None
    prazo: date | None = None


class Extracao(BaseModel):
    tipo: str


def _auditar(con, usuario: dict, acao: str, entidade: str, entidade_id=None, detalhe: str = "") -> None:
    con.execute(
        "INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhe, em) VALUES (?, ?, ?, ?, ?, ?)",
        (usuario["id"], acao, entidade, entidade_id, detalhe, agora()),
    )


def _tarefa_visivel(usuario: dict) -> tuple:
    if usuario["papel"] == "admin":
        return "1 = 1", []
    return "(t.responsavel_id = ? OR t.criado_por = ?)", [usuario["id"], usuario["id"]]


def _caso_visivel(usuario: dict) -> tuple:
    escopo, parametros = filtro_escopo(usuario)
    if usuario["papel"] == "admin":
        return escopo, parametros
    return f"({escopo} OR c.responsavel_id = ?)", [*parametros, usuario["id"]]


def _reuniao_visivel(usuario: dict) -> tuple:
    if usuario["papel"] == "admin":
        return "1 = 1", []
    return (
        "(r.criado_por = ? OR EXISTS (SELECT 1 FROM reuniao_participantes rp WHERE rp.reuniao_id = r.id AND rp.usuario_id = ?))",
        [usuario["id"], usuario["id"]],
    )


def _conferir_usuario(con, usuario_id) -> None:
    if usuario_id is not None and con.execute("SELECT 1 FROM usuarios WHERE id = ?", (usuario_id,)).fetchone() is None:
        raise HTTPException(422, "Responsável inválido.")


def _pessoa_no_escopo(con, usuario: dict, pessoa_id: int) -> dict:
    escopo, parametros = filtro_escopo(usuario)
    pessoa = con.execute(f"SELECT p.* FROM pessoas p WHERE p.id = ? AND {escopo}", [pessoa_id, *parametros]).fetchone()
    if pessoa is None:
        raise HTTPException(404, "Pessoa não encontrada no seu escopo.")
    return dict(pessoa)


def _nome_usuario(con, usuario_id) -> str:
    if usuario_id is None:
        return "ninguém"
    linha = con.execute("SELECT nome FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    return linha[0] if linha else "?"


def _no_escopo_base(usuario: dict, linha: dict) -> bool:
    if usuario["papel"] == "admin" or usuario["nivel"] == "diretoria":
        return True
    return linha.get(usuario["nivel"]) == usuario["escopo"]


def _resumo_operacao(usuario: dict) -> dict:
    base = obter_base()
    hoje = base.hoje
    corte_30 = (hoje - timedelta(days=30)).isoformat()
    corte_7 = (hoje - timedelta(days=7)).isoformat()
    quadro = [c for c in base.quadro if _no_escopo_base(usuario, c)]
    matriculas = {c["matricula"] for c in quadro}
    ponto = [r for r in base.ponto if r["matricula"] in matriculas and r["data"] >= corte_7]
    return {
        "ativos": sum(1 for c in quadro if c["situacao"] != "Desligado"),
        "desligados_30d": sum(1 for c in quadro if c["data_desligamento"] and c["data_desligamento"] >= corte_30),
        "novatos_30d": sum(1 for c in quadro if c["situacao"] != "Desligado" and c["admissao"] >= corte_30),
        "rqs_em_andamento": sum(1 for r in base.rqs if r["status"] in STATUS_EM_ANDAMENTO and _no_escopo_base(usuario, r)),
        "excedentes_7d": len(jornada.excedentes(ponto)),
        "subjornada_7d": len(jornada.subjornada(ponto)),
    }


@router.post("/entrar")
def entrar(credenciais: Credenciais, resposta: Response):
    login = credenciais.login.strip().lower()
    if seguranca.bloqueado(login):
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.")
    with conexao() as con:
        usuario = con.execute("SELECT * FROM usuarios WHERE login = ?", (login,)).fetchone()
        if usuario is None or not seguranca.conferir_senha(credenciais.senha, usuario["senha_hash"], usuario["sal"]):
            seguranca.registrar_falha(login)
            raise HTTPException(401, "Login ou senha incorretos.")
        seguranca.limpar_falhas(login)
        token = seguranca.criar_sessao(con, usuario["id"])
        _auditar(con, dict(usuario), "entrada", "sessao")
    resposta.set_cookie(
        seguranca.COOKIE_SESSAO, token, httponly=True, samesite="lax",
        max_age=int(seguranca.DURACAO_SESSAO.total_seconds()),
    )
    return {k: usuario[k] for k in ("id", "login", "nome", "papel", "nivel", "escopo")}


@router.post("/sair", status_code=204)
def sair(resposta: Response, exo_sessao: str | None = Cookie(default=None)):
    if exo_sessao:
        with conexao() as con:
            con.execute("DELETE FROM sessoes WHERE token = ?", (exo_sessao,))
    resposta.delete_cookie(seguranca.COOKIE_SESSAO)


@router.get("/eu")
def eu(usuario: dict = Depends(usuario_atual)):
    return usuario


@router.get("/usuarios")
def listar_usuarios(usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        return linhas(con.execute("SELECT id, nome, nivel FROM usuarios ORDER BY nome"))


@router.get("/painel")
def painel(usuario: dict = Depends(usuario_atual)):
    hoje = date.today().isoformat()
    tarefa, pt = _tarefa_visivel(usuario)
    escopo, pe = filtro_escopo(usuario)
    reuniao, pr = _reuniao_visivel(usuario)
    with conexao() as con:
        contadores = {
            "tarefas_abertas": con.execute(f"SELECT COUNT(*) FROM tarefas t WHERE {tarefa} AND t.status != 'Concluída'", pt).fetchone()[0],
            "tarefas_atrasadas": con.execute(
                f"SELECT COUNT(*) FROM tarefas t WHERE {tarefa} AND t.status != 'Concluída' AND t.prazo < ?", [*pt, hoje]).fetchone()[0],
            "casos_abertos": con.execute(
                f"SELECT COUNT(*) FROM casos c JOIN pessoas p ON p.id = c.pessoa_id WHERE {escopo} AND c.status != 'Encerrado'", pe).fetchone()[0],
            "medidas_30d": con.execute(
                f"SELECT COUNT(*) FROM medidas m JOIN pessoas p ON p.id = m.pessoa_id WHERE {escopo} AND m.data >= ?",
                [*pe, (date.today() - timedelta(days=30)).isoformat()]).fetchone()[0],
        }
        por_status = linhas(con.execute(f"SELECT t.status, COUNT(*) AS total FROM tarefas t WHERE {tarefa} GROUP BY t.status", pt))
        proximas = linhas(con.execute(
            f"SELECT t.id, t.titulo, t.prazo, t.prioridade, t.status FROM tarefas t WHERE {tarefa} AND t.status != 'Concluída' "
            "ORDER BY t.prazo IS NULL, t.prazo LIMIT 6", pt))
        casos = linhas(con.execute(
            f"SELECT c.id, c.titulo, c.status, c.aberto_em FROM casos c JOIN pessoas p ON p.id = c.pessoa_id "
            f"WHERE {escopo} AND c.status != 'Encerrado' ORDER BY c.aberto_em DESC LIMIT 5", pe))
        reunioes = linhas(con.execute(
            f"SELECT r.id, r.titulo, r.inicio, r.fim, r.local FROM reunioes r WHERE {reuniao} AND r.fim >= ? ORDER BY r.inicio LIMIT 5",
            [*pr, datetime.now().isoformat(timespec="minutes")]))
        limite = (date.today() + timedelta(days=3)).isoformat()
        contadores["vencem_em_breve"] = con.execute(
            f"SELECT COUNT(*) FROM tarefas t WHERE {tarefa} AND t.status != 'Concluída' AND t.prazo BETWEEN ? AND ?", [*pt, hoje, limite]).fetchone()[0]
        contadores["minhas_abertas"] = con.execute(
            "SELECT COUNT(*) FROM tarefas WHERE responsavel_id = ? AND status != 'Concluída'", (usuario["id"],)).fetchone()[0]
        contadores["criticas_abertas"] = con.execute(
            f"SELECT COUNT(*) FROM tarefas t WHERE {tarefa} AND t.status != 'Concluída' AND t.prioridade = 'Alta'", pt).fetchone()[0]
        inicio_mes = date.today().replace(day=1).isoformat()
        contadores["medidas_mes"] = con.execute(
            f"SELECT COUNT(*) FROM medidas m JOIN pessoas p ON p.id = m.pessoa_id WHERE {escopo} AND m.data >= ?", [*pe, inicio_mes]).fetchone()[0]
        produtividade = linhas(con.execute(
            "SELECT u.nome AS pessoa, COUNT(t.id) AS total, "
            "SUM(t.status = 'Concluída') AS concluidas, "
            "SUM(t.status != 'Concluída' AND (t.prazo IS NULL OR t.prazo > ?)) AS no_prazo, "
            "SUM(t.status != 'Concluída' AND t.prazo < ?) AS atrasadas, "
            "SUM(t.status != 'Concluída' AND t.prazo = ?) AS vencendo_hoje "
            f"FROM tarefas t JOIN usuarios u ON u.id = t.responsavel_id WHERE {tarefa} GROUP BY u.id ORDER BY total DESC",
            [hoje, hoje, hoje, *pt]))
        fim_calor = (date.today() + timedelta(days=13)).isoformat()
        calor = linhas(con.execute(
            "SELECT u.nome AS pessoa, t.prazo AS dia, COUNT(*) AS total FROM tarefas t JOIN usuarios u ON u.id = t.responsavel_id "
            f"WHERE {tarefa} AND t.status != 'Concluída' AND t.prazo BETWEEN ? AND ? GROUP BY u.id, t.prazo",
            [*pt, hoje, fim_calor]))
    for p in produtividade:
        p["produtividade"] = round(p["concluidas"] / p["total"] * 100, 1) if p["total"] else 0
    for t in proximas:
        t["atrasada"] = bool(t["prazo"] and t["prazo"] < hoje)
    return {
        "usuario": usuario,
        "produtividade": produtividade,
        "calor": calor,
        "contadores": contadores,
        "tarefas_por_status": por_status,
        "proximas_tarefas": proximas,
        "casos_recentes": casos,
        "proximas_reunioes": reunioes,
        "operacao": _resumo_operacao(usuario),
    }


@router.get("/tarefas")
def listar_tarefas(status: str = "", busca: str = "", usuario: dict = Depends(usuario_atual)):
    condicao, parametros = _tarefa_visivel(usuario)
    sql = (
        "SELECT t.*, r.nome AS responsavel, c.nome AS criador FROM tarefas t "
        "LEFT JOIN usuarios r ON r.id = t.responsavel_id LEFT JOIN usuarios c ON c.id = t.criado_por "
        f"WHERE {condicao}"
    )
    selecionados = lista_parametro(status)
    if selecionados:
        sql += f" AND t.status IN ({','.join('?' * len(selecionados))})"
        parametros += selecionados
    if busca.strip():
        sql += " AND t.titulo LIKE ?"
        parametros.append(f"%{busca.strip()}%")
    sql += " ORDER BY t.status = 'Concluída', t.prazo IS NULL, t.prazo"
    with conexao() as con:
        itens = linhas(con.execute(sql, parametros))
    hoje = date.today().isoformat()
    for t in itens:
        t["atrasada"] = bool(t["prazo"] and t["prazo"] < hoje and t["status"] != "Concluída")
    return itens


def _obter_tarefa(con, usuario: dict, tarefa_id: int) -> dict:
    condicao, parametros = _tarefa_visivel(usuario)
    tarefa = con.execute(
        "SELECT t.*, r.nome AS responsavel FROM tarefas t LEFT JOIN usuarios r ON r.id = t.responsavel_id "
        f"WHERE t.id = ? AND {condicao}", [tarefa_id, *parametros]).fetchone()
    if tarefa is None:
        raise HTTPException(404, "Tarefa não encontrada.")
    return dict(tarefa)


def _historico_tarefa(con, tarefa_id: int, usuario_id: int, tipo: str, texto: str) -> None:
    con.execute(
        "INSERT INTO tarefa_historico (tarefa_id, usuario_id, tipo, texto, em) VALUES (?, ?, ?, ?, ?)",
        (tarefa_id, usuario_id, tipo, texto, agora()),
    )


def _criar_tarefa(con, usuario: dict, titulo: str, descricao: str, responsavel_id, prazo, prioridade: str, origem: str) -> int:
    responsavel = responsavel_id or usuario["id"]
    _conferir_usuario(con, responsavel)
    momento = agora()
    cursor = con.execute(
        "INSERT INTO tarefas (titulo, descricao, responsavel_id, criado_por, prazo, prioridade, origem, criado_em, atualizado_em) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (titulo, descricao, responsavel, usuario["id"], prazo.isoformat() if prazo else None, prioridade, origem, momento, momento),
    )
    _historico_tarefa(con, cursor.lastrowid, usuario["id"], "criacao", f"Tarefa criada ({origem.lower()})")
    _auditar(con, usuario, "criar", "tarefa", cursor.lastrowid, titulo)
    return cursor.lastrowid


@router.post("/tarefas", status_code=201)
def criar_tarefa(entrada: TarefaNova, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        tarefa_id = _criar_tarefa(con, usuario, entrada.titulo.strip(), entrada.descricao, entrada.responsavel_id,
                                  entrada.prazo, entrada.prioridade, "Manual")
        return _obter_tarefa(con, usuario, tarefa_id)


@router.get("/tarefas/{tarefa_id}")
def detalhar_tarefa(tarefa_id: int, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        tarefa = _obter_tarefa(con, usuario, tarefa_id)
        tarefa["historico"] = linhas(con.execute(
            "SELECT h.tipo, h.texto, h.em, u.nome AS autor FROM tarefa_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id "
            "WHERE h.tarefa_id = ? ORDER BY h.em DESC, h.id DESC", (tarefa_id,)))
    return tarefa


@router.patch("/tarefas/{tarefa_id}")
def alterar_tarefa(tarefa_id: int, entrada: TarefaAlteracao, usuario: dict = Depends(usuario_atual)):
    mudancas = entrada.model_dump(exclude_unset=True)
    with conexao() as con:
        atual = _obter_tarefa(con, usuario, tarefa_id)
        campos, valores, registros = [], [], []
        for campo, valor in mudancas.items():
            if campo in ("titulo", "status", "prioridade") and valor is None:
                continue
            if isinstance(valor, date):
                valor = valor.isoformat()
            if valor == atual[campo]:
                continue
            if campo == "responsavel_id":
                _conferir_usuario(con, valor)
                registros.append(f"Responsável: {_nome_usuario(con, atual[campo])} → {_nome_usuario(con, valor)}")
            elif campo == "descricao":
                registros.append("Descrição atualizada")
            else:
                registros.append(f"{campo.capitalize()}: {atual[campo] or '-'} → {valor or '-'}")
            campos.append(f"{campo} = ?")
            valores.append(valor)
        if campos:
            con.execute(f"UPDATE tarefas SET {', '.join(campos)}, atualizado_em = ? WHERE id = ?", [*valores, agora(), tarefa_id])
            for texto in registros:
                _historico_tarefa(con, tarefa_id, usuario["id"], "alteracao", texto)
            _auditar(con, usuario, "alterar", "tarefa", tarefa_id, "; ".join(registros))
        return _obter_tarefa(con, usuario, tarefa_id)


@router.post("/tarefas/{tarefa_id}/comentarios", status_code=201)
def comentar_tarefa(tarefa_id: int, entrada: Texto, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        _obter_tarefa(con, usuario, tarefa_id)
        _historico_tarefa(con, tarefa_id, usuario["id"], "comentario", entrada.texto.strip())
    return {"ok": True}


@router.get("/casos")
def listar_casos(status: str = "", tipo: str = "", busca: str = "", usuario: dict = Depends(usuario_atual)):
    condicao, parametros = _caso_visivel(usuario)
    sql = (
        "SELECT c.*, p.nome AS pessoa, p.supervisor, u.nome AS responsavel FROM casos c "
        "JOIN pessoas p ON p.id = c.pessoa_id LEFT JOIN usuarios u ON u.id = c.responsavel_id "
        f"WHERE {condicao}"
    )
    for campo, valor in (("c.status", status), ("c.tipo", tipo)):
        selecionados = lista_parametro(valor)
        if selecionados:
            sql += f" AND {campo} IN ({','.join('?' * len(selecionados))})"
            parametros += selecionados
    if busca.strip():
        sql += " AND (c.titulo LIKE ? OR p.nome LIKE ?)"
        parametros += [f"%{busca.strip()}%"] * 2
    sql += " ORDER BY c.status = 'Encerrado', c.aberto_em DESC"
    with conexao() as con:
        return linhas(con.execute(sql, parametros))


def _obter_caso(con, usuario: dict, caso_id: int) -> dict:
    condicao, parametros = _caso_visivel(usuario)
    caso = con.execute(
        "SELECT c.*, p.nome AS pessoa, p.matricula, p.supervisor, p.coordenador, u.nome AS responsavel FROM casos c "
        "JOIN pessoas p ON p.id = c.pessoa_id LEFT JOIN usuarios u ON u.id = c.responsavel_id "
        f"WHERE c.id = ? AND {condicao}", [caso_id, *parametros]).fetchone()
    if caso is None:
        raise HTTPException(404, "Caso não encontrado.")
    return dict(caso)


@router.post("/casos", status_code=201)
def criar_caso(entrada: CasoNovo, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        pessoa = _pessoa_no_escopo(con, usuario, entrada.pessoa_id)
        responsavel = entrada.responsavel_id or usuario["id"]
        _conferir_usuario(con, responsavel)
        cursor = con.execute(
            "INSERT INTO casos (tipo, titulo, descricao, pessoa_id, responsavel_id, prioridade, aberto_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entrada.tipo, f"{entrada.tipo}: {pessoa['nome']}", entrada.descricao, pessoa["id"], responsavel,
             entrada.prioridade, date.today().isoformat()),
        )
        con.execute("INSERT INTO caso_historico (caso_id, usuario_id, texto, em) VALUES (?, ?, 'Caso aberto', ?)",
                    (cursor.lastrowid, usuario["id"], agora()))
        _auditar(con, usuario, "criar", "caso", cursor.lastrowid, entrada.tipo)
        return _obter_caso(con, usuario, cursor.lastrowid)


@router.get("/casos/{caso_id}")
def detalhar_caso(caso_id: int, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        caso = _obter_caso(con, usuario, caso_id)
        caso["historico"] = linhas(con.execute(
            "SELECT h.texto, h.em, u.nome AS autor FROM caso_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id "
            "WHERE h.caso_id = ? ORDER BY h.em DESC, h.id DESC", (caso_id,)))
        caso["medidas"] = linhas(con.execute(
            "SELECT id, tipo, data, motivo FROM medidas WHERE pessoa_id = ? ORDER BY data DESC", (caso["pessoa_id"],)))
    return caso


@router.patch("/casos/{caso_id}")
def alterar_caso(caso_id: int, entrada: CasoAlteracao, usuario: dict = Depends(usuario_atual)):
    mudancas = {k: v for k, v in entrada.model_dump(exclude_unset=True).items() if v is not None}
    with conexao() as con:
        atual = _obter_caso(con, usuario, caso_id)
        registros = []
        for campo, valor in mudancas.items():
            if valor == atual[campo]:
                continue
            if campo == "responsavel_id":
                _conferir_usuario(con, valor)
                registros.append(f"Responsável: {_nome_usuario(con, atual[campo])} → {_nome_usuario(con, valor)}")
            else:
                registros.append(f"{campo.capitalize()}: {atual[campo]} → {valor}")
            con.execute(f"UPDATE casos SET {campo} = ? WHERE id = ?", (valor, caso_id))
        if mudancas.get("status") and mudancas["status"] != atual["status"]:
            encerrado = date.today().isoformat() if mudancas["status"] == "Encerrado" else None
            con.execute("UPDATE casos SET encerrado_em = ? WHERE id = ?", (encerrado, caso_id))
        for texto in registros:
            con.execute("INSERT INTO caso_historico (caso_id, usuario_id, texto, em) VALUES (?, ?, ?, ?)",
                        (caso_id, usuario["id"], texto, agora()))
        if registros:
            _auditar(con, usuario, "alterar", "caso", caso_id, "; ".join(registros))
        return _obter_caso(con, usuario, caso_id)


@router.post("/casos/{caso_id}/historico", status_code=201)
def registrar_no_caso(caso_id: int, entrada: Texto, usuario: dict = Depends(usuario_atual)):
    with conexao() as con:
        _obter_caso(con, usuario, caso_id)
        con.execute("INSERT INTO caso_historico (caso_id, usuario_id, texto, em) VALUES (?, ?, ?, ?)",
                    (caso_id, usuario["id"], entrada.texto.strip(), agora()))
    return {"ok": True}


@router.get("/medidas")
def listar_medidas(pessoa_id: int | None = None, usuario: dict = Depends(usuario_atual)):
    escopo, parametros = filtro_escopo(usuario)
    sql = (
        "SELECT m.*, p.nome AS pessoa, p.supervisor, u.nome AS aplicada_por_nome FROM medidas m "
        "JOIN pessoas p ON p.id = m.pessoa_id LEFT JOIN usuarios u ON u.id = m.aplicada_por "
        f"WHERE {escopo}"
    )
    if pessoa_id is not None:
        sql += " AND m.pessoa_id = ?"
        parametros.append(pessoa_id)
    sql += " ORDER BY m.data DESC LIMIT 300"
    with conexao() as con:
        return linhas(con.execute(sql, parametros))


@router.get("/medidas/sugestao/{pessoa_id}")
def sugerir_medida(pessoa_id: int, usuario: dict = Depends(usuario_atual)):
    corte = (date.today() - timedelta(days=JANELA_MEDIDAS_DIAS)).isoformat()
    with conexao() as con:
        pessoa = _pessoa_no_escopo(con, usuario, pessoa_id)
        anteriores = linhas(con.execute(
            "SELECT tipo, data, motivo FROM medidas WHERE pessoa_id = ? AND data >= ? ORDER BY data DESC", (pessoa_id, corte)))
    niveis = [banco.TIPOS_MEDIDA.index(m["tipo"]) for m in anteriores if m["tipo"] in banco.TIPOS_MEDIDA]
    sugerida = banco.TIPOS_MEDIDA[min(max(niveis) + 1, len(banco.TIPOS_MEDIDA) - 1)] if niveis else banco.TIPOS_MEDIDA[0]
    return {"pessoa": pessoa, "janela_dias": JANELA_MEDIDAS_DIAS, "anteriores": anteriores, "sugerida": sugerida}


@router.post("/medidas", status_code=201)
def registrar_medida(entrada: MedidaNova, usuario: dict = Depends(usuario_atual)):
    if entrada.data > date.today():
        raise HTTPException(422, "A data da medida não pode estar no futuro.")
    with conexao() as con:
        pessoa = _pessoa_no_escopo(con, usuario, entrada.pessoa_id)
        if entrada.caso_id is not None:
            caso = _obter_caso(con, usuario, entrada.caso_id)
            if caso["pessoa_id"] != pessoa["id"]:
                raise HTTPException(422, "O caso informado é de outra pessoa.")
        cursor = con.execute(
            "INSERT INTO medidas (pessoa_id, tipo, data, motivo, caso_id, aplicada_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pessoa["id"], entrada.tipo, entrada.data.isoformat(), entrada.motivo.strip(), entrada.caso_id, usuario["id"], agora()),
        )
        if entrada.caso_id is not None:
            con.execute("INSERT INTO caso_historico (caso_id, usuario_id, texto, em) VALUES (?, ?, ?, ?)",
                        (entrada.caso_id, usuario["id"], f"Medida registrada: {entrada.tipo}", agora()))
        _auditar(con, usuario, "criar", "medida", cursor.lastrowid, f"{entrada.tipo} para {pessoa['nome']}")
    return {"id": cursor.lastrowid}


@router.get("/agenda")
def listar_agenda(de: date | None = None, ate: date | None = None, usuario: dict = Depends(usuario_atual)):
    inicio = de or (date.today() - timedelta(days=7))
    fim = ate or (date.today() + timedelta(days=30))
    condicao, parametros = _reuniao_visivel(usuario)
    with conexao() as con:
        reunioes = linhas(con.execute(
            f"SELECT r.*, u.nome AS organizador FROM reunioes r LEFT JOIN usuarios u ON u.id = r.criado_por "
            f"WHERE {condicao} AND substr(r.inicio, 1, 10) BETWEEN ? AND ? ORDER BY r.inicio",
            [*parametros, inicio.isoformat(), fim.isoformat()]))
        for reuniao in reunioes:
            reuniao["participantes"] = linhas(con.execute(
                "SELECT u.id, u.nome FROM reuniao_participantes rp JOIN usuarios u ON u.id = rp.usuario_id "
                "WHERE rp.reuniao_id = ? ORDER BY u.nome", (reuniao["id"],)))
            reuniao["decisoes"] = linhas(con.execute(
                "SELECT id, texto, tarefa_id, em FROM decisoes WHERE reuniao_id = ? ORDER BY em", (reuniao["id"],)))
    return reunioes


@router.post("/agenda", status_code=201)
def criar_reuniao(entrada: ReuniaoNova, usuario: dict = Depends(usuario_atual)):
    participantes = set(entrada.participantes) | {usuario["id"]}
    with conexao() as con:
        for participante in participantes:
            _conferir_usuario(con, participante)
        cursor = con.execute(
            "INSERT INTO reunioes (titulo, inicio, fim, local, pauta, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
            (entrada.titulo.strip(), entrada.inicio.isoformat(timespec="minutes"), entrada.fim.isoformat(timespec="minutes"),
             entrada.local, entrada.pauta, usuario["id"]),
        )
        con.executemany("INSERT INTO reuniao_participantes (reuniao_id, usuario_id) VALUES (?, ?)",
                        [(cursor.lastrowid, p) for p in participantes])
        _auditar(con, usuario, "criar", "reuniao", cursor.lastrowid, entrada.titulo)
    return {"id": cursor.lastrowid}


@router.post("/agenda/{reuniao_id}/decisoes", status_code=201)
def registrar_decisao(reuniao_id: int, entrada: DecisaoNova, usuario: dict = Depends(usuario_atual)):
    condicao, parametros = _reuniao_visivel(usuario)
    with conexao() as con:
        reuniao = con.execute(f"SELECT r.* FROM reunioes r WHERE r.id = ? AND {condicao}", [reuniao_id, *parametros]).fetchone()
        if reuniao is None:
            raise HTTPException(404, "Reunião não encontrada.")
        tarefa_id = None
        if entrada.gerar_tarefa:
            tarefa_id = _criar_tarefa(con, usuario, entrada.texto.strip()[:120], f"Decisão da reunião: {reuniao['titulo']}",
                                      entrada.responsavel_id, entrada.prazo, "Média", "Reunião")
        cursor = con.execute("INSERT INTO decisoes (reuniao_id, texto, tarefa_id, em) VALUES (?, ?, ?, ?)",
                             (reuniao_id, entrada.texto.strip(), tarefa_id, agora()))
    return {"id": cursor.lastrowid, "tarefa_id": tarefa_id}


@router.get("/pessoas")
def buscar_pessoas(busca: str = "", usuario: dict = Depends(usuario_atual)):
    escopo, parametros = filtro_escopo(usuario)
    sql = f"SELECT p.* FROM pessoas p WHERE {escopo}"
    if busca.strip():
        sql += " AND (p.nome LIKE ? OR p.matricula LIKE ?)"
        parametros += [f"%{busca.strip()}%"] * 2
    sql += " ORDER BY p.nome LIMIT 30"
    with conexao() as con:
        return linhas(con.execute(sql, parametros))


@router.get("/equipes")
def equipes(usuario: dict = Depends(usuario_atual)):
    base = obter_base()
    corte = (base.hoje - timedelta(days=30)).isoformat()
    escopo, parametros = filtro_escopo(usuario)
    with conexao() as con:
        casos = {
            r["supervisor"]: r["total"] for r in con.execute(
                f"SELECT p.supervisor, COUNT(*) AS total FROM casos c JOIN pessoas p ON p.id = c.pessoa_id "
                f"WHERE {escopo} AND c.status != 'Encerrado' GROUP BY p.supervisor", parametros)
        }
    contagem = {}
    for c in base.quadro:
        item = contagem.setdefault(c["supervisor"], {"ativos": 0, "desligados_30d": 0})
        if c["situacao"] != "Desligado":
            item["ativos"] += 1
        elif c["data_desligamento"] >= corte:
            item["desligados_30d"] += 1
    arvore = {}
    for s in base.supervisores:
        if not _no_escopo_base(usuario, {"gerente": s["gerente"], "coordenador": s["coordenador"], "supervisor": s["nome"]}):
            continue
        gerente = arvore.setdefault(s["gerente"], {"nome": s["gerente"], "coordenadores": {}})
        coordenador = gerente["coordenadores"].setdefault(
            s["coordenador"], {"nome": s["coordenador"], "servico": s["servico"], "supervisores": []})
        coordenador["supervisores"].append({
            "nome": s["nome"],
            **contagem.get(s["nome"], {"ativos": 0, "desligados_30d": 0}),
            "casos_abertos": casos.get(s["nome"], 0),
        })
    return [
        {"nome": g["nome"], "coordenadores": list(g["coordenadores"].values())} for g in arvore.values()
    ]


@router.get("/busca")
def buscar(q: str = "", usuario: dict = Depends(usuario_atual)):
    termo = q.strip()
    if len(termo) < 2:
        return {"tarefas": [], "casos": [], "pessoas": []}
    curinga = f"%{termo}%"
    tarefa, pt = _tarefa_visivel(usuario)
    caso, pc = _caso_visivel(usuario)
    escopo, pe = filtro_escopo(usuario)
    with conexao() as con:
        return {
            "tarefas": linhas(con.execute(
                f"SELECT t.id, t.titulo, t.status, t.prazo FROM tarefas t WHERE {tarefa} AND t.titulo LIKE ? LIMIT 8", [*pt, curinga])),
            "casos": linhas(con.execute(
                f"SELECT c.id, c.titulo, c.status FROM casos c JOIN pessoas p ON p.id = c.pessoa_id "
                f"WHERE {caso} AND (c.titulo LIKE ? OR p.nome LIKE ?) LIMIT 8", [*pc, curinga, curinga])),
            "pessoas": linhas(con.execute(
                f"SELECT p.id, p.nome, p.matricula, p.supervisor FROM pessoas p WHERE {escopo} "
                "AND (p.nome LIKE ? OR p.matricula LIKE ?) LIMIT 8", [*pe, curinga, curinga])),
        }


@router.get("/monitoramento")
def monitoramento(usuario: dict = Depends(exigir_admin)):
    return cargas.servico.status()


@router.post("/monitoramento/extracoes", status_code=202)
def solicitar_extracao(entrada: Extracao, usuario: dict = Depends(exigir_admin)):
    try:
        posicao = cargas.servico.solicitar(entrada.tipo)
    except ValueError as erro:
        raise HTTPException(422, str(erro)) from erro
    with conexao() as con:
        _auditar(con, usuario, "solicitar", "extracao", None, entrada.tipo)
    return {"posicao": posicao}


@router.get("/auditoria")
def listar_auditoria(usuario: dict = Depends(exigir_admin)):
    with conexao() as con:
        return linhas(con.execute(
            "SELECT a.*, u.nome AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id "
            "ORDER BY a.em DESC, a.id DESC LIMIT 200"))
