import { api, aviso, cabecalhoPagina, campo, cartao, el, fmt, icone, modal, selecao, tabela } from "/design-system/ui.js";
import {
  PRIORIDADES, STATUS_CASO, TIPOS_CASO, linhaTempo, seletorPessoa, seletorUsuario, seloPrioridade, seloStatusCaso,
} from "/exo/componentes.js";
import { abrirNovaMedida } from "/exo/paginas/medidas.js";

const estado = { status: "Aberto,Em acompanhamento", tipo: "" };

function abrirNovoCaso(contexto, aoSalvar) {
  let pessoa = null;
  const tipo = selecao(TIPOS_CASO);
  const prioridade = selecao(PRIORIDADES, "Média");
  const responsavel = seletorUsuario(contexto.usuarios, contexto.usuario.id);
  const descricao = el("textarea", { classe: "area-texto", maxlength: 2000 });
  const salvar = el("button", { classe: "btn principal", type: "button" }, "Abrir caso");
  const janela = modal({
    titulo: "Novo acompanhamento",
    conteudo: el("div", { classe: "formulario" }, [
      seletorPessoa({ aoEscolher: (p) => { pessoa = p; } }),
      el("div", { classe: "formulario-linha" }, [campo("Tipo", tipo), campo("Prioridade", prioridade)]),
      campo("Responsável", responsavel),
      campo("Descrição", descricao),
    ]),
    acoes: [el("button", { classe: "btn", type: "button", onclick: () => janela.fechar() }, "Cancelar"), salvar],
  });
  salvar.addEventListener("click", async () => {
    if (!pessoa) {
      aviso("Escolha a pessoa envolvida.", "erro");
      return;
    }
    salvar.disabled = true;
    try {
      await api("/api/exo/casos", {
        metodo: "POST",
        corpo: { pessoa_id: pessoa.id, tipo: tipo.value, prioridade: prioridade.value, responsavel_id: Number(responsavel.value), descricao: descricao.value.trim() },
      });
      janela.fechar();
      aviso("Acompanhamento aberto.");
      aoSalvar();
    } catch (erro) {
      aviso(erro.message, "erro");
      salvar.disabled = false;
    }
  });
}

