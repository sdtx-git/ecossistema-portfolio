import {
  api, aviso, blocoErro, botao, botaoCargas, botaoTema, campo, carregando, el, fmt, icone, iniciarTema, kpis, marca, modal, rodape, selecao,
} from "/design-system/ui.js";

iniciarTema();

const INTERVALO_STATUS_MS = 30000;
const ROTULOS_STATUS = { online: "Online", manutencao: "Em manutenção", desconhecido: "Sem verificação" };
const ROTULOS_CARGAS = { ok: "Em dia", atrasada: "Atrasada", circuito_aberto: "Pausada", aguardando: "Aguardando" };

const estado = { links: [], status: { links: {}, cargas: null } };
const raiz = document.getElementById("app");
const corpo = el("main", { classe: "hub" });

function abrirFormulario(link = null) {
  const nome = el("input", { classe: "entrada", valor: link?.nome || "", maxlength: 60, required: true });
  const descricao = el("input", { classe: "entrada", valor: link?.descricao || "", maxlength: 160 });
  const categoria = el("input", { classe: "entrada", valor: link?.categoria || "Links externos", maxlength: 40, required: true });
  const tipo = selecao([["externo", "Externo (URL completa)"], ["interno", "Interno (caminho neste servidor)"]], link?.tipo || "externo");
  const destino = el("input", { classe: "entrada", valor: link?.destino || "", placeholder: "https://… ou /caminho/", required: true });
  const iconeCampo = el("input", { classe: "entrada", valor: link?.icone || "link", maxlength: 40 });
  const manutencao = el("input", { type: "checkbox", checked: Boolean(link?.manutencao) });
  const salvar = botao(link ? "Salvar alterações" : "Adicionar link", { principal: true });

  const janela = modal({
    titulo: link ? "Editar link" : "Novo link",
    conteudo: el("div", { classe: "formulario" }, [
      campo("Nome", nome),
      campo("Descrição", descricao),
      el("div", { classe: "formulario-linha" }, [campo("Categoria", categoria), campo("Tipo", tipo)]),
      campo("Destino", destino),
      el("div", { classe: "formulario-linha" }, [
        campo("Ícone (Tabler Icons)", iconeCampo),
        el("label", { classe: "marcador", estilo: { alignSelf: "end", height: "38px" } }, [manutencao, "Em manutenção"]),
      ]),
    ]),
    acoes: [
      link ? botao("Excluir", { icone: "trash", onclick: excluir }) : null,
      botao("Cancelar", { onclick: () => janela.fechar() }),
      salvar,
    ].filter(Boolean),
  });

  salvar.addEventListener("click", async () => {
    salvar.disabled = true;
    try {
      const corpoLink = {
        nome: nome.value.trim(), descricao: descricao.value.trim(), categoria: categoria.value.trim(),
        tipo: tipo.value, destino: destino.value.trim(), icone: iconeCampo.value.trim() || "link", manutencao: manutencao.checked,
      };
      await api(link ? `/api/hub/links/${link.id}` : "/api/hub/links", { metodo: link ? "PUT" : "POST", corpo: corpoLink });
      janela.fechar();
      aviso(link ? "Link atualizado." : "Link adicionado.");
      await carregar();
    } catch (erro) {
      aviso(erro.message, "erro");
      salvar.disabled = false;
    }
  });

  async function excluir() {
    if (!window.confirm(`Excluir o link "${link.nome}"?`)) return;
    try {
      await api(`/api/hub/links/${link.id}`, { metodo: "DELETE" });
      janela.fechar();
      aviso("Link excluído.");
      await carregar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }
}

function botaoEditar(link) {
  return el("button", {
    classe: "btn fantasma pequeno icone hub-editar", type: "button", title: `Editar ${link.nome}`, "aria-label": `Editar ${link.nome}`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); abrirFormulario(link); },
  }, icone("pencil"));
}

function cartaoSistema(link) {
  const situacao = estado.status.links[link.id] || "desconhecido";
  return el("a", { classe: "hub-sistema", href: link.destino }, [
    botaoEditar(link),
    el("span", { classe: "hub-sistema-icone" }, icone(link.icone || "app-window")),
    el("div", {}, [el("h3", { texto: link.nome }), link.descricao ? el("p", { texto: link.descricao }) : null]),
    el("div", { classe: "hub-sistema-rodape" }, [
      el("span", { classe: `hub-status ${situacao}`, texto: ROTULOS_STATUS[situacao] }),
      icone("arrow-right"),
    ]),
  ]);
}

function chipExterno(link) {
  return el("a", { classe: "hub-chip", href: link.destino, target: "_blank", rel: "noopener noreferrer", title: link.descricao || link.destino }, [
    icone(link.icone || "external-link"), link.nome, botaoEditar(link),
  ]);
}

function desenhar() {
  const cargas = estado.status.cargas;
  const situacoes = Object.values(estado.status.links);
  const online = situacoes.filter((s) => s === "online").length;
  const manutencao = situacoes.filter((s) => s === "manutencao").length;
  const categorias = [...new Set(estado.links.map((l) => l.categoria))];

  corpo.replaceChildren(
    kpis([
      { rotulo: "Sistemas online", valor: `${fmt.numero(online)} de ${fmt.numero(situacoes.length)}`, detalhe: "Verificação a cada 30 segundos" },
      { rotulo: "Em manutenção", valor: fmt.numero(manutencao), tom: manutencao ? "alerta" : "" },
      { rotulo: "Cargas automáticas", valor: cargas ? ROTULOS_CARGAS[cargas.situacao] || cargas.situacao : "-", tom: cargas && cargas.situacao !== "ok" && cargas.situacao !== "aguardando" ? "critico" : "", detalhe: cargas?.ultima_rodada ? `Última rodada às ${fmt.hora(cargas.ultima_rodada)}` : "" },
      { rotulo: "Links cadastrados", valor: fmt.numero(estado.links.length) },
    ]),
    ...categorias.map((categoria) => {
      const links = estado.links.filter((l) => l.categoria === categoria);
      const internos = links.filter((l) => l.tipo === "interno");
      const externos = links.filter((l) => l.tipo === "externo");
      return el("section", { classe: "hub-categoria" }, [
        el("h2", { texto: categoria }),
        internos.length ? el("div", { classe: "hub-sistemas" }, internos.map(cartaoSistema)) : null,
        externos.length ? el("div", { classe: "hub-chips" }, externos.map(chipExterno)) : null,
      ]);
    }),
  );
}

async function atualizarStatus() {
  try {
    estado.status = await api("/api/hub/status");
    desenhar();
  } catch (erro) {
    aviso(`Não foi possível verificar o status: ${erro.message}`, "erro");
  }
}

async function carregar() {
  estado.links = await api("/api/hub/links");
  await atualizarStatus();
}

raiz.replaceChildren(el("div", { classe: "app" }, el("div", { classe: "app-conteudo" }, [
  el("header", { classe: "topo" }, el("div", { classe: "topo-principal" }, [
    marca({ icone: "layout-grid", titulo: "Hub de Governança", subtitulo: "Gestão de pessoas" }),
    el("div", { classe: "topo-centro" }),
    el("div", { classe: "topo-acoes" }, [botao("Novo link", { icone: "plus", onclick: () => abrirFormulario() }), botaoCargas(), botaoTema()]),
  ])),
  corpo,
  rodape("Hub de governança"),
])));
corpo.replaceChildren(carregando());
carregar().catch((erro) => corpo.replaceChildren(blocoErro(erro)));
setInterval(atualizarStatus, INTERVALO_STATUS_MS);
