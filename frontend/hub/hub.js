import {
  abrirCargas, api, aviso, blocoErro, botao, campo, carregando, el, fmt, icone, iniciarTema, modal, rodape, selecao,
} from "/design-system/ui.js";

iniciarTema("dark");

const INTERVALO_STATUS_MS = 30000;
const ROTULOS_STATUS = { online: "Online", manutencao: "Em manutenção", desconhecido: "Sem verificação" };

const estado = { links: [], status: { links: {}, cargas: null }, indicadores: {}, contados: new Set(), entrou: false };
const raiz = document.getElementById("app");
const corpo = el("main", { classe: "hub" });
const status = el("span", { classe: "hub-verificado" }, "Verificando status…");

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

const MARCA = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="3" fill="currentColor"/><rect x="17" y="3" width="12" height="12" rx="3" fill="currentColor" opacity=".55"/><rect x="3" y="17" width="12" height="12" rx="3" fill="currentColor" opacity=".55"/><rect x="17" y="17" width="12" height="12" rx="3" fill="currentColor" opacity=".3"/></svg>';

function contar(alvo, valor) {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduzido || estado.contados.has(alvo.dataset.chave)) {
    alvo.textContent = fmt.numero(valor);
    return;
  }
  estado.contados.add(alvo.dataset.chave);
  const inicio = performance.now();
  const duracao = 700;
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracao);
    alvo.textContent = fmt.numero(Math.round(valor * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function indicadorSistema(link) {
  const ind = estado.indicadores[link.modulo];
  if (!ind) return null;
  let numero = null;
  if (ind.valor !== undefined) {
    numero = el("b", { "data-chave": link.id, texto: "0" });
    requestAnimationFrame(() => contar(numero, ind.valor));
  }
  return el("span", { classe: "hub-indicador" }, [
    numero ? el("span", {}, [numero, el("small", { texto: ind.rotulo })]) : el("small", { texto: ind.rotulo }),
    icone("arrow-right"),
  ]);
}

function definirTema(tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem("theme", tema);
  } catch {
    aviso("Não foi possível salvar o modo neste navegador.", "erro");
  }
  window.dispatchEvent(new CustomEvent("temaalterado"));
}

function menuConta() {
  const painel = el("div", { classe: "hub-menu", role: "menu", hidden: true });
  const gatilho = el("button", { classe: "hub-entrar", type: "button", "aria-haspopup": "menu", "aria-expanded": "false" }, [
    icone("user-circle"), el("span", {}, [el("b", { texto: "Entrar" }), el("small", { texto: "Acesso ao Exo" })]), icone("chevron-down"),
  ]);
  const fechar = () => { painel.hidden = true; gatilho.setAttribute("aria-expanded", "false"); };
  const desenharPainel = () => {
    const tema = document.documentElement.dataset.theme;
    painel.replaceChildren(
      el("a", { classe: "hub-menu-item", href: "/exo/", role: "menuitem" }, [icone("login-2"), "Acessar o Exo"]),
      el("button", { classe: "hub-menu-item", type: "button", role: "menuitem", onclick: () => { fechar(); abrirFormulario(); } }, [icone("plus"), "Novo acesso rápido"]),
      el("button", { classe: "hub-menu-item", type: "button", role: "menuitem", onclick: () => { fechar(); abrirCargas(); } }, [icone("activity"), "Cargas automáticas"]),
      el("div", { classe: "hub-menu-modo" }, [
        el("span", { texto: "Modo" }),
        el("div", { classe: "segmentado", role: "group", "aria-label": "Modo" }, [["light", "sun", "Claro"], ["dark", "moon", "Escuro"]].map(([valor, nome, rotulo]) => el("button", {
          type: "button", title: rotulo, "aria-label": rotulo, "aria-pressed": tema === valor ? "true" : "false",
          onclick: () => { definirTema(valor); desenharPainel(); },
        }, icone(nome)))),
      ]),
    );
  };
  gatilho.addEventListener("click", () => {
    const abrir = painel.hidden;
    if (abrir) desenharPainel();
    painel.hidden = !abrir;
    gatilho.setAttribute("aria-expanded", String(abrir));
  });
  document.addEventListener("click", (e) => { if (!caixa.contains(e.target)) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !painel.hidden) { fechar(); gatilho.focus(); } });
  const caixa = el("div", { classe: "hub-conta" }, [gatilho, painel]);
  return caixa;
}

function linhaSistema(link, indice) {
  const situacao = estado.status.links[link.id] || "desconhecido";
  return el("a", { classe: "hub-sistema", href: link.destino, style: `--i: ${indice}` }, [
    el("span", { classe: "hub-sistema-icone" }, icone(link.icone || "app-window")),
    el("div", { classe: "hub-sistema-texto" }, [
      el("h3", {}, [link.nome, el("span", { classe: `hub-status ${situacao}`, texto: ROTULOS_STATUS[situacao] })]),
      link.descricao ? el("p", { texto: link.descricao }) : null,
    ]),
    indicadorSistema(link) || el("span", { classe: "hub-indicador" }, icone("arrow-right")),
    botaoEditar(link),
  ]);
}

function linkRapido(link) {
  return el("a", { classe: "hub-rapido", href: link.destino, target: "_blank", rel: "noopener noreferrer", title: link.descricao || link.destino }, [
    el("span", { texto: link.nome }), botaoEditar(link), icone("chevron-right"),
  ]);
}

