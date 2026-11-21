import {
  api, baixarCsv, cartao, cor, el, fmt, grafico, icone, iniciarTema,
  moduloComNavegacao, parametrosFiltro, segmentado, selo, tabela, vazio,
} from "/design-system/ui.js";
import { barrasComMedia, legenda, matrizGerencia, rankingLista, semanaDe } from "/design-system/bi.js";
import { criarEstadoFiltros, paginaComFiltros } from "/design-system/filtrado.js";

iniciarTema();

const filtros = criarEstadoFiltros();
const estado = { verPor: "gerente", dimensao: "coordenador", data: "", etapas: [], visao: "atual", meses: [], agruparVagas: "gerente" };
const ETAPAS = [
  { status: "Abertura RQ", rotulo: "Abertura RQ", cor: "etapa-1" },
  { status: "Aprovação RH", rotulo: "Aprovação RH", cor: "etapa-2" },
  { status: "Em andamento recrutamento", rotulo: "Recrutamento", cor: "etapa-3" },
  { status: "Em andamento remuneração", rotulo: "Remuneração", cor: "etapa-4" },
];
const ROTULO_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.status, e.rotulo]));
const TOM_PRAZO = { "Fora do prazo": "critico", "Próximo do prazo": "alerta", "Dentro do prazo": "" };
const CARGOS = ["Agente", "Agente sênior", "Analista de qualidade"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FAIXAS_IDADE = [
  { t: "Até 3 dias", teste: (d) => d <= 3, cor: "etapa-1" },
  { t: "4 a 7 dias", teste: (d) => d >= 4 && d <= 7, cor: "alerta" },
  { t: "8 a 15 dias", teste: (d) => d >= 8 && d <= 15, cor: "critico" },
  { t: "16 a 30 dias", teste: (d) => d >= 16 && d <= 30, cor: "critico" },
  { t: "31 dias ou mais", teste: (d) => d >= 31, cor: "critico" },
];
const FAROL = [
  { chave: "verde", t: "Até 7 dias", cor: "etapa-1" },
  { chave: "amarelo", t: "8 a 30 dias", cor: "alerta" },
  { chave: "vermelho", t: "Acima de 30 dias", cor: "critico" },
];
const farolDe = (dias) => {
  const efetivos = Math.max(0, dias - 3);
  return efetivos <= 7 ? "verde" : efetivos <= 30 ? "amarelo" : "vermelho";
};
const nomeOuSem = (v, padrao = "Sem gerência") => (v && String(v).trim() ? v : padrao);
const pct = (n, total) => fmt.pct(total ? (n / total) * 100 : 0);

const linhaCargo = {
  chave: "cargo", rotulo: "Cargo", vazio: "Todos", opcoes: CARGOS.map((t) => ({ t })),
  valor: () => filtros.cargo, definir: (v) => { filtros.cargo = v; },
};
const linhaEtapa = {
  chave: "etapa", rotulo: "Etapa", vazio: "Todas", opcoes: ETAPAS.map((e) => ({ t: e.status, rotulo: e.rotulo })),
  valor: () => estado.etapas, definir: (v) => { estado.etapas = v; },
};
const filtrarEtapa = (linhas) => (estado.etapas.length ? linhas.filter((l) => estado.etapas.includes(l.status)) : linhas);

function agruparPor(linhas, campo, padrao) {
  const mapa = new Map();
  for (const l of linhas) {
    const chave = nomeOuSem(l[campo], padrao);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(l);
  }
  return mapa;
}

function faixaDist(segmentos) {
  return el("div", { classe: "dist", role: "img", "aria-label": segmentos.map((s) => `${s.rotulo} ${s.n}`).join(", ") },
    segmentos.filter((s) => s.n).map((s) => el("i", { estilo: { flex: `${s.n} 1 0`, background: `var(--${s.cor})` }, title: `${s.rotulo}: ${fmt.numero(s.n)}` })));
}

function spark(valores) {
  if (valores.length < 2) return null;
  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  const x = (i) => (i / (valores.length - 1)) * 400;
  const y = (v) => 60 - ((v - minimo) / Math.max(1, maximo - minimo)) * 52;
  const pontos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 400 64");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "hero-spark");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Jornada nos últimos ${valores.length} dias: de ${valores[0]} para ${valores.at(-1)}`);
  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", `M0,64 L${pontos.replaceAll(" ", " L")} L400,64 Z`);
  area.setAttribute("fill", cor("accent"));
  area.setAttribute("opacity", "0.12");
  const linha = document.createElementNS(ns, "polyline");
  linha.setAttribute("points", pontos);
  linha.setAttribute("fill", "none");
  linha.setAttribute("stroke", cor("accent"));
  linha.setAttribute("stroke-width", "2");
  linha.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(area, linha);
  return svg;
}

function barrasSegmentadas(grupos, partes, legendaItens, detalheDe = null) {
  const maximo = Math.max(1, ...grupos.map((g) => g.lista.length));
  const abertos = new Set();
  const raiz = el("div");
  const linha = (nome, lista, maxRef, filho = false, abrir = null, aberto = false) => el(abrir ? "button" : "div", {
    classe: "barra-etapa", type: abrir ? "button" : null, "aria-expanded": abrir ? String(aberto) : null, onclick: abrir,
    estilo: filho ? { paddingLeft: "22px" } : null,
    title: `${nome}: ${partes(lista).map((p) => `${p.rotulo} ${p.n}`).join(" · ")}`,
  }, [
    el("span", { classe: "barra-etapa-nome", estilo: filho ? { fontWeight: "400", color: "var(--text-secondary)" } : null }, [abrir ? icone(aberto ? "square-rounded-minus" : "square-rounded-plus") : null, ` ${nome}`]),
    el("span", { classe: "barra-etapa-trilho", estilo: { width: `${Math.max(4, Math.round((lista.length / maxRef) * 100))}%` } },
      partes(lista).filter((p) => p.n).map((p) => el("i", { estilo: { flex: `${p.n} 1 0`, background: `var(--${p.cor})` }, title: `${p.rotulo}: ${p.n}` }))),
    el("b", { texto: fmt.numero(lista.length) }),
  ]);
  function desenhar() {
    raiz.replaceChildren(el("div", { classe: "barras-etapa" }, grupos.flatMap((g) => {
      const aberto = abertos.has(g.nome) || grupos.length === 1;
      const filhos = detalheDe && aberto ? detalheDe(g.lista) : [];
      const maxFilho = Math.max(1, ...filhos.map((f) => f.lista.length));
      return [
        linha(g.nome, g.lista, maximo, false, detalheDe ? () => { abertos.has(g.nome) ? abertos.delete(g.nome) : abertos.add(g.nome); desenhar(); } : null, aberto),
        ...filhos.map((f) => linha(f.nome, f.lista, maxFilho, true)),
      ];
    })), legenda(legendaItens));
  }
  desenhar();
  return raiz;
}

const partesPrazo = (lista) => [
  { rotulo: "Fora do prazo", cor: "critico", n: lista.filter((l) => l.prazo === "Fora do prazo").length },
  { rotulo: "Próximo do prazo", cor: "alerta", n: lista.filter((l) => l.prazo === "Próximo do prazo").length },
  { rotulo: "No prazo", cor: "etapa-1", n: lista.filter((l) => l.prazo === "Dentro do prazo").length },
];
const partesEtapa = (lista) => ETAPAS.map((e) => ({ rotulo: e.rotulo, cor: e.cor, n: lista.filter((l) => l.status === e.status).length }));
const ordenarGrupos = (mapa) => [...mapa.entries()].map(([nome, lista]) => ({ nome, lista })).sort((a, b) => b.lista.length - a.lista.length || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

const COLUNAS_PENDENTES = [
  { chave: "matricula", titulo: "Matrícula" },
  { chave: "nome", titulo: "Colaborador", forte: true },
  { chave: "cargo", titulo: "Cargo" },
  { chave: "servico", titulo: "Serviço" },
  { chave: "coordenador", titulo: "Coordenador" },
  { chave: "gerente", titulo: "Gerente", formato: (v) => nomeOuSem(v) },
  { chave: "prazo", titulo: "Status", formato: (v) => v, render: (v) => selo(v, TOM_PRAZO[v]) },
  { chave: "data_desligamento", titulo: "Desligamento", formato: fmt.data },
  { chave: "dias_em_aberto", titulo: "Dias em aberto", alinhar: "direita" },
  { chave: "dias_para_prazo", titulo: "Dias p/ o prazo", alinhar: "direita", render: (v) => selo(String(v), v < 0 ? "critico" : "") },
];

async function paginaAbertura(conteudo, ctx) {
  let atuais = [];
  const pagina = await paginaComFiltros(conteudo, ctx, {
    estado: filtros,
    lateral: {
      visao: { titulo: "Ver por", opcoes: [["gerente", "Gerente"], ["coordenador", "Coordenador"]], ativa: () => estado.verPor, aoTrocar: (v) => { estado.verPor = v; } },
      blocos: [
        { tipo: "equipe", titulo: "Equipe", niveis: [["diretoria", "Diretoria", "Todas"], ["gerente", "Gerente"], ["coordenador", "Coordenador"], ["servico", "Serviço"]], depois: [linhaCargo] },
        { tipo: "acoes", itens: () => [{ icone: "file-spreadsheet", rotulo: "Baixar planilha", desabilitado: !atuais.length, onclick: () => baixarCsv("rqs_pendentes.csv", COLUNAS_PENDENTES, atuais) }] },
      ],
    },
    desenhar: async (filtrosAtuais) => {
      const dados = await api(`/api/reposicoes/abertura${parametrosFiltro(filtrosAtuais)}`);
      const linhas = dados.linhas;
      atuais = linhas;
      const r = dados.regras;
      if (!linhas.length) return cartao({ corpo: vazio("Nenhum registro no recorte atual", "Nenhuma RQ pendente de abertura.", "filter-off") });
      const total = linhas.length;
      const fora = linhas.filter((l) => l.prazo === "Fora do prazo").length;
      const proximas = linhas.filter((l) => l.prazo === "Próximo do prazo").length;
      const noPrazo = linhas.filter((l) => l.prazo === "Dentro do prazo").length;
      const antigo = linhas[0];
      const foraPorGerente = [...agruparPor(linhas.filter((l) => l.prazo === "Fora do prazo"), "gerente").values()].map((l) => l.length).sort((a, b) => b - a);
      const contFaixa = FAIXAS_IDADE.map((f) => linhas.filter((l) => f.teste(l.dias_em_aberto)).length);
      const maxFaixa = Math.max(1, ...contFaixa);
      const campoVer = estado.verPor;
      const dimensoes = [["coordenador", "Coordenador"], ["cargo", "Cargo"], ["servico", "Serviço"]];
      const [campoDim, rotuloDim] = dimensoes.find(([c]) => c === estado.dimensao);
      const itensDim = ordenarGrupos(agruparPor(linhas, campoDim));
      const maxDim = Math.max(1, ...itensDim.map((i) => i.lista.length));

      return [
        el("section", { classe: "hero" }, [
          el("div", { classe: "hero-grade" }, [
            el("div", {}, [
              el("div", { classe: "hero-rotulo", texto: `Fora do prazo de ${r.prazo_dias} dias` }),
              el("div", { classe: `mega${fora ? " fora" : ""}`, texto: fmt.numero(fora) }),
              el("p", { texto: `${pct(fora, total)} de ${fmt.numero(total)} ${total === 1 ? "RQ pendente" : "RQs pendentes"}` }),
              foraPorGerente.length > 1 ? el("p", {}, el("b", { texto: `2 gerências somam ${fora ? Math.round(((foraPorGerente[0] + foraPorGerente[1]) / fora) * 100) : 0}% dos atrasos` })) : null,
            ]),
            el("div", {}, [
              el("div", { classe: "hero-rotulo", texto: "Tempo em aberto" }),
              el("div", { classe: "barras-etapa", estilo: { marginTop: "6px" } }, FAIXAS_IDADE.map((f, i) => el("div", { classe: "barra-etapa", estilo: { cursor: "default", padding: "4px 0" } }, [
                el("span", { classe: "barra-etapa-nome", estilo: { fontWeight: "500" }, texto: f.t }),
                el("span", { classe: "barra-etapa-trilho", estilo: { width: `${Math.max(2, Math.round((contFaixa[i] / maxFaixa) * 100))}%` } }, contFaixa[i] ? el("i", { estilo: { flex: "1", background: `var(--${f.cor})` } }) : null),
                el("b", { texto: fmt.numero(contFaixa[i]) }),
              ]))),
            ]),
            el("div", { classe: "pilha" }, [
              el("div", {}, [el("span", { texto: "Próximo do prazo" }), el("strong", { classe: proximas ? "alerta" : null, texto: fmt.numero(proximas) }), el("small", { texto: `Entre ${r.carencia_dias + 1} e ${r.prazo_dias} dias` })]),
              el("div", {}, [el("span", { texto: "No prazo" }), el("strong", { texto: fmt.numero(noPrazo) }), el("small", { texto: `Até ${r.carencia_dias} dias, carência` })]),
              el("div", { title: `${antigo.nome} · ${antigo.servico}` }, [el("span", { texto: "Caso mais antigo" }), el("strong", { texto: `${fmt.numero(antigo.dias_em_aberto)}d` }), el("small", { texto: antigo.nome })]),
            ]),
          ]),
          faixaDist(partesPrazo(linhas)),
        ]),
        el("div", { classe: "grade g-2" }, [
          cartao({
            titulo: campoVer === "gerente" ? "RQs pendentes por gerente" : "RQs pendentes por coordenador",
            detalhe: "Expanda para ver o detalhe",
            corpo: barrasSegmentadas(ordenarGrupos(agruparPor(linhas, campoVer)), partesPrazo,
              [{ rotulo: "Fora do prazo", cor: "critico" }, { rotulo: "Próximo do prazo", cor: "alerta" }, { rotulo: "No prazo", cor: "etapa-1" }],
              (lista) => ordenarGrupos(agruparPor(lista, campoVer === "gerente" ? "coordenador" : "supervisor"))),
          }),
          cartao({
            titulo: "RQs pendentes por",
            detalhe: "Da maior para a menor",
            acoes: segmentado({ rotulo: "Agrupar pendentes por", opcoes: dimensoes, ativa: estado.dimensao, aoTrocar: (v) => { estado.dimensao = v; pagina.atualizar(); } }),
            corpo: el("table", { classe: "pareto" }, [
              el("thead", {}, el("tr", {}, [rotuloDim, "", "RQs", "%"].map((t) => el("th", { texto: t })))),
              el("tbody", {}, itensDim.map((i, pos) => el("tr", { classe: pos === 0 ? "forte" : null }, [
                el("td", { texto: i.nome }),
                el("td", {}, el("span", { classe: "trilho" }, el("span", { estilo: { width: `${Math.round((i.lista.length / maxDim) * 100)}%` } }))),
                el("td", { texto: fmt.numero(i.lista.length) }),
                el("td", { texto: pct(i.lista.length, total) }),
              ]))),
            ]),
          }),
        ]),
        cartao({
          titulo: "Lista de RQs pendentes",
          detalhe: `${fmt.numero(total)} desligamentos sem RQ`,
          corpo: tabela({ colunas: COLUNAS_PENDENTES, linhas, porPagina: 10, placeholder: "Buscar nome ou matrícula", textoVazio: "Nenhuma RQ pendente no recorte." }),
        }),
      ];
    },
  });
}

const COLUNAS_CONTROLE = [
  { chave: "matricula", titulo: "Matrícula" },
  { chave: "nome", titulo: "Colaborador", forte: true },
  { chave: "cargo", titulo: "Cargo" },
  { chave: "servico", titulo: "Serviço" },
  { chave: "data_desligamento", titulo: "Desligamento", formato: fmt.data },
  { chave: "dias_em_aberto", titulo: "Dias em aberto", alinhar: "direita" },
  { chave: "rq", titulo: "RQ reposição", formato: (v) => v || "-" },
  { chave: "status", titulo: "Status", formato: (v) => ROTULO_ETAPA[v] || v },
  { chave: "coordenador", titulo: "Coordenador" },
  { chave: "gerente", titulo: "Gerente", formato: (v) => nomeOuSem(v) },
  { chave: "diretoria", titulo: "Diretor" },
  { chave: "prazo", titulo: "Observação", formato: (v) => v || "-" },
];

function heroControle(dados, linhas) {
  const total = linhas.length;
  const fora = linhas.filter((l) => l.prazo === "Fora do prazo").length;
  const proximo = linhas.filter((l) => l.prazo === "Próximo do prazo").length;
  const abertura = linhas.filter((l) => l.status === "Abertura RQ").length;
  if (!dados.hoje) {
    return el("section", { classe: "hero" }, [
      el("div", { classe: "hero-rotulo", texto: `Jornada das reposições em ${fmt.data(dados.data)}` }),
      el("div", { classe: "mega", texto: fmt.numero(total) }),
      el("p", { texto: "Retrato daquele dia. O prazo não se aplica a data passada." }),
      faixaDist(partesEtapa(linhas)),
    ]);
  }
  const foraPorGerencia = [...agruparPor(linhas, "gerente").values()].map((l) => l.filter((x) => x.prazo === "Fora do prazo").length).sort((a, b) => b - a);
  const top2 = fora ? Math.round(((foraPorGerencia[0] || 0) + (foraPorGerencia[1] || 0)) / fora * 100) : 0;
  const serie = dados.serie.map((p) => p.total);
  const variacao = serie.length ? serie.at(-1) - serie[0] : null;
  return el("section", { classe: "hero" }, [
    el("div", { classe: "hero-grade" }, [
      el("div", {}, [
        el("div", { classe: "hero-rotulo", texto: "Fora do prazo" }),
        el("div", { classe: `mega${fora ? " fora" : ""}`, texto: fmt.numero(fora) }),
        el("p", { texto: `${pct(fora, total)} das ${fmt.numero(total)} reposições` }),
        fora && foraPorGerencia.length > 1 ? el("p", {}, el("b", { texto: `2 gerências concentram ${top2}% dos atrasos` })) : null,
      ]),
      el("div", {}, [
        el("div", { classe: "hero-rotulo", texto: "Jornada das reposições" }),
        el("div", { classe: "hero-num" }, [el("strong", { texto: fmt.numero(total) }), variacao !== null ? el("span", { texto: `${variacao > 0 ? "+" : ""}${fmt.numero(variacao)} no mês` }) : null]),
        spark(serie),
      ]),
      el("div", { classe: "pilha" }, [
        el("div", {}, [el("span", { texto: "Próximo do prazo" }), el("strong", { classe: proximo ? "alerta" : null, texto: fmt.numero(proximo) }), el("small", { texto: `${pct(proximo, total)} do total` })]),
        el("div", {}, [el("span", { texto: "Abertura RQ" }), el("strong", { texto: fmt.numero(abertura) }), el("small", { texto: `Prazo de ${dados.regras.prazo_dias} dias` })]),
        el("div", { title: "Ciclos concluídos no mês (não entram no total)" }, [el("span", { texto: "Fechadas no mês" }), el("strong", { texto: fmt.numero(dados.fechadas_mes) }), el("small", { texto: "Não entram no total" })]),
      ]),
    ]),
    faixaDist([{ rotulo: "Fora do prazo", cor: "critico", n: fora }, { rotulo: "Próximo do prazo", cor: "alerta", n: proximo }, { rotulo: "No prazo", cor: "etapa-1", n: total - fora - proximo }]),
  ]);
}

function prazoPorGerencia(linhas, prazoDias) {
  const totalFora = linhas.filter((l) => l.prazo === "Fora do prazo").length;
  const grupos = [...agruparPor(linhas, "gerente").entries()].map(([g, l]) => {
    const fora = l.filter((x) => x.prazo === "Fora do prazo").length;
    const aberturas = l.filter((x) => x.status === "Abertura RQ").map((x) => x.dias_em_aberto);
    return { g, total: l.length, fora, pct: l.length ? (fora / l.length) * 100 : 0, dias: aberturas.length ? Math.max(...aberturas) : null };
  }).sort((a, b) => b.fora - a.fora || b.total - a.total);
  const maxTotal = Math.max(1, ...grupos.map((g) => g.total));
  const maxDias = Math.max(1, ...grupos.map((g) => g.dias || 0));
  const media = linhas.length ? (totalFora / linhas.length) * 100 : 0;
  let acumulado = 0;
  return el("table", { classe: "pareto" }, [
    el("thead", {}, el("tr", {}, ["Gerência", "", "Reposições", "Fora do prazo", "% fora", "Acumulado", "", "Tempo para abrir"].map((t) => el("th", { texto: t })))),
    el("tbody", {}, grupos.map((g) => {
      acumulado += g.fora;
      const destaque = g.fora && g.pct > media;
      return el("tr", { classe: destaque ? "forte" : null, title: `${g.g}: ${g.fora} de ${g.total} fora do prazo` }, [
        el("td", { texto: g.g }),
        el("td", {}, el("span", { classe: "trilho" }, el("span", { estilo: { width: `${Math.round((g.total / maxTotal) * 100)}%` } }))),
        el("td", { texto: fmt.numero(g.total) }),
        el("td", { classe: g.fora ? "fora" : null, texto: g.fora ? fmt.numero(g.fora) : "-" }),
        el("td", { classe: destaque ? "fora" : null, texto: fmt.pct(g.pct) }),
        el("td", { texto: totalFora && g.fora ? `${Math.round((acumulado / totalFora) * 100)}%` : "-" }),
        el("td", {}, g.dias === null ? "" : el("span", { classe: "trilho" }, el("span", { classe: g.dias > prazoDias ? "fora" : null, estilo: { width: `${Math.round((g.dias / maxDias) * 100)}%` } }))),
        el("td", { classe: g.dias > prazoDias ? "fora" : null, texto: g.dias === null ? "-" : `${g.dias}d` }),
      ]);
    })),
  ]);
}

function mediasPorMes(serie) {
  const meses = new Map();
  for (const p of serie) {
    const chave = p.data.slice(0, 7);
    if (!meses.has(chave)) meses.set(chave, []);
    meses.get(chave).push(p);
  }
  return [...meses.entries()].map(([chave, pontos]) => {
    const media = (campo) => pontos.reduce((s, p) => s + p[campo], 0) / pontos.length;
    return { chave, rotulo: `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`, total: media("total"), etapas: ["abertura", "aprovacao", "recrutamento", "remuneracao"].map((c) => Math.round(media(c))) };
  });
}

async function desenharEvolucao(filtrosAtuais) {
  const dados = await api(`/api/reposicoes/evolucao${parametrosFiltro(filtrosAtuais, { dias: 120 })}`);
  const todosMeses = mediasPorMes(dados.serie);
  if (!estado.meses.length) estado.meses = todosMeses.slice(-3).map((m) => m.chave);
  const meses = todosMeses.filter((m) => estado.meses.includes(m.chave));
  const serie = dados.serie.filter((p) => estado.meses.includes(p.data.slice(0, 7)));
  if (!serie.length) return { nos: cartao({ corpo: vazio("Selecione ao menos um mês", "Use o bloco Período na lateral.") }), meses: todosMeses, serie: [] };
  const ultimo = serie.at(-1);
  const semanas = new Map();
  for (const p of serie) {
    const chave = semanaDe(p.data);
    if (!semanas.has(chave)) semanas.set(chave, []);
    semanas.get(chave).push(p);
  }
  const resumoSemanal = [...semanas.entries()].map(([inicio, pontos]) => ({
    inicio, fim: pontos.at(-1).data, abertura: pontos[0].total, fechamento: pontos.at(-1).total, variacao: pontos.at(-1).total - pontos[0].total, fora: pontos.at(-1).fora,
  })).reverse();
  const nos = [
    el("section", { classe: "hero" }, [
      el("div", { classe: "hero-rotulo", texto: `Jornada das reposições ·${meses.map((m) => m.rotulo).join(", ")}` }),
      el("div", { classe: "hero-num" }, [el("strong", { texto: fmt.numero(ultimo.total) }), el("span", { texto: `em ${fmt.data(ultimo.data)} · média de ${fmt.numero(Math.round(serie.reduce((s, p) => s + p.total, 0) / serie.length))} no período` })]),
      spark(serie.map((p) => p.total)),
    ]),
    el("div", { classe: "grade g-2" }, [
      cartao({
        titulo: "Comparação entre meses",
        detalhe: "Média diária por etapa",
        corpo: barrasComMedia({ rotulos: meses.map((m) => m.rotulo), empilhado: true, series: ETAPAS.map((e, i) => ({ nome: e.rotulo, cor: e.cor, valores: meses.map((m) => m.etapas[i]) })), descricao: "Comparação entre meses" }),
      }),
      cartao({
        titulo: "Diferença mês a mês",
        detalhe: "Variação da média diária da jornada",
        corpo: meses.length > 1 ? grafico({
          rotulos: meses.slice(1).map((m, i) => `${meses[i].rotulo} para ${m.rotulo}`),
          series: [{ nome: "Variação", valores: meses.slice(1).map((m, i) => Math.round(m.total - meses[i].total)), cor: "viz-1" }],
          unidade: "Reposições", descricao: "Diferença mês a mês",
        }) : vazio("Selecione dois meses ou mais"),
      }),
    ]),
    cartao({
      titulo: "Resumo semanal",
      corpo: tabela({
        busca: false, porPagina: 8,
        colunas: [
          { chave: "inicio", titulo: "Semana", formato: (v, l) => `${fmt.dataCurta(v)} a ${fmt.dataCurta(l.fim)}`, forte: true },
          { chave: "abertura", titulo: "Início", alinhar: "direita" },
          { chave: "fechamento", titulo: "Fim", alinhar: "direita" },
          { chave: "variacao", titulo: "Variação", alinhar: "direita", render: (v) => selo(`${v > 0 ? "+" : ""}${v}`, v > 0 ? "alerta" : "") },
          { chave: "fora", titulo: "Fora do prazo", alinhar: "direita" },
        ],
        linhas: resumoSemanal,
      }),
    }),
    cartao({
      titulo: "Detalhe por gerente e coordenador",
      detalhe: `${fmt.data(dados.inicio)} comparado a ${fmt.data(dados.fim)}`,
      corpo: matrizGerencia({
        linhas: dados.comparativo,
        colunas: [
          { titulo: "Início", valor: (l) => l.reduce((s, x) => s + x.inicio, 0) },
          { titulo: "Hoje", valor: (l) => l.reduce((s, x) => s + x.fim, 0) },
          { titulo: "Variação", valor: (l) => l.reduce((s, x) => s + x.fim - x.inicio, 0), formato: (v) => `${v > 0 ? "+" : ""}${fmt.numero(v)}`, fora: (v) => v > 0 },
        ],
      }),
    }),
  ];
  return { nos, meses: todosMeses, serie };
}

async function paginaControle(conteudo, ctx) {
  let atuais = [];
  let mesesDisponiveis = [];
  let serieEvolucao = [];
  const filtroData = el("input", { classe: "entrada", type: "date", "aria-label": "Ver como estava em", valor: estado.data });
  await paginaComFiltros(conteudo, ctx, {
    estado: filtros,
    lateral: {
      visao: { titulo: "Visão", opcoes: [["atual", "Situação atual"], ["evolucao", "Evolução"]], ativa: () => estado.visao, aoTrocar: (v) => { estado.visao = v; } },
      blocos: () => [
        estado.visao === "evolucao" ? null : {
          tipo: "conteudo", titulo: "Ver como estava em",
          nos: (atualizar) => {
            filtroData.onchange = (e) => { estado.data = e.target.value; atualizar(); };
            return [el("div", { classe: "campo" }, [el("span", { classe: "campo-rotulo", texto: "Dia" }), filtroData])];
          },
        },
        estado.visao !== "evolucao" ? null : {
          tipo: "filtros", titulo: "Período",
          filtros: [{
            chave: "meses", rotulo: "Meses", vazio: "Selecionar", semLimpar: true, semDestaque: true,
            opcoes: () => mesesDisponiveis.map((m) => ({ t: m.chave, rotulo: m.rotulo })),
            valor: () => estado.meses,
            textoValor: () => (estado.meses.length === 1 ? mesesDisponiveis.find((m) => m.chave === estado.meses[0])?.rotulo : `${estado.meses.length} meses`),
            definir: (v) => { estado.meses = v.length ? v : estado.meses; },
          }],
        },
        estado.visao === "evolucao"
          ? { tipo: "equipe", titulo: "Equipe", niveis: [["diretoria", "Diretoria", "Todas"], ["gerente", "Gerente"], ["coordenador", "Coordenador"]] }
          : { tipo: "equipe", titulo: "Equipe", niveis: [["diretoria", "Diretoria", "Todas"], ["gerente", "Gerente"], ["coordenador", "Coordenador"], ["servico", "Serviço"]], depois: [linhaEtapa] },
        estado.visao === "evolucao" ? { tipo: "acoes", itens: () => [{ icone: "file-spreadsheet", rotulo: "Baixar planilha", desabilitado: !serieEvolucao.length, onclick: () => baixarCsv("evolucao_jornada.csv", [{ chave: "data", titulo: "Data" }, { chave: "total", titulo: "Jornada" }, { chave: "fora", titulo: "Fora do prazo" }], serieEvolucao) }] } : {
          tipo: "acoes",
          itens: () => [
            { icone: "file-spreadsheet", rotulo: "Baixar planilha", desabilitado: !atuais.length, onclick: () => baixarCsv("controle_reposicao.csv", COLUNAS_CONTROLE, atuais) },
            {
              icone: "files", rotulo: `Planilha por gerente (${agruparPor(atuais, "gerente").size})`, desabilitado: !atuais.length,
              onclick: () => baixarCsv("controle_reposicao_por_gerente.csv", COLUNAS_CONTROLE, [...atuais].sort((a, b) => String(a.gerente).localeCompare(String(b.gerente), "pt-BR", { numeric: true }))),
            },
          ],
        },
      ],
    },
    desenhar: async (filtrosAtuais) => {
      if (estado.visao === "evolucao") {
        const resultado = await desenharEvolucao(filtrosAtuais);
        mesesDisponiveis = resultado.meses;
        serieEvolucao = resultado.serie;
        return resultado.nos;
      }
      const dados = await api(`/api/reposicoes/controle${parametrosFiltro(filtrosAtuais, { data: estado.data })}`);
      const linhas = filtrarEtapa(dados.linhas);
      atuais = linhas;
      if (!linhas.length) return cartao({ corpo: vazio("Nenhum resultado para os filtros selecionados", "Ajuste ou limpe os filtros na lateral.", "filter-off") });
      const porEtapa = partesEtapa(linhas);
      const congeladas = ordenarGrupos(agruparPor(dados.congeladas, "gerente")).map((g) => ({ nome: g.nome, valor: g.lista.length, sub: `${g.lista.length} ${g.lista.length === 1 ? "vaga suspensa" : "vagas suspensas"}` }));
      return [
        heroControle(dados, linhas),
        el("div", { classe: "grade g-3-2" }, [
          cartao({ titulo: "Reposições por gerência e etapa", detalhe: "Da maior para a menor", corpo: barrasSegmentadas(ordenarGrupos(agruparPor(linhas, "gerente")), partesEtapa, ETAPAS) }),
          el("div", { classe: "grade" }, [
            cartao({
              titulo: "Reposições por etapa",
              detalhe: `Distribuição das ${fmt.numero(linhas.length)} reposições`,
              corpo: [
                el("div", { classe: "rampa" }, porEtapa.map((p) => (p.n ? el("i", { estilo: { flex: `${p.n} 1 0`, background: `var(--${p.cor})` } }) : null))),
                el("div", { classe: "etapas-lista" }, porEtapa.map((p, i) => el("div", { classe: "etapa-item" }, [
                  el("i", { estilo: { background: `var(--${p.cor})` } }),
                  el("span", {}, [p.rotulo, i === 0 && dados.hoje ? el("small", { texto: `Prazo de ${dados.regras.prazo_dias} dias` }) : null]),
                  el("b", {}, [fmt.numero(p.n), el("span", { texto: ` · ${pct(p.n, linhas.length)}` })]),
                ]))),
              ],
            }),
            congeladas.length ? cartao({ titulo: "Vagas congeladas", detalhe: `${fmt.numero(dados.congeladas.length)} vagas suspensas por congelamento`, corpo: rankingLista(congeladas, () => null) }) : null,
          ]),
        ]),
        dados.hoje ? cartao({
          titulo: "Prazo por gerência",
          detalhe: `Média geral de ${pct(linhas.filter((l) => l.prazo === "Fora do prazo").length, linhas.length)} fora do prazo`,
          corpo: prazoPorGerencia(linhas, dados.regras.prazo_dias),
        }) : null,
        cartao({
          titulo: dados.hoje ? "Reposições por gerente e coordenador" : `Reposições em ${fmt.data(dados.data)}`,
          detalhe: dados.hoje ? "" : "Retrato daquele dia. O prazo não se aplica a data passada.",
          corpo: matrizGerencia({
            linhas: [...linhas, ...dados.fechadas.map((f) => ({ ...f, status: "Fechada" }))],
            colunas: [
              { titulo: "Abertura RQ", valor: (l) => l.filter((x) => x.status === "Abertura RQ").length },
              { titulo: "Tempo para abrir", valor: (l) => Math.max(0, ...l.filter((x) => x.status === "Abertura RQ").map((x) => x.dias_em_aberto)), formato: (v) => (v ? `${v}d` : "-"), fora: (v) => v > 7 },
              ...ETAPAS.slice(1).map((e) => ({ titulo: e.rotulo, valor: (l) => l.filter((x) => x.status === e.status).length })),
              { titulo: "Próximo do prazo", valor: (l) => l.filter((x) => x.prazo === "Próximo do prazo").length },
              { titulo: "Fora do prazo", valor: (l) => l.filter((x) => x.prazo === "Fora do prazo").length, fora: (v) => v > 0 },
              { titulo: "Fechadas", valor: (l) => l.filter((x) => x.status === "Fechada").length },
              { titulo: "Total", valor: (l) => l.filter((x) => x.status !== "Fechada").length },
            ],
            detalhe: (lista) => tabela({ busca: false, porPagina: 6, colunas: COLUNAS_CONTROLE.slice(0, 9), linhas: lista.filter((x) => x.status !== "Fechada") }),
          }),
        }),
      ];
    },
  });
}

const COLUNAS_VAGAS = [
  { chave: "matricula", titulo: "Matrícula" },
  { chave: "nome", titulo: "Colaborador", forte: true },
  { chave: "cargo", titulo: "Cargo" },
  { chave: "servico", titulo: "Serviço" },
  { chave: "gerente", titulo: "Gerente", formato: (v) => nomeOuSem(v) },
  { chave: "coordenador", titulo: "Coordenador" },
  { chave: "status", titulo: "Status", formato: (v) => ROTULO_ETAPA[v] || v },
  { chave: "data_desligamento", titulo: "Desligamento", formato: fmt.data },
  { chave: "dias_em_aberto", titulo: "Dias em aberto", alinhar: "direita" },
  { chave: "farol", titulo: "SLA abertura RQ", formato: (v) => FAROL.find((f) => f.chave === v)?.t, render: (v) => selo(FAROL.find((f) => f.chave === v)?.t, v === "vermelho" ? "critico" : v === "amarelo" ? "alerta" : "") },
  { chave: "rq", titulo: "RQ", formato: (v) => v || "-" },
];

async function paginaQuadroVagas(conteudo, ctx) {
  let atuais = [];
  const pagina = await paginaComFiltros(conteudo, ctx, {
    estado: filtros,
    lateral: {
      blocos: [
        { tipo: "equipe", titulo: "Equipe", niveis: [["gerente", "Gerente"], ["coordenador", "Coordenador"], ["servico", "Serviço"]], depois: [linhaEtapa] },
        { tipo: "acoes", itens: () => [{ icone: "file-spreadsheet", rotulo: "Baixar planilha", desabilitado: !atuais.length, onclick: () => baixarCsv("lista_de_vagas.csv", COLUNAS_VAGAS, atuais) }] },
      ],
    },
    desenhar: async (filtrosAtuais) => {
      const dados = await api(`/api/reposicoes/quadro-vagas${parametrosFiltro(filtrosAtuais)}`);
      const linhas = filtrarEtapa(dados.linhas).map((l) => ({ ...l, farol: farolDe(l.dias_em_aberto) }));
      atuais = linhas;
      if (!linhas.length) return cartao({ corpo: vazio("Nenhum resultado para os filtros selecionados", "Ajuste ou limpe os filtros na lateral.", "filter-off") });
      const total = linhas.length;
      const aberturas = linhas.filter((l) => l.status === "Abertura RQ");
      const conta = (lista, chave) => lista.filter((l) => l.farol === chave).length;
      const vermelho = conta(aberturas, "vermelho");
      const vermPorGerente = [...agruparPor(aberturas.filter((l) => l.farol === "vermelho"), "gerente").values()].map((l) => l.length).sort((a, b) => b - a);
      const maior = (campo) => ordenarGrupos(agruparPor(linhas, campo))[0];
      const maiores = [["Gerente", "gerente"], ["Coordenador", "coordenador"], ["Serviço", "servico"]].map(([rot, campo]) => ({ rot, ...maior(campo) }));
      const resumo = ETAPAS.map((e) => {
        const lista = linhas.filter((l) => l.status === e.status);
        return { etapa: e.rotulo, verde: conta(lista, "verde"), amarelo: conta(lista, "amarelo"), vermelho: conta(lista, "vermelho"), total: lista.length, mais_antiga: lista.length ? Math.max(...lista.map((l) => l.dias_em_aberto)) : null };
      });
      resumo.push({ etapa: "Total geral", verde: conta(linhas, "verde"), amarelo: conta(linhas, "amarelo"), vermelho: conta(linhas, "vermelho"), total, mais_antiga: Math.max(...linhas.map((l) => l.dias_em_aberto)), total_geral: true });
      const porGerente = estado.agruparVagas === "gerente";
      return [
        el("section", { classe: "hero" }, [
          el("div", { classe: "hero-grade" }, [
            el("div", {}, [
              el("div", { classe: "hero-rotulo", texto: "Abertura RQ acima de 30 dias" }),
              el("div", { classe: `mega${vermelho ? " fora" : ""}`, texto: fmt.numero(vermelho) }),
              el("p", { texto: aberturas.length ? `${pct(vermelho, aberturas.length)} de ${fmt.numero(aberturas.length)} em Abertura RQ` : "Sem Abertura RQ no recorte" }),
              vermPorGerente.length > 1 ? el("p", {}, el("b", { texto: `2 gerentes somam ${vermelho ? Math.round(((vermPorGerente[0] + vermPorGerente[1]) / vermelho) * 100) : 0}% das vagas acima de 30 dias` })) : null,
            ]),
            el("div", {}, [
              el("div", { classe: "hero-rotulo", texto: `Onde as ${fmt.numero(total)} vagas se concentram` }),
              el("div", { classe: "pilha", estilo: { marginTop: "8px" } }, maiores.map((m) => el("div", {}, [
                el("span", { texto: m.rot }), el("strong", { texto: fmt.numero(m.lista.length) }), el("small", { texto: `${m.nome} · ${pct(m.lista.length, total)}` }),
              ]))),
            ]),
            el("div", { classe: "pilha" }, [
              el("div", {}, [el("span", { texto: "8 a 30 dias" }), el("strong", { classe: conta(aberturas, "amarelo") ? "alerta" : null, texto: fmt.numero(conta(aberturas, "amarelo")) }), el("small", { texto: "Abertura RQ" })]),
              el("div", {}, [el("span", { texto: "Até 7 dias" }), el("strong", { texto: fmt.numero(conta(aberturas, "verde")) }), el("small", { texto: "Abertura RQ, após carência" })]),
              el("div", {}, [el("span", { texto: "Vagas em aberto" }), el("strong", { texto: fmt.numero(total) }), el("small", { texto: "Nas 4 etapas" })]),
            ]),
          ]),
          faixaDist(FAROL.map((f) => ({ rotulo: f.t, cor: f.cor, n: conta(aberturas, f.chave) }))),
        ]),
        cartao({
          titulo: "O que significa cada etapa",
          corpo: el("div", { classe: "grade g-2" }, ETAPAS.map((e) => el("div", {}, [
            el("div", { classe: "lista-titulo", texto: e.rotulo }),
            el("p", { classe: "texto-secundario", estilo: { fontSize: "12.5px", marginTop: "2px" }, texto: dados.regras.descricoes[e.status] }),
          ]))),
        }),
        cartao({
          titulo: "Resumo por etapa",
          detalhe: "Dias desde o desligamento, após 3 dias de carência",
          corpo: el("table", { classe: "pareto" }, [
            el("thead", {}, el("tr", {}, ["Etapa", ...FAROL.map((f) => f.t), "Total", "Mais antiga"].map((t) => el("th", { texto: t })))),
            el("tbody", {}, resumo.map((l) => el("tr", { estilo: l.total_geral ? { background: "var(--bg-surface-alt)", fontWeight: "700" } : null }, [
              el("td", { texto: l.etapa }),
              el("td", { texto: fmt.numero(l.verde) }),
              el("td", { classe: l.amarelo && !l.total_geral ? "fora" : null, estilo: l.amarelo && !l.total_geral ? { color: "var(--alerta)" } : null, texto: fmt.numero(l.amarelo) }),
              el("td", { classe: l.vermelho && !l.total_geral ? "fora" : null, texto: fmt.numero(l.vermelho) }),
              el("td", { texto: fmt.numero(l.total) }),
              el("td", { texto: l.mais_antiga === null ? "-" : `${l.mais_antiga}d` }),
            ]))),
          ]),
        }),
        cartao({
          titulo: porGerente ? "Vagas por gerente e coordenador" : "Vagas por serviço",
          detalhe: "Dias desde o desligamento, após 3 dias de carência",
          acoes: segmentado({ rotulo: "Agrupar por", opcoes: [["gerente", "Gerente"], ["servico", "Serviço"]], ativa: estado.agruparVagas, aoTrocar: (v) => { estado.agruparVagas = v; pagina.atualizar(); } }),
          corpo: matrizGerencia({
            linhas: porGerente ? linhas : linhas.map((l) => ({ ...l, gerente: l.servico, coordenador: l.gerente || "Sem gerência" })),
            rotuloPrimeira: porGerente ? "Gerente e coordenador" : "Serviço",
            colunas: [
              { titulo: "Mais antiga", valor: (l) => Math.max(0, ...l.filter((x) => x.status === "Abertura RQ").map((x) => x.dias_em_aberto)), formato: (v) => (v ? `${v}d` : "-"), fora: (v) => v > 33 },
              ...ETAPAS.map((e) => ({ titulo: e.rotulo, valor: (l) => l.filter((x) => x.status === e.status).length })),
              { titulo: "Total", valor: (l) => l.length },
            ],
            detalhe: (lista) => tabela({ busca: false, porPagina: 6, colunas: COLUNAS_VAGAS.slice(0, 10), linhas: lista }),
          }),
        }),
        cartao({
          titulo: "Lista de vagas",
          detalhe: `${fmt.numero(total)} vagas`,
          corpo: tabela({ colunas: COLUNAS_VAGAS, linhas, porPagina: 8, placeholder: "Buscar nome, matrícula ou RQ" }),
        }),
      ];
    },
  });
}

moduloComNavegacao({
  titulo: "Controle de Reposições",
  subtitulo: "Requisições e quadro de vagas",
  icone: "arrows-exchange",
  area: "Controle de reposições",
  paginaInicial: "abertura",
  grupos: [{
    titulo: "Reposições",
    itens: [
      { chave: "abertura", rotulo: "Abertura RQ", render: paginaAbertura },
      { chave: "controle", rotulo: "Controle reposição", render: paginaControle },
      { chave: "quadro-vagas", rotulo: "Quadro de vagas", render: paginaQuadroVagas },
    ],
  }],
});
