export function el(tag, atributos = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === "classe") no.className = valor;
    else if (chave === "texto") no.textContent = valor;
    else if (chave === "estilo") Object.assign(no.style, valor);
    else if (chave === "valor") no.value = valor;
    else if (chave.startsWith("on") && typeof valor === "function") no.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (valor === true) no.setAttribute(chave, "");
    else no.setAttribute(chave, valor);
  }
  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

export const icone = (nome) => el("i", { classe: `ti ti-${nome}`, "aria-hidden": "true" });

function lerJson(texto) {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function mensagemDeErro(dados) {
  if (!dados) return "";
  if (typeof dados.detail === "string") return dados.detail;
  if (Array.isArray(dados.detail)) return dados.detail.map((d) => String(d.msg || "").replace(/^Value error, /, "")).join("; ");
  return "";
}

export async function api(url, { metodo = "GET", corpo } = {}) {
  const resposta = await fetch(url, {
    method: metodo,
    credentials: "same-origin",
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : {},
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const dados = lerJson(await resposta.text());
  if (!resposta.ok) {
    const erro = new Error(mensagemDeErro(dados) || `Não foi possível concluir (erro ${resposta.status}).`);
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

export const fmt = {
  numero: (v) => Number(v ?? 0).toLocaleString("pt-BR"),
  pct: (v) => `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
  data: (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR") : "-"),
  dataCurta: (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "-"),
  dataHora: (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-"),
  hora: (iso) => (iso ? iso.slice(11, 16) : "-"),
  minutos: (m) => {
    const total = Math.round(Math.abs(m ?? 0));
    const sinal = (m ?? 0) < 0 ? "-" : "";
    return `${sinal}${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
  },
};

export function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function comparar(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

function lerPreferencia(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
    return true;
  } catch {
    return false;
  }
}

export function iniciarTema(padrao = "light") {
  const salvo = lerPreferencia("theme");
  document.documentElement.dataset.theme = salvo === "dark" || salvo === "light" ? salvo : padrao;
}

export function botaoTema() {
  const botao = el("button", { classe: "btn icone", type: "button" });
  const atualizar = () => {
    const escuro = document.documentElement.dataset.theme === "dark";
    botao.title = escuro ? "Tema claro" : "Tema escuro";
    botao.setAttribute("aria-label", botao.title);
    botao.replaceChildren(icone(escuro ? "sun" : "moon"));
  };
  botao.addEventListener("click", () => {
    const novo = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    gravarPreferencia("theme", novo);
    atualizar();
    window.dispatchEvent(new CustomEvent("temaalterado"));
  });
  atualizar();
  return botao;
}

export function botao(rotulo, { icone: nomeIcone = null, principal = false, pequeno = false, titulo = null, ...resto } = {}) {
  const classes = ["btn", principal ? "principal" : "", pequeno ? "pequeno" : "", rotulo ? "" : "icone"].filter(Boolean).join(" ");
  return el("button", { classe: classes, type: "button", title: titulo, "aria-label": rotulo ? null : titulo, ...resto },
    [nomeIcone ? icone(nomeIcone) : null, rotulo || null]);
}

export function marca({ icone: nomeIcone, titulo, subtitulo, href = null }) {
  return el(href ? "a" : "div", { classe: "marca", href }, [
    el("span", { classe: "marca-icone" }, icone(nomeIcone)),
    el("div", {}, [el("h1", { texto: titulo }), subtitulo ? el("p", { texto: subtitulo }) : null]),
  ]);
}

export function rodape(area = "Governança de pessoas") {
  return el("footer", { classe: "rodape" }, [
    el("b", { texto: area }),
    el("span", { texto: "Demonstração com dados sintéticos" }),
    el("span", { texto: "Projeto de portfólio" }),
  ]);
}

export function kpis(itens) {
  return el("div", { classe: "faixa" }, itens.map((item) => el("div", { classe: "kpi" }, [
    el("div", { classe: "kpi-rotulo", texto: item.rotulo, title: item.rotulo }),
    el("div", { classe: `kpi-valor${item.tom === "critico" || item.tom === "alerta" ? ` ${item.tom}` : ""}`, texto: item.valor }),
    item.detalhe ? el("div", { classe: "kpi-detalhe" }, [].concat(item.detalhe).flatMap((parte, i) => [i ? " · " : null, el("span", { texto: parte })])) : null,
  ])));
}

export function abas({ itens, ativa, aoTrocar }) {
  return el("div", { classe: "subabas", role: "tablist" }, itens.map((item) => el("button", {
    classe: "subaba", type: "button", role: "tab",
    "aria-selected": item.chave === ativa ? "true" : "false",
    onclick: () => aoTrocar(item.chave),
  }, [item.rotulo, item.contador !== undefined ? el("b", { classe: "contador", texto: ` ${fmt.numero(item.contador)}` }) : null])));
}

export function segmentado({ opcoes, ativa, aoTrocar, rotulo = "" }) {
  return el("div", { classe: "segmentado", role: "group", "aria-label": rotulo || null }, opcoes.map(([chave, texto]) => el("button", {
    type: "button", "aria-pressed": chave === ativa ? "true" : "false", onclick: () => aoTrocar(chave),
  }, texto)));
}

export function selo(texto, tom = "") {
  const tons = { critico: "critico", alerta: "alerta", atencao: "atencao", forte: "forte" };
  return el("span", { classe: `selo${tons[tom] ? ` ${tons[tom]}` : ""}`, texto });
}

export function cartao({ titulo = "", detalhe = "", acoes = null, corpo = [] }) {
  return el("section", { classe: "painel" }, [
    titulo ? el("div", { classe: "painel-topo" }, [
      el("div", { estilo: { minWidth: "0" } }, [el("h2", { texto: titulo }), detalhe ? el("p", { texto: detalhe, title: detalhe }) : null]),
      acoes ? el("div", { classe: "painel-acoes" }, acoes) : null,
    ]) : null,
    el("div", { classe: "painel-corpo" }, [].concat(corpo)),
  ]);
}

export function vazio(titulo, detalhe = "", nomeIcone = "database-off") {
  return el("div", { classe: "vazio" }, [icone(nomeIcone), el("strong", { texto: titulo }), detalhe ? el("span", { texto: detalhe }) : null]);
}

export function carregando(texto = "Carregando") {
  return el("div", { classe: "carregando", role: "status" }, [icone("loader-2"), texto]);
}

export function blocoErro(erro) {
  return el("div", { classe: "aviso-bloco", role: "alert" }, [icone("alert-triangle"), el("div", {}, [el("b", { texto: "Dados indisponíveis: " }), erro.message || String(erro)])]);
}

export function introducao(descricao, acoes = null) {
  return el("div", { classe: "intro" }, [el("p", { texto: descricao, title: descricao }), acoes ? el("div", { classe: "intro-acoes" }, acoes) : null]);
}

export function cabecalhoPagina(titulo, descricao = "", acoes = null) {
  return el("div", { classe: "cabecalho-pagina" }, [
    el("div", { classe: "cabecalho-linha" }, [el("h1", { texto: titulo }), acoes ? el("div", { classe: "intro-acoes" }, acoes) : null]),
    descricao ? el("p", { texto: descricao }) : null,
  ]);
}

export function baixarCsv(nomeArquivo, colunas, linhas) {
  const escapar = (valor) => {
    const texto = String(valor ?? "");
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const conteudo = [
    colunas.map((c) => escapar(c.titulo)).join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(c.formato ? c.formato(l[c.chave], l) : l[c.chave])).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿", conteudo], { type: "text/csv;charset=utf-8" }));
  const link = el("a", { href: url, download: nomeArquivo });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  aviso(`Arquivo ${nomeArquivo} gerado.`);
}

function paginasVisiveis(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const paginas = new Set([1, total, atual, atual - 1, atual + 1]);
  return [...paginas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

export function tabela({ colunas, linhas, porPagina = 15, busca = true, aoClicar = null, exportar = null, textoVazio = "Nenhum registro encontrado.", placeholder = "Buscar na tabela" }) {
  const estado = { termo: "", chave: null, direcao: 1, pagina: 1, selecionada: null };
  const corpo = el("tbody");
  const pagina = el("div", { classe: "dt-pagina" });
  const valorExibido = (linha, coluna) => (coluna.formato ? coluna.formato(linha[coluna.chave], linha) : linha[coluna.chave] ?? "");

  const cabecalhos = colunas.map((coluna) => {
    const th = el("th", { scope: "col", classe: [coluna.alinhar === "direita" ? "num" : "", coluna.ordenavel !== false ? "ordenavel" : ""].join(" ").trim() || null },
      [coluna.titulo, coluna.ordenavel !== false ? el("span", { classe: "seta", "aria-hidden": "true" }) : null]);
    if (coluna.ordenavel !== false) {
      th.addEventListener("click", () => {
        estado.direcao = estado.chave === coluna.chave ? -estado.direcao : 1;
        estado.chave = coluna.chave;
        desenhar();
      });
    }
    return th;
  });

  function filtradas() {
    let lista = linhas;
    if (estado.termo) {
      const termo = normalizar(estado.termo);
      lista = lista.filter((l) => colunas.some((c) => normalizar(valorExibido(l, c)).includes(termo)));
    }
    if (estado.chave) lista = [...lista].sort((a, b) => comparar(a[estado.chave], b[estado.chave]) * estado.direcao);
    return lista;
  }

  function celula(linha, coluna) {
    const conteudo = coluna.render ? coluna.render(linha[coluna.chave], linha) : String(valorExibido(linha, coluna));
    const classe = [coluna.alinhar === "direita" ? "num" : "", coluna.forte ? "forte" : ""].join(" ").trim() || null;
    return el("td", { classe, title: typeof conteudo === "string" && conteudo.length > 18 ? conteudo : null }, conteudo);
  }

  function desenhar() {
    const lista = filtradas();
    const total = lista.length;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    estado.pagina = Math.min(estado.pagina, paginas);
    const inicio = (estado.pagina - 1) * porPagina;
    const fatia = lista.slice(inicio, inicio + porPagina);
    if (!fatia.length) {
      corpo.replaceChildren(el("tr", {}, el("td", { colspan: colunas.length, classe: "dt-vazia", texto: estado.termo ? `Busca por "${estado.termo}" não retornou registros.` : textoVazio })));
    } else {
      corpo.replaceChildren(...fatia.map((linha) => {
        const tr = el("tr", { classe: aoClicar ? `clicavel${linha === estado.selecionada ? " selecionada" : ""}` : null }, colunas.map((c) => celula(linha, c)));
        if (aoClicar) {
          tr.tabIndex = 0;
          const acionar = () => {
            estado.selecionada = linha;
            corpo.querySelectorAll("tr.selecionada").forEach((x) => x.classList.remove("selecionada"));
            tr.classList.add("selecionada");
            aoClicar(linha);
          };
          tr.addEventListener("click", acionar);
          tr.addEventListener("keydown", (e) => { if (e.key === "Enter") acionar(); });
        }
        return tr;
      }));
    }
    cabecalhos.forEach((th, i) => {
      const ativo = colunas[i].chave === estado.chave;
      th.setAttribute("aria-sort", ativo ? (estado.direcao === 1 ? "ascending" : "descending") : "none");
      const seta = th.querySelector(".seta");
      if (seta) seta.textContent = ativo ? (estado.direcao === 1 ? "↑" : "↓") : "↕";
    });
    const irPara = (p) => () => { estado.pagina = p; desenhar(); };
    const controles = [];
    if (paginas > 1) {
      controles.push(el("button", { classe: "dt-pag", type: "button", disabled: estado.pagina === 1, "aria-label": "Página anterior", onclick: irPara(estado.pagina - 1) }, icone("chevron-left")));
      let anterior = 0;
      for (const p of paginasVisiveis(estado.pagina, paginas)) {
        if (p - anterior > 1) controles.push(el("span", { classe: "dt-reticencias", texto: "…" }));
        controles.push(el("button", { classe: "dt-pag", type: "button", "aria-current": p === estado.pagina ? "page" : null, onclick: irPara(p) }, String(p)));
        anterior = p;
      }
      controles.push(el("button", { classe: "dt-pag", type: "button", disabled: estado.pagina === paginas, "aria-label": "Próxima página", onclick: irPara(estado.pagina + 1) }, icone("chevron-right")));
    }
    pagina.replaceChildren(
      el("span", { classe: "dt-info", texto: total ? `${fmt.numero(inicio + 1)}-${fmt.numero(inicio + fatia.length)} de ${fmt.numero(total)} registros` : "0 registros" }),
      el("div", { classe: "dt-controles" }, controles),
    );
  }

  let temporizador = null;
  const barra = busca || exportar ? el("div", { classe: "dt-barra" }, [
    busca ? el("div", { classe: "dt-busca" }, [
      icone("search"),
      el("input", {
        type: "search", placeholder, "aria-label": placeholder,
        oninput: (e) => {
          clearTimeout(temporizador);
          const valor = e.target.value;
          temporizador = setTimeout(() => { estado.termo = valor; estado.pagina = 1; desenhar(); }, 200);
        },
      }),
    ]) : el("span"),
    exportar ? botao("Exportar", { icone: "download", pequeno: true, onclick: () => baixarCsv(exportar, colunas, filtradas()) }) : null,
  ]) : null;

  desenhar();
  return el("div", { classe: "dt" }, [
    barra,
    el("div", { classe: "dt-rolagem" }, el("table", {}, [el("thead", {}, el("tr", {}, cabecalhos)), corpo])),
    pagina,
  ]);
}

export function modal({ titulo, conteudo, acoes = [], largo = false }) {
  const anterior = document.activeElement;
  const fundo = el("div", { classe: "fundo-modal" });
  const caixa = el("div", { classe: `modal${largo ? " largo" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": titulo }, [
    el("div", { classe: "modal-cabecalho" }, [
      el("h2", { texto: titulo }),
      el("button", { classe: "btn fantasma pequeno icone", type: "button", "aria-label": "Fechar", title: "Fechar", onclick: () => fechar() }, icone("x")),
    ]),
    el("div", { classe: "modal-corpo" }, conteudo),
    acoes.length ? el("div", { classe: "modal-rodape" }, acoes) : null,
  ]);
  const aoTeclar = (e) => {
    if (e.key === "Escape" && fundo === document.querySelector(".fundo-modal:last-of-type")) fechar();
  };
  function fechar() {
    document.removeEventListener("keydown", aoTeclar);
    fundo.remove();
    if (anterior && anterior.focus) anterior.focus();
  }
  fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
  document.addEventListener("keydown", aoTeclar);
  fundo.append(caixa);
  document.body.append(fundo);
  const foco = caixa.querySelector(".modal-corpo input, .modal-corpo select, .modal-corpo textarea") || caixa.querySelector("button");
  if (foco) foco.focus();
  return { fechar, caixa };
}

export function aviso(texto, tipo = "info") {
  let pilha = document.querySelector(".avisos");
  if (!pilha) {
    pilha = el("div", { classe: "avisos", "aria-live": "polite" });
    document.body.append(pilha);
  }
  const item = el("div", { classe: `aviso${tipo === "erro" ? " erro" : ""}` }, [icone(tipo === "erro" ? "alert-triangle" : "circle-check"), el("span", { texto })]);
  pilha.append(item);
  setTimeout(() => item.remove(), 4200);
}

export function campo(rotulo, controle) {
  const id = controle.id || `campo-${Math.random().toString(36).slice(2, 9)}`;
  controle.id = id;
  return el("div", { classe: "campo" }, [el("label", { for: id, texto: rotulo }), controle]);
}

export function selecao(opcoes, valor = "", atributos = {}) {
  return el("select", { classe: "selecao", ...atributos }, opcoes.map((o) => {
    const [v, r] = Array.isArray(o) ? o : [o, o];
    return el("option", { value: v, selected: String(v) === String(valor) }, r);
  }));
}

export function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim();
}

export const paleta = () => [1, 2, 3, 4, 5, 6].map((i) => cor(`viz-${i}`));

function truncarMedido(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > largura) corte = corte.slice(0, -1);
  return `${corte}…`;
}

const graficosAtivos = new Set();

function limparGraficos() {
  for (const g of graficosAtivos) {
    if (!g.canvas.isConnected) {
      g.destroy();
      graficosAtivos.delete(g);
    }
  }
}

export function graficoBruto(montar, { altura = 260, descricao = "Gráfico" } = {}) {
  const canvas = el("canvas", { role: "img", "aria-label": descricao });
  const caixa = el("div", { classe: "grafico", estilo: { height: `${altura}px` } }, canvas);
  requestAnimationFrame(() => {
    limparGraficos();
    if (!canvas.isConnected || !window.Chart) return;
    window.Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    window.Chart.defaults.font.size = 11.5;
    window.Chart.defaults.color = cor("text-secondary");
    if (window.ChartDataLabels && !window.Chart.registry.plugins.get("datalabels")) {
      window.Chart.register(window.ChartDataLabels);
      window.Chart.defaults.set("plugins.datalabels", { display: false });
    }
    const config = montar();
    config.options = {
      responsive: true,
      maintainAspectRatio: false,
      ...config.options,
      plugins: {
        legend: { display: false },
        ...config.options?.plugins,
        tooltip: {
          backgroundColor: cor("text-primary"), titleColor: cor("bg-surface"), bodyColor: cor("bg-surface"), padding: 10, cornerRadius: 8,
          ...config.options?.plugins?.tooltip,
        },
      },
    };
    graficosAtivos.add(new window.Chart(canvas, config));
  });
  return caixa;
}

export function grafico({ tipo = "bar", rotulos, series, altura = 260, horizontal = false, empilhado = false, formato = null, legenda = null, descricao = "", unidade = "" }) {
  const canvas = el("canvas", { role: "img", "aria-label": descricao || "Gráfico" });
  const caixa = el("div", { classe: "grafico", estilo: { height: `${altura}px` } }, canvas);
  requestAnimationFrame(() => {
    for (const g of graficosAtivos) {
      if (!g.canvas.isConnected) {
        g.destroy();
        graficosAtivos.delete(g);
      }
    }
    if (!canvas.isConnected || !window.Chart) return;
    const cores = paleta();
    const texto = cor("text-secondary");
    const grade = cor("border-color");
    const formatar = formato || ((v) => fmt.numero(v));
    window.Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    window.Chart.defaults.font.size = 11.5;
    const eixoCategorias = {
      stacked: empilhado,
      ticks: {
        color: texto,
        maxRotation: 0,
        autoSkip: true,
        callback(valor) {
          const rotulo = String(this.getLabelForValue(valor)).toUpperCase();
          if (!horizontal) return rotulo;
          this.chart.ctx.font = "500 11.5px Inter, system-ui, sans-serif";
          return truncarMedido(this.chart.ctx, rotulo, this.chart.width * 0.42);
        },
      },
      grid: { display: false },
      border: { display: false },
    };
    const eixoValores = {
      stacked: empilhado,
      beginAtZero: true,
      ticks: { color: texto, precision: 0, callback: (v) => formatar(v) },
      grid: { color: grade },
      border: { display: false },
      title: unidade ? { display: true, text: unidade.toUpperCase(), color: texto, font: { size: 11, weight: "600" } } : undefined,
    };
    const instancia = new window.Chart(canvas, {
      type: tipo,
      data: {
        labels: rotulos.map((r) => String(r).toUpperCase()),
        datasets: series.map((s, i) => ({
          label: String(s.nome).toUpperCase(),
          data: s.valores,
          backgroundColor: tipo === "doughnut" ? cores : (s.cor ? cor(s.cor) : cores[i % cores.length]),
          borderColor: tipo === "line" ? (s.cor ? cor(s.cor) : cores[i % cores.length]) : (tipo === "doughnut" ? cor("bg-surface") : "transparent"),
          borderWidth: tipo === "line" ? 2 : (tipo === "doughnut" ? 2 : 0),
          borderRadius: tipo === "bar" ? 3 : 0,
          pointRadius: tipo === "line" ? 0 : undefined,
          pointHoverRadius: tipo === "line" ? 4 : undefined,
          tension: 0.3,
          fill: false,
          maxBarThickness: horizontal ? 18 : 34,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        interaction: { mode: tipo === "doughnut" ? "nearest" : "index", intersect: false },
        layout: { padding: { right: horizontal ? 12 : 0 } },
        cutout: tipo === "doughnut" ? "68%" : undefined,
        plugins: {
          legend: {
            display: legenda ?? (series.length > 1 || tipo === "doughnut"),
            position: "bottom",
            labels: { color: texto, boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 11.5 } },
          },
          tooltip: {
            backgroundColor: cor("text-primary"),
            titleColor: cor("bg-surface"),
            bodyColor: cor("bg-surface"),
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${formatar(c.parsed?.[horizontal ? "x" : "y"] ?? c.parsed)}` },
          },
        },
        scales: tipo === "doughnut" ? {} : horizontal ? { x: eixoValores, y: eixoCategorias } : { x: eixoCategorias, y: eixoValores },
      },
    });
    graficosAtivos.add(instancia);
  });
  return caixa;
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>';
const SETA = '<svg class="fl-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';
const XIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>';

function svg(marcacao) {
  const molde = document.createElement("template");
  molde.innerHTML = marcacao;
  return molde.content.firstChild;
}

export function filtroLateral(blocos) {
  const raiz = el("div", { classe: "fl" });
  const estadoUi = { aberto: "", busca: "" };

  function rotuloValor(f) {
    const sel = f.sel || [];
    if (f.textoValor) return f.textoValor;
    if (!sel.length) return f.vazio || "Todos";
    if (f.unico) return f.opcoes.find((o) => o.t === sel[0])?.rotulo || sel[0];
    return sel.length === 1 ? sel[0] : `${sel.length} selecionados`;
  }

  function opcoes(f) {
    const sel = f.sel || [];
    const termo = normalizar(estadoUi.busca);
    const visiveis = f.opcoes.filter((o) => !termo || normalizar(o.t).includes(termo));
    const maximo = Math.max(1, ...f.opcoes.map((o) => o.n || 0));
    const todos = f.opcoes.length > 0 && f.opcoes.every((o) => sel.includes(o.t));
    const marcar = (o) => {
      if (f.unico) {
        estadoUi.aberto = "";
        f.aoMudar(sel.includes(o.t) && !f.semLimpar ? [] : [o.t]);
        desenhar();
        return;
      }
      f.aoMudar(sel.includes(o.t) ? sel.filter((v) => v !== o.t) : [...sel, o.t]);
    };
    const busca = f.opcoes.length > 6 ? el("div", { classe: "fl-busca" }, [
      icone("search"),
      el("input", {
        type: "text", placeholder: `Filtrar ${f.rotulo.toLowerCase()}`, "aria-label": `Filtrar ${f.rotulo.toLowerCase()}`, valor: estadoUi.busca,
        oninput: (e) => { estadoUi.busca = e.target.value; lista.replaceChildren(...itens()); },
      }),
    ]) : null;
    const itens = () => {
      const filtro = normalizar(estadoUi.busca);
      const exibidas = f.opcoes.filter((o) => !filtro || normalizar(o.t).includes(filtro));
      if (!exibidas.length) return [el("div", { classe: "fl-vazio", texto: "Nenhuma opção" })];
      return exibidas.map((o) => {
        const marcado = sel.includes(o.t);
        const item = el("button", {
          type: "button", "aria-pressed": marcado ? "true" : "false", title: o.t,
          classe: `fl-op${f.unico ? " unico" : ""}${marcado ? " marcado" : ""}`,
          estilo: { "--w": `${Math.round(((o.n || 0) / maximo) * 100)}%` },
          onclick: () => marcar(o),
        }, [el("span", { classe: "fl-caixa" }, svg(CHECK)), el("span", { classe: "fl-nome", texto: o.rotulo || o.t }), el("span", { classe: "fl-q", texto: o.n !== undefined ? fmt.numero(o.n) : "" })]);
        item.style.setProperty("--w", `${Math.round(((o.n || 0) / maximo) * 100)}%`);
        return item;
      });
    };
    const lista = el("div", { classe: "fl-lista" }, visiveis.length || !termo ? itens() : [el("div", { classe: "fl-vazio", texto: "Nenhuma opção" })]);
    return el("div", { classe: "fl-dentro", role: "group", "aria-label": f.rotulo }, [
      busca,
      f.opcoes.length > 1 && !f.unico ? el("div", { classe: "fl-barra" }, [
        el("span", { "aria-live": "polite", texto: sel.length ? `${sel.length} ${sel.length === 1 ? "marcado" : "marcados"}` : "Nenhum marcado" }),
        el("button", { type: "button", onclick: () => f.aoMudar(todos ? [] : f.opcoes.map((o) => o.t)) }, todos ? "Desmarcar todos" : "Marcar todos"),
      ]) : null,
      lista,
    ]);
  }

  function linha(f) {
    const sel = f.sel || [];
    const ativo = sel.length > 0;
    const aberto = estadoUi.aberto === f.chave;
    const gatilho = el("button", {
      type: "button", "data-ch": f.chave, "aria-expanded": aberto ? "true" : "false",
      title: sel.length ? sel.join(", ") : null,
      classe: `fl-linha${ativo && !f.semDestaque ? " tem" : ""}`,
      onclick: () => {
        estadoUi.aberto = aberto ? "" : f.chave;
        estadoUi.busca = "";
        desenhar();
        if (!aberto) {
          const alvo = raiz.querySelector(`[data-ch="${f.chave}"]`)?.parentElement?.querySelector(".fl-busca input, .fl-op");
          alvo?.focus({ preventScroll: true });
        }
      },
    }, [el("span", { classe: "fl-n", texto: f.rotulo }), el("span", { classe: "fl-v", texto: rotuloValor(f) }), svg(SETA)]);
    return el("div", { classe: "fl-w" }, [
      gatilho,
      ativo && !aberto && !f.semLimpar ? el("button", { type: "button", classe: "fl-x", "aria-label": `Limpar ${f.rotulo.toLowerCase()}`, title: `Limpar ${f.rotulo.toLowerCase()}`, onclick: () => f.aoMudar([]) }, svg(XIS)) : null,
      aberto ? opcoes(f) : null,
    ]);
  }

  function desenhar(novos = null) {
    if (novos) blocos = novos;
    const corpoBloco = (b) => {
      if (b.visao) return segmentado({ rotulo: b.titulo, opcoes: b.visao.opcoes, ativa: b.visao.ativa, aoTrocar: b.visao.aoTrocar });
      if (b.acoes) {
        return el("div", { classe: "fl-grupo" }, b.acoes.map((a) => el("div", { classe: "fl-w" }, el("button", {
          type: "button", classe: "fl-linha fl-acao", disabled: a.desabilitado || null, title: a.titulo || null, onclick: a.onclick,
        }, [icone(a.icone), el("span", { classe: "fl-n", texto: a.rotulo })]))));
      }
      if (b.conteudo) return el("div", { classe: "fl-grupo solto" }, b.conteudo);
      return el("div", { classe: "fl-grupo" }, b.filtros.filter(Boolean).map(linha));
    };
    raiz.replaceChildren(...blocos.filter(Boolean).map((b) => el("section", { classe: `fl-bloco${b.visao ? " fl-bloco-visao" : ""}` }, [
      el("h3", {}, [b.titulo, b.limpar ? el("button", { type: "button", onclick: b.limpar }, "Limpar filtros") : null]),
      corpoBloco(b),
    ])));
  }

  raiz.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && estadoUi.aberto) {
      const chave = estadoUi.aberto;
      estadoUi.aberto = "";
      desenhar();
      raiz.querySelector(`[data-ch="${chave}"]`)?.focus();
    }
  });

  desenhar();
  return { raiz, atualizar: desenhar };
}

