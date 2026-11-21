import random
from datetime import date, datetime, time, timedelta

from app import config
from app.dados.estado import obter_base
from app.modulos.exo import seguranca
from app.modulos.exo.conexao import agora, conexao

SCHEMA = """
CREATE TABLE IF NOT EXISTS pessoas (
    id INTEGER PRIMARY KEY,
    matricula TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    cargo TEXT,
    servico TEXT,
    gerente TEXT,
    coordenador TEXT,
    supervisor TEXT
);
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    login TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('admin', 'gestor')),
    nivel TEXT NOT NULL CHECK (nivel IN ('diretoria', 'gerente', 'coordenador', 'supervisor')),
    escopo TEXT,
    senha_hash TEXT NOT NULL,
    sal TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tarefas (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    responsavel_id INTEGER REFERENCES usuarios(id),
    criado_por INTEGER REFERENCES usuarios(id),
    prazo TEXT,
    prioridade TEXT NOT NULL DEFAULT 'Média',
    status TEXT NOT NULL DEFAULT 'A fazer',
    origem TEXT NOT NULL DEFAULT 'Manual',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tarefa_historico (
    id INTEGER PRIMARY KEY,
    tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    tipo TEXT NOT NULL,
    texto TEXT NOT NULL,
    em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS casos (
    id INTEGER PRIMARY KEY,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    pessoa_id INTEGER REFERENCES pessoas(id),
    responsavel_id INTEGER REFERENCES usuarios(id),
    status TEXT NOT NULL DEFAULT 'Aberto',
    prioridade TEXT NOT NULL DEFAULT 'Média',
    aberto_em TEXT NOT NULL,
    encerrado_em TEXT
);
CREATE TABLE IF NOT EXISTS caso_historico (
    id INTEGER PRIMARY KEY,
    caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    texto TEXT NOT NULL,
    em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS medidas (
    id INTEGER PRIMARY KEY,
    pessoa_id INTEGER NOT NULL REFERENCES pessoas(id),
    tipo TEXT NOT NULL,
    data TEXT NOT NULL,
    motivo TEXT NOT NULL,
    caso_id INTEGER REFERENCES casos(id),
    aplicada_por INTEGER REFERENCES usuarios(id),
    criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reunioes (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    inicio TEXT NOT NULL,
    fim TEXT NOT NULL,
    local TEXT NOT NULL DEFAULT '',
    pauta TEXT NOT NULL DEFAULT '',
    criado_por INTEGER REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS reuniao_participantes (
    reuniao_id INTEGER NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    PRIMARY KEY (reuniao_id, usuario_id)
);
CREATE TABLE IF NOT EXISTS decisoes (
    id INTEGER PRIMARY KEY,
    reuniao_id INTEGER NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    tarefa_id INTEGER REFERENCES tarefas(id),
    em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    detalhe TEXT NOT NULL DEFAULT '',
    em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pessoas_supervisor ON pessoas(supervisor);
CREATE INDEX IF NOT EXISTS ix_tarefas_responsavel ON tarefas(responsavel_id, status);
CREATE INDEX IF NOT EXISTS ix_casos_pessoa ON casos(pessoa_id, status);
CREATE INDEX IF NOT EXISTS ix_medidas_pessoa ON medidas(pessoa_id, data);
"""

USUARIOS_DEMO = (
    ("admin", "Administrador", "admin", "diretoria", None),
    ("gerente1", "Gerente 1", "gestor", "gerente", "Gerente 1"),
    ("coordenador1", "Coordenador 1", "gestor", "coordenador", "Coordenador 1"),
    ("supervisor1", "Supervisor 1", "gestor", "supervisor", "Supervisor 1"),
)
TITULOS_TAREFAS = (
    "Revisar escala da próxima semana",
    "Consolidar indicadores de absenteísmo",
    "Conduzir feedback individual com a equipe",
    "Conferir desligamentos do mês",
    "Atualizar quadro de vagas",
    "Preparar ritual de resultados",
    "Validar banco de horas",
    "Organizar integração da turma de novatos",
    "Revisar ocorrências de interjornada",
    "Enviar plano de ação de qualidade",
)
STATUS_TAREFA = ("A fazer", "Em andamento", "Aguardando", "Concluída")
PRIORIDADES = ("Baixa", "Média", "Alta")
TIPOS_CASO = ("Absenteísmo", "Conduta", "Desempenho", "Saúde e bem-estar", "Jornada")
STATUS_CASO = ("Aberto", "Em acompanhamento", "Encerrado")
TIPOS_MEDIDA = ("Orientação verbal", "Advertência escrita", "Suspensão")
REUNIOES = (
    "Alinhamento semanal da coordenação",
    "Ritual de resultados",
    "Acompanhamento de novatos",
    "Revisão de indicadores",
    "Comitê de casos",
    "Planejamento de escala",
)


