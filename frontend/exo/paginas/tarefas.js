import { api, aviso, cabecalhoPagina, campo, cartao, el, fmt, icone, modal, selecao, tabela } from "/design-system/ui.js";
import {
  PRIORIDADES, STATUS_TAREFA, linhaTempo, prazoTexto, seletorUsuario, seloPrioridade, seloStatusTarefa,
} from "/exo/componentes.js";

const estado = { status: "abertas" };
const FILTROS_STATUS = [["abertas", "Em aberto"], ["", "Todas"], ...STATUS_TAREFA.map((s) => [s, s])];

function parametroStatus() {
  if (estado.status === "abertas") return STATUS_TAREFA.filter((s) => s !== "Concluída").join(",");
  return estado.status;
}

export function abrirNovaTarefa(contexto, aoSalvar, valores = {}) {
  const titulo = el("input", { classe: "entrada", maxlength: 120, valor: valores.titulo || "" });
  const descricao = el("textarea", { classe: "area-texto", maxlength: 2000 });
  const responsavel = seletorUsuario(contexto.usuarios, contexto.usuario.id);
  const prazo = el("input", { classe: "entrada", type: "date" });
  const prioridade = selecao(PRIORIDADES, "Média");
  const salvar = el("button", { classe: "btn principal", type: "button" }, "Criar tarefa");
  const janela = modal({
    titulo: "Nova tarefa",
    conteudo: el("div", { classe: "formulario" }, [
      campo("Título", titulo),
      campo("Descrição", descricao),
      el("div", { classe: "formulario-linha" }, [campo("Responsável", responsavel), campo("Prazo", prazo)]),
      campo("Prioridade", prioridade),
    ]),
    acoes: [el("button", { classe: "btn", type: "button", onclick: () => janela.fechar() }, "Cancelar"), salvar],
  });
  salvar.addEventListener("click", async () => {
    salvar.disabled = true;
    try {
      await api("/api/exo/tarefas", {
        metodo: "POST",
        corpo: {
          titulo: titulo.value.trim(), descricao: descricao.value.trim(), responsavel_id: Number(responsavel.value),
          prazo: prazo.value || null, prioridade: prioridade.value,
        },
      });
      janela.fechar();
      aviso("Tarefa criada.");
      aoSalvar();
    } catch (erro) {
      aviso(erro.message, "erro");
      salvar.disabled = false;
    }
  });
}

export async function abrirTarefa(id, contexto, aoAlterar) {
  const tarefa = await api(`/api/exo/tarefas/${id}`);
  const status = selecao(STATUS_TAREFA, tarefa.status);
  const responsavel = seletorUsuario(contexto.usuarios, tarefa.responsavel_id);
  const prazo = el("input", { classe: "entrada", type: "date", valor: tarefa.prazo || "" });
  const prioridade = selecao(PRIORIDADES, tarefa.prioridade);
  const comentario = el("textarea", { classe: "area-texto", placeholder: "Escreva um comentário", maxlength: 2000 });
  const historico = el("div", {}, linhaTempo(tarefa.historico));

  async function recarregarHistorico() {
    const atual = await api(`/api/exo/tarefas/${id}`);
    historico.replaceChildren(linhaTempo(atual.historico));
  }

  async function salvar() {
    try {
      await api(`/api/exo/tarefas/${id}`, {
        metodo: "PATCH",
        corpo: { status: status.value, responsavel_id: Number(responsavel.value), prazo: prazo.value || null, prioridade: prioridade.value },
      });
      aviso("Tarefa atualizada.");
      await recarregarHistorico();
      aoAlterar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  async function comentar() {
    if (!comentario.value.trim()) return;
    try {
      await api(`/api/exo/tarefas/${id}/comentarios`, { metodo: "POST", corpo: { texto: comentario.value.trim() } });
      comentario.value = "";
      await recarregarHistorico();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  modal({
    titulo: tarefa.titulo,
    largo: true,
    conteudo: [
      tarefa.descricao ? el("p", { texto: tarefa.descricao }) : null,
      el("p", { classe: "texto-secundario", texto: `Origem: ${tarefa.origem} · criada em ${fmt.dataHora(tarefa.criado_em)}` }),
      el("div", { classe: "formulario-linha" }, [campo("Status", status), campo("Responsável", responsavel)]),
      el("div", { classe: "formulario-linha" }, [campo("Prazo", prazo), campo("Prioridade", prioridade)]),
      el("div", {}, el("button", { classe: "btn principal", type: "button", onclick: salvar }, [icone("device-floppy"), "Salvar alterações"])),
      el("h3", { texto: "Comentários e histórico" }),
      campo("Novo comentário", comentario),
      el("div", {}, el("button", { classe: "btn", type: "button", onclick: comentar }, [icone("message"), "Comentar"])),
      historico,
    ].filter(Boolean),
  });
}

export async function renderTarefas(conteudo, contexto, parametros) {
  const area = el("div", { classe: "grade" });

  async function carregar() {
    const busca = new URLSearchParams({ status: parametroStatus() });
    const tarefas = await api(`/api/exo/tarefas?${busca}`);
    area.replaceChildren(cartao({
      corpo: tabela({
        colunas: [
          { chave: "titulo", titulo: "Tarefa" },
          { chave: "responsavel", titulo: "Responsável" },
          { chave: "prazo", titulo: "Prazo", render: (v, l) => prazoTexto(v, l.atrasada) },
          { chave: "prioridade", titulo: "Prioridade", render: seloPrioridade },
          { chave: "status", titulo: "Status", render: seloStatusTarefa },
          { chave: "origem", titulo: "Origem" },
        ],
        linhas: tarefas,
        textoVazio: "Nenhuma tarefa para este filtro.",
        aoClicar: (t) => abrirTarefa(t.id, contexto, carregar).catch((e) => aviso(e.message, "erro")),
      }),
    }));
  }

  const filtro = selecao(FILTROS_STATUS, estado.status, {
    "aria-label": "Filtrar por status",
    estilo: { width: "180px" },
    onchange: (e) => { estado.status = e.target.value; carregar().catch((erro) => aviso(erro.message, "erro")); },
  });

  conteudo.replaceChildren(
    cabecalhoPagina("Tarefas", "Suas tarefas e as que você delegou. Decisões de reunião também viram tarefas aqui.",
      el("div", { classe: "intro-acoes" }, [
        filtro,
        el("button", { classe: "btn principal", type: "button", onclick: () => abrirNovaTarefa(contexto, carregar) }, [icone("plus"), "Nova tarefa"]),
      ])),
    area,
  );
  await carregar();
  const abrir = parametros.get("abrir");
  if (abrir) abrirTarefa(Number(abrir), contexto, carregar).catch((e) => aviso(e.message, "erro"));
}