const NIVEIS_FILTRO = ["diretoria", "servico", "gerente", "coordenador", "supervisor", "cargo", "sede"];

export function parametrosFiltro(estado, extras = {}) {
  const parametros = new URLSearchParams();
  for (const nivel of NIVEIS_FILTRO) {
    if (estado[nivel]?.length) parametros.set(nivel, estado[nivel].join(","));
  }
  if (estado.de) parametros.set("de", estado.de);
  if (estado.ate) parametros.set("ate", estado.ate);
  for (const [chave, valor] of Object.entries(extras)) {
    if (valor !== undefined && valor !== null && valor !== "") parametros.set(chave, valor);
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : "";
}

const SITUACOES_CARGA = { ok: "Em dia", atrasada: "Atrasada", circuito_aberto: "Pausada após falhas", aguardando: "Aguardando" };

export function botaoCargas() {
  return botao("Cargas automáticas", { icone: "refresh", onclick: abrirCargas });
}

export function statusCargas() {
  const texto = el("span", { classe: "status-carga-texto" }, "Verificando carga…");
  const elemento = el("button", { classe: "status-carga", type: "button", title: "Ver cargas automáticas", onclick: abrirCargas }, [el("i", { classe: "status-carga-ponto" }), texto]);
  async function atualizar() {
    try {
      const dados = await api("/api/cargas/status");
      const pendente = dados.pendentes.some((p) => p.destino === "Gestão do Quadro");
      elemento.dataset.situacao = dados.situacao === "ok" && !pendente ? "ok" : dados.situacao;
      texto.replaceChildren(
        el("b", { texto: pendente ? "Recebendo arquivo…" : `Carga automática ${(SITUACOES_CARGA[dados.situacao] || dados.situacao).toLowerCase()}` }),
        el("small", { texto: dados.proxima_rodada ? `Próxima rodada às ${fmt.hora(dados.proxima_rodada)}` : "Sem rodada agendada" }),
      );
    } catch {
      elemento.dataset.situacao = "erro";
      texto.replaceChildren(el("b", { texto: "Status da carga indisponível" }));
    }
  }
  atualizar();
  setInterval(atualizar, 60000);
  return elemento;
}

export async function abrirCargas() {
  const corpo = el("div", { classe: "formulario" }, carregando());
  modal({ titulo: "Cargas automáticas", conteudo: corpo });
  try {
    const dados = await api("/api/cargas/status");
    const destinos = new Map();
    for (const e of dados.entregas) {
      if (!destinos.has(e.destino)) destinos.set(e.destino, []);
      destinos.get(e.destino).push(e);
    }
    const pendentes = new Set(dados.pendentes.map((p) => p.destino));
    corpo.replaceChildren(
      el("div", { classe: "cartao-status" }, [
        el("div", { classe: "cartao-status-topo" }, [
          el("span", { classe: "cartao-status-titulo", texto: "Ciclo de coleta" }),
          selo(SITUACOES_CARGA[dados.situacao] || dados.situacao, dados.situacao === "ok" ? "forte" : "critico"),
        ]),
        el("dl", {}, [
          el("div", {}, [el("dt", { texto: "Última rodada" }), el("dd", { texto: fmt.dataHora(dados.ultima_rodada) })]),
          el("div", {}, [el("dt", { texto: "Próxima rodada" }), el("dd", { texto: fmt.dataHora(dados.proxima_rodada) })]),
        ]),
      ]),
      ...[...destinos.entries()].map(([destino, entregas]) => el("div", { classe: "cartao-status" }, [
        el("div", { classe: "cartao-status-topo" }, [
          el("span", { classe: "cartao-status-titulo", texto: destino }),
          selo(pendentes.has(destino) ? "Entrega pendente" : "Recebido", pendentes.has(destino) ? "critico" : "forte"),
        ]),
        el("dl", {}, entregas.map((e) => el("div", {}, [el("dt", { texto: dados.tipos[e.tipo] }), el("dd", { texto: fmt.dataHora(e.em) })]))),
      ])),
    );
  } catch (erro) {
    corpo.replaceChildren(blocoErro(erro));
  }
}

export function moduloComMenu({ titulo, icone: nomeIcone, grupos, paginaInicial, area }) {
  const raiz = document.getElementById("app");
  const paginas = new Map(grupos.flatMap((g) => g.itens.map((i) => [i.chave, i])));
  const menu = el("nav", { classe: "shell-menu", "aria-label": "Páginas" });
  const tituloPagina = el("h1");
  const descricaoPagina = el("p");
  const acoesPagina = el("div", { classe: "acoes-pagina" });
  const conteudo = el("div", { classe: "shell-conteudo" });

  const chaveAtual = () => {
    const chave = (window.location.hash || "").replace(/^#\/?/, "");
    return paginas.has(chave) ? chave : paginaInicial;
  };

  async function navegar() {
    const chave = chaveAtual();
    const pagina = paginas.get(chave);
    menu.replaceChildren(...grupos.map((g) => el("div", { classe: "shell-grupo", role: "group", "aria-label": g.titulo || null }, [
      g.titulo ? el("span", { classe: "shell-grupo-titulo", texto: g.titulo }) : null,
      ...g.itens.map((i) => el("a", { classe: `shell-item${i.chave === chave ? " ativo" : ""}`, href: `#/${i.chave}`, "aria-current": i.chave === chave ? "page" : null }, [icone(i.icone), el("span", { texto: i.rotulo })])),
    ])));
    tituloPagina.textContent = pagina.rotulo;
    descricaoPagina.textContent = pagina.descricao || "";
    acoesPagina.replaceChildren();
    document.title = `${pagina.rotulo} · ${titulo}`;
    conteudo.replaceChildren(carregando());
    try {
      await pagina.render(conteudo, { acoes: acoesPagina });
    } catch (erro) {
      conteudo.replaceChildren(blocoErro(erro));
    }
  }

  raiz.replaceChildren(el("main", { classe: "shell" }, [
    el("aside", { classe: "shell-nav" }, [
      el("div", { classe: "shell-marca" }, [el("span", { classe: "marca-icone" }, icone(nomeIcone)), el("span", { classe: "shell-nome", texto: titulo })]),
      menu,
      el("a", { classe: "shell-hub", href: "/", title: "Voltar ao Hub" }, [icone("arrow-left"), el("span", { texto: "Voltar ao Hub" })]),
    ]),
    el("div", { classe: "shell-principal" }, [
      el("header", { classe: "shell-topo" }, [
        el("div", { classe: "shell-titulo" }, [tituloPagina, descricaoPagina]),
        el("div", { classe: "topo-acoes" }, [acoesPagina, statusCargas(), botaoTema()]),
      ]),
      conteudo,
      rodape(area),
    ]),
  ]));
  window.addEventListener("hashchange", navegar);
  window.addEventListener("temaalterado", navegar);
  navegar();
}

export function moduloComNavegacao({ titulo, subtitulo, icone: nomeIcone, grupos, paginaInicial, area }) {
  const raiz = document.getElementById("app");
  const paginas = new Map(grupos.flatMap((g) => g.itens.map((i) => [i.chave, { ...i, grupo: g }])));
  const centro = el("div", { classe: "topo-centro" });
  const abasModulo = el("nav", { classe: "abas-modulo", "aria-label": titulo });
  const status = el("div", { classe: "topo-status" });
  const lateral = el("aside", { classe: "lateral-filtros", "aria-label": "Filtros" });
  const subabas = el("div");
  const area_ = el("div", { classe: "principal" });
  const principal = el("div", { classe: "principal" }, [subabas, area_]);
  const layout = el("div", { classe: "layout" }, [lateral, principal]);
  const multiplosGrupos = grupos.length > 1;
  const contagens = {};
  const comContagem = (chave, rotulo) => [rotulo, contagens[chave] !== undefined ? el("b", { texto: fmt.numero(contagens[chave]) }) : null];

  function chaveAtual() {
    const chave = (window.location.hash || "").replace(/^#\/?/, "");
    return paginas.has(chave) ? chave : paginaInicial;
  }

  function desenharNavegacao(ativa) {
    const pagina = paginas.get(ativa);
    if (multiplosGrupos) {
      abasModulo.replaceChildren(...grupos.map((g) => el("a", {
        classe: "aba-modulo", href: `#/${g.itens[0].chave}`, "aria-current": g === pagina.grupo ? "page" : null,
      }, g.titulo)));
      subabas.replaceChildren(el("nav", { classe: "subabas", "aria-label": pagina.grupo.titulo }, pagina.grupo.itens.map((i) => el("a", {
        classe: "subaba", href: `#/${i.chave}`, "aria-current": i.chave === ativa ? "page" : null,
      }, i.rotulo))));
    } else {
      abasModulo.replaceChildren(...grupos[0].itens.map((i) => el("a", {
        classe: "aba-modulo", href: `#/${i.chave}`, "aria-current": i.chave === ativa ? "page" : null,
      }, comContagem(i.chave, i.rotulo))));
      subabas.replaceChildren();
    }
  }

  async function atualizarStatus() {
    try {
      const base = await api("/api/base/hierarquia");
      status.replaceChildren("Dados até ", el("b", { texto: fmt.data(base.hoje) }), " · atualizado às ", el("b", { texto: fmt.hora(base.atualizado_em) }));
    } catch {
      status.replaceChildren("Status indisponível");
    }
  }

  async function navegar() {
    const chave = chaveAtual();
    const pagina = paginas.get(chave);
    desenharNavegacao(chave);
    document.title = `${pagina.rotulo} · ${titulo}`;
    centro.replaceChildren();
    try {
      await pagina.render(area_, {
        centro, lateral, layout,
        definirContagens: (valores) => { Object.assign(contagens, valores); desenharNavegacao(chaveAtual()); },
      });
    } catch (erro) {
      area_.replaceChildren(blocoErro(erro));
    }
  }

  raiz.replaceChildren(el("div", { classe: "app" }, el("div", { classe: "app-conteudo" }, [
    el("header", { classe: "topo" }, [
      el("div", { classe: "topo-principal" }, [
        marca({ icone: nomeIcone, titulo, subtitulo }),
        centro,
        el("div", { classe: "topo-acoes" }, [
          botaoCargas(),
          el("a", { classe: "btn", href: "/" }, [icone("arrow-left"), "Hub"]),
          botaoTema(),
        ]),
      ]),
      el("div", { classe: "topo-secundaria" }, [abasModulo, status]),
    ]),
    layout,
    rodape(area),
  ])));
  window.addEventListener("hashchange", navegar);
  window.addEventListener("temaalterado", navegar);
  atualizarStatus();
  setInterval(atualizarStatus, 60000);
  navegar();
}