def preparar() -> None:
    config.PASTA_VAR.mkdir(parents=True, exist_ok=True)
    with conexao() as con:
        con.executescript(SCHEMA)
        if con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0:
            _popular(con)


def _popular(con) -> None:
    rng = random.Random(config.SEMENTE + 2)
    hoje = date.today()
    base = obter_base()

    con.executemany(
        "INSERT INTO pessoas (matricula, nome, cargo, servico, gerente, coordenador, supervisor) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(c["matricula"], c["nome"], c["cargo"], c["servico"], c["gerente"], c["coordenador"], c["supervisor"])
         for c in base.ativos()],
    )
    for login, nome, papel, nivel, escopo in USUARIOS_DEMO:
        senha_hash, sal = seguranca.gerar_hash(config.SENHA_DEMO)
        con.execute(
            "INSERT INTO usuarios (login, nome, papel, nivel, escopo, senha_hash, sal) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (login, nome, papel, nivel, escopo, senha_hash, sal),
        )
    usuarios = [r[0] for r in con.execute("SELECT id FROM usuarios ORDER BY id")]
    equipe_demo = [r[0] for r in con.execute("SELECT id FROM pessoas WHERE supervisor = 'Supervisor 1'")]
    todas = [r[0] for r in con.execute("SELECT id FROM pessoas")]

    for i in range(24):
        criado = datetime.combine(hoje - timedelta(days=rng.randint(1, 20)), time(rng.randint(8, 17), 0))
        status = rng.choices(STATUS_TAREFA, weights=(4, 3, 1, 3))[0]
        responsavel = usuarios[i % len(usuarios)]
        cursor = con.execute(
            "INSERT INTO tarefas (titulo, descricao, responsavel_id, criado_por, prazo, prioridade, status, criado_em, atualizado_em) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (rng.choice(TITULOS_TAREFAS), "", responsavel, rng.choice(usuarios),
             (hoje + timedelta(days=rng.randint(-5, 14))).isoformat(), rng.choice(PRIORIDADES), status,
             criado.isoformat(timespec="seconds"), criado.isoformat(timespec="seconds")),
        )
        con.execute(
            "INSERT INTO tarefa_historico (tarefa_id, usuario_id, tipo, texto, em) VALUES (?, ?, 'criacao', 'Tarefa criada', ?)",
            (cursor.lastrowid, responsavel, criado.isoformat(timespec="seconds")),
        )

    for i in range(16):
        pessoa = rng.choice(equipe_demo if i % 2 == 0 and equipe_demo else todas)
        tipo = rng.choice(TIPOS_CASO)
        aberto = hoje - timedelta(days=rng.randint(1, 45))
        status = rng.choices(STATUS_CASO, weights=(3, 3, 2))[0]
        nome = con.execute("SELECT nome FROM pessoas WHERE id = ?", (pessoa,)).fetchone()[0]
        cursor = con.execute(
            "INSERT INTO casos (tipo, titulo, descricao, pessoa_id, responsavel_id, status, prioridade, aberto_em, encerrado_em) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tipo, f"{tipo}: {nome}", "Caso de demonstração gerado com dados fictícios.", pessoa,
             rng.choice(usuarios[1:]), status, rng.choice(PRIORIDADES), aberto.isoformat(),
             (aberto + timedelta(days=rng.randint(1, 10))).isoformat() if status == "Encerrado" else None),
        )
        con.execute(
            "INSERT INTO caso_historico (caso_id, usuario_id, texto, em) VALUES (?, ?, 'Caso aberto', ?)",
            (cursor.lastrowid, usuarios[0], f"{aberto.isoformat()}T09:00:00"),
        )

    for _ in range(14):
        pessoa = rng.choice(equipe_demo or todas)
        data_medida = hoje - timedelta(days=rng.randint(1, 120))
        con.execute(
            "INSERT INTO medidas (pessoa_id, tipo, data, motivo, aplicada_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
            (pessoa, rng.choices(TIPOS_MEDIDA, weights=(5, 3, 1))[0], data_medida.isoformat(),
             rng.choice(("Atrasos recorrentes", "Ausência sem justificativa", "Descumprimento de procedimento")),
             rng.choice(usuarios[1:]), agora()),
        )

    for i, titulo in enumerate(REUNIOES):
        inicio = datetime.combine(hoje + timedelta(days=i - 2), time(rng.choice((9, 10, 14, 16)), 0))
        cursor = con.execute(
            "INSERT INTO reunioes (titulo, inicio, fim, local, pauta, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
            (titulo, inicio.isoformat(timespec="minutes"), (inicio + timedelta(hours=1)).isoformat(timespec="minutes"),
             rng.choice(("Sala 1", "Sala 2", "On-line")), "Pauta de demonstração.", usuarios[0]),
        )
        for usuario in rng.sample(usuarios, k=rng.randint(2, len(usuarios))):
            con.execute("INSERT INTO reuniao_participantes (reuniao_id, usuario_id) VALUES (?, ?)", (cursor.lastrowid, usuario))