function saudacao() {
  const hora = new Date().getHours();
  const periodo = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return el("section", { classe: "hub-saudacao" }, [
    el("h1", { texto: `${periodo}, seja bem-vindo ao Hub` }),
    el("p", { texto: new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) }),
  ]);
}

function cabecalhoSecao(titulo, detalhe, acoes = null) {
  return el("div", { classe: "hub-secao-topo" }, [
    el("div", {}, [el("h2", { texto: titulo }), detalhe ? el("p", { texto: detalhe }) : null]),
    acoes,
  ]);
}

function desenhar() {
  const cargas = estado.status.cargas;
  const internos = estado.links.filter((l) => l.tipo === "interno" && l.modulo !== "exo");
  const externos = estado.links.filter((l) => l.tipo === "externo");
  const categorias = [...new Set(externos.map((l) => l.categoria))];
  status.replaceChildren(el("i"), el("span", { texto: `Status verificado às ${new Date().toLocaleTimeString("pt-BR")}` }));
  status.dataset.situacao = cargas && (cargas.situacao === "atrasada" || cargas.situacao === "circuito_aberto") ? "alerta" : "ok";

  corpo.replaceChildren(
    saudacao(),
    el("section", { classe: "hub-secao" }, [
      cabecalhoSecao("Sistemas internos", cargas?.ultima_rodada ? `Última atualização em ${fmt.dataHora(cargas.ultima_rodada).replace(", ", " às ")}` : "Aguardando a primeira carga",
        botao("", { icone: "refresh", titulo: "Verificar agora", classe: "btn fantasma icone", onclick: atualizarStatus })),
      internos.length ? el("div", { classe: "hub-sistemas" }, internos.map(linhaSistema)) : el("p", { classe: "hub-vazio", texto: "Nenhum sistema interno cadastrado." }),
    ]),
    el("section", { classe: "hub-secao hub-rapidos" }, [
      cabecalhoSecao("Acessos rápidos", `${fmt.numero(externos.length)} ${externos.length === 1 ? "acesso" : "acessos"} em ${fmt.numero(categorias.length)} ${categorias.length === 1 ? "categoria" : "categorias"}`),
      categorias.length ? el("div", { classe: "hub-categorias" }, categorias.map((categoria, indice) => {
        const links = externos.filter((l) => l.categoria === categoria);
        return el("div", { classe: "hub-categoria", style: `--i: ${indice}` }, [
          el("h3", {}, [el("span", { texto: categoria }), el("small", { texto: fmt.numero(links.length) })]),
          ...links.map(linkRapido),
        ]);
      })) : el("p", { classe: "hub-vazio", texto: "Nenhum acesso rápido cadastrado." }),
    ]),
  );
}

async function atualizarIndicadores() {
  const [cargas, abertura] = await Promise.allSettled([api("/api/cargas/status"), api("/api/reposicoes/abertura")]);
  const indicadores = {};
  if (abertura.status === "fulfilled") indicadores.reposicoes = { valor: abertura.value.linhas.length, rotulo: "RQ pendentes" };
  if (cargas.status === "fulfilled") {
    const recebendo = cargas.value.pendentes.some((p) => p.destino === "Gestão do Quadro");
    const quadro = cargas.value.entregas.filter((e) => e.destino === "Gestão do Quadro").map((e) => e.em).sort().at(-1);
    indicadores.quadro = { rotulo: recebendo ? "Recebendo arquivo" : quadro ? `Arquivo recebido às ${fmt.hora(quadro)}` : "Aguardando arquivo" };
  }
  estado.indicadores = indicadores;
}

async function atualizarStatus() {
  try {
    const [situacao] = await Promise.all([api("/api/hub/status"), atualizarIndicadores()]);
    estado.status = situacao;
    desenhar();
    if (!estado.entrou) {
      estado.entrou = true;
      setTimeout(() => corpo.classList.add("estavel"), 900);
    }
  } catch (erro) {
    aviso(`Não foi possível verificar o status: ${erro.message}`, "erro");
  }
}

async function carregar() {
  estado.links = await api("/api/hub/links");
  await atualizarStatus();
}

const logoIcone = el("span", { classe: "hub-logo" });
logoIcone.innerHTML = MARCA;
const logo = el("div", { classe: "marca" }, [logoIcone, el("div", {}, [el("h1", { texto: "Central de sistemas" }), el("p", { texto: "Governança de pessoas · Hub" })])]);

raiz.replaceChildren(el("div", { classe: "app" }, el("div", { classe: "app-conteudo" }, [
  el("header", { classe: "topo" }, el("div", { classe: "topo-principal" }, [
    logo,
    el("div", { classe: "topo-centro" }),
    el("div", { classe: "topo-acoes" }, [
      status,
      botao("", { icone: "activity", titulo: "Cargas automáticas", classe: "btn fantasma icone", onclick: abrirCargas }),
      menuConta(),
    ]),
  ])),
  corpo,
  rodape("Planejamento"),
])));
corpo.replaceChildren(carregando());
carregar().catch((erro) => corpo.replaceChildren(blocoErro(erro)));
setInterval(atualizarStatus, INTERVALO_STATUS_MS);