async function abrirCaso(id, contexto, aoAlterar) {
  const caso = await api(`/api/exo/casos/${id}`);
  const status = selecao(STATUS_CASO, caso.status);
  const prioridade = selecao(PRIORIDADES, caso.prioridade);
  const responsavel = seletorUsuario(contexto.usuarios, caso.responsavel_id);
  const anotacao = el("textarea", { classe: "area-texto", placeholder: "Registre um acompanhamento", maxlength: 2000 });
  const historico = el("div", {}, linhaTempo(caso.historico));
  const medidas = el("div");

  function desenharMedidas(lista) {
    medidas.replaceChildren(lista.length
      ? el("div", { classe: "lista" }, lista.map((m) => el("div", { classe: "lista-item" }, [
        el("div", {}, [el("span", { texto: m.tipo }), el("small", { texto: m.motivo })]),
        el("span", { classe: "texto-secundario", texto: fmt.data(m.data) }),
      ])))
      : el("p", { classe: "texto-secundario", texto: "Nenhuma medida registrada para esta pessoa." }));
  }

  async function recarregar() {
    const atual = await api(`/api/exo/casos/${id}`);
    historico.replaceChildren(linhaTempo(atual.historico));
    desenharMedidas(atual.medidas);
    aoAlterar();
  }

  async function salvar() {
    try {
      await api(`/api/exo/casos/${id}`, {
        metodo: "PATCH",
        corpo: { status: status.value, prioridade: prioridade.value, responsavel_id: Number(responsavel.value) },
      });
      aviso("Acompanhamento atualizado.");
      await recarregar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  async function anotar() {
    if (!anotacao.value.trim()) return;
    try {
      await api(`/api/exo/casos/${id}/historico`, { metodo: "POST", corpo: { texto: anotacao.value.trim() } });
      anotacao.value = "";
      await recarregar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  desenharMedidas(caso.medidas);
  modal({
    titulo: caso.titulo,
    largo: true,
    conteudo: [
      el("dl", { classe: "detalhe" }, [
        el("dt", { texto: "Pessoa" }), el("dd", { texto: `${caso.pessoa} · ${caso.matricula}` }),
        el("dt", { texto: "Supervisão" }), el("dd", { texto: caso.supervisor }),
        el("dt", { texto: "Aberto em" }), el("dd", { texto: fmt.data(caso.aberto_em) }),
        caso.encerrado_em ? el("dt", { texto: "Encerrado em" }) : null,
        caso.encerrado_em ? el("dd", { texto: fmt.data(caso.encerrado_em) }) : null,
      ]),
      caso.descricao ? el("p", { texto: caso.descricao }) : null,
      el("div", { classe: "formulario-linha" }, [campo("Status", status), campo("Prioridade", prioridade)]),
      campo("Responsável", responsavel),
      el("div", { classe: "intro-acoes", estilo: { marginLeft: "0" } }, [
        el("button", { classe: "btn principal", type: "button", onclick: salvar }, [icone("device-floppy"), "Salvar alterações"]),
        el("button", {
          classe: "btn", type: "button",
          onclick: () => abrirNovaMedida(contexto, recarregar, { pessoa: { id: caso.pessoa_id, nome: caso.pessoa, matricula: caso.matricula, supervisor: caso.supervisor }, casoId: caso.id }),
        }, [icone("gavel"), "Registrar medida"]),
      ]),
      el("h3", { texto: "Medidas da pessoa" }),
      medidas,
      el("h3", { texto: "Acompanhamento" }),
      campo("Nova anotação", anotacao),
      el("div", {}, el("button", { classe: "btn", type: "button", onclick: anotar }, [icone("notes"), "Registrar"])),
      historico,
    ].filter(Boolean),
  });
}

export async function renderCasos(conteudo, contexto, parametros) {
  const area = el("div", { classe: "grade" });

  async function carregar() {
    const busca = new URLSearchParams({ status: estado.status, tipo: estado.tipo });
    const casos = await api(`/api/exo/casos?${busca}`);
    area.replaceChildren(cartao({
      corpo: tabela({
        colunas: [
          { chave: "titulo", titulo: "Caso" },
          { chave: "supervisor", titulo: "Supervisão" },
          { chave: "responsavel", titulo: "Responsável" },
          { chave: "aberto_em", titulo: "Aberto em", formato: fmt.data },
          { chave: "prioridade", titulo: "Prioridade", render: seloPrioridade },
          { chave: "status", titulo: "Status", render: seloStatusCaso },
        ],
        linhas: casos,
        exportar: "casos.csv",
        textoVazio: "Nenhum caso para este filtro.",
        aoClicar: (c) => abrirCaso(c.id, contexto, carregar).catch((e) => aviso(e.message, "erro")),
      }),
    }));
  }

  const recarregar = () => carregar().catch((e) => aviso(e.message, "erro"));
  const filtroStatus = selecao([["Aberto,Em acompanhamento", "Em aberto"], ["", "Todos"], ...STATUS_CASO.map((s) => [s, s])], estado.status, {
    "aria-label": "Filtrar por status", estilo: { width: "170px" },
    onchange: (e) => { estado.status = e.target.value; recarregar(); },
  });
  const filtroTipo = selecao([["", "Todos os tipos"], ...TIPOS_CASO.map((t) => [t, t])], estado.tipo, {
    "aria-label": "Filtrar por tipo", estilo: { width: "180px" },
    onchange: (e) => { estado.tipo = e.target.value; recarregar(); },
  });

  conteudo.replaceChildren(
    cabecalhoPagina("Acompanhamentos", "Acompanhamento individual de pessoas da sua equipe, com histórico e medidas vinculadas.",
      el("div", { classe: "intro-acoes" }, [
        filtroStatus, filtroTipo,
        el("button", { classe: "btn principal", type: "button", onclick: () => abrirNovoCaso(contexto, recarregar) }, [icone("plus"), "Novo acompanhamento"]),
      ])),
    area,
  );
  await carregar();
  const abrir = parametros.get("abrir");
  if (abrir) abrirCaso(Number(abrir), contexto, recarregar).catch((e) => aviso(e.message, "erro"));
}
