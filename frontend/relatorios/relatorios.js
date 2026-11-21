import {
  api, aviso, baixarCsv, cartao, el, fmt, icone, iniciarTema, introducao, kpis,
  moduloComNavegacao, parametrosFiltro, selo, tabela, vazio,
} from "/design-system/ui.js";
import {
  DIAS_SEMANA, barrasComMedia, contarPor, dispersao, empilhadoHorizontal, gaveta, histograma, legenda,
  mapaCalor, matrizCalor, matrizGerencia, rankingLista, seriePorPeriodo,
} from "/design-system/bi.js";
import { criarEstadoFiltros, paginaComFiltros } from "/design-system/filtrado.js";

iniciarTema();

const filtros = criarEstadoFiltros();
const estadoVisao = { nivel: "coordenador", severidade: { excedentes: "", subjornada: "" } };
let exportacao = null;

const faixa = (rotulo, de, ate, cor) => ({ rotulo, de, ate, cor });
const naFaixa = (faixas, minutos) => Math.max(0, faixas.findIndex((f) => minutos >= f.de && minutos <= f.ate));
const horaCurta = (iso) => (iso ? `${fmt.dataCurta(iso)} ${fmt.hora(iso)}` : "-");

const CONFIG = {
  interjornada: {
    rotuloGaveta: "Violação de interjornada",
    descricao: "Descanso menor que 11h entre a saída de um turno e a entrada do seguinte.",
    severidades: [
      faixa("até 30min", 0, 30, "viz-6"), faixa("31 a 60min", 31, 60, "atencao"),
      faixa("1h a 2h", 61, 120, "alerta"), faixa("acima de 2h", 121, Infinity, "critico"),
    ],
    horarios: [
      { rotulo: "até 12h", de: 0, ate: 12 }, { rotulo: "12 a 15h", de: 12, ate: 15 }, { rotulo: "15 a 18h", de: 15, ate: 18 },
      { rotulo: "18 a 20h", de: 18, ate: 20 }, { rotulo: "20 a 22h", de: 20, ate: 22 }, { rotulo: "22 a 24h", de: 22, ate: 24 },
    ],
    campoHora: "saida_anterior",
  },
  excedentes: {
    rotuloGaveta: "Excedente de jornada",
    descricao: "Tempo logado acima da jornada prevista, com tolerância de 10 minutos.",
    severidades: [faixa("Alerta, até 1h", 0, 60, "atencao"), faixa("Alto, 1h a 2h", 61, 120, "alerta"), faixa("Crítico, acima de 2h", 121, Infinity, "critico")],
    tamanhos: [
      faixa("até 15min", 0, 15), faixa("15 a 30", 16, 30), faixa("30 a 45", 31, 45), faixa("45 a 60", 46, 60),
      faixa("1h a 1h30", 61, 90), faixa("1h30 a 2h", 91, 120), faixa("2h a 3h", 121, 180), faixa("acima de 3h", 181, Infinity),
    ],
    horarios: [
      { rotulo: "até 15h", de: 0, ate: 15 }, { rotulo: "15 a 18h", de: 15, ate: 18 }, { rotulo: "18 a 20h", de: 18, ate: 20 },
      { rotulo: "20 a 22h", de: 20, ate: 22 }, { rotulo: "22 a 24h", de: 22, ate: 24 },
    ],
    campoHora: "saida",
    titulos: { semanas: "Registros acima do limite", tamanho: "Tamanho do excedente", operadores: "Operadores com mais horas excedentes", detalhe: "Registros excedentes" },
  },
  subjornada: {
    rotuloGaveta: "Sub-jornada",
    descricao: "Tempo logado abaixo da jornada prevista, com tolerância de 10 minutos.",
    severidades: [
      faixa("Leve, até 30 min", 0, 30, "viz-6"), faixa("Alerta, 30 min a 1 h", 31, 60, "atencao"),
      faixa("Alto, 1 h a 2 h", 61, 119, "alerta"), faixa("Crítico, 2 h ou mais", 120, Infinity, "critico"),
    ],
    tamanhos: [
      faixa("até 15 min", 0, 15), faixa("15 a 30", 16, 30), faixa("30 a 45", 31, 45), faixa("45 a 60", 46, 60),
      faixa("1 h a 1 h 30", 61, 90), faixa("1 h 30 a 2 h", 91, 119), faixa("2 h a 3 h", 120, 180), faixa("3 h ou mais", 181, Infinity),
    ],
    horarios: [
      { rotulo: "até 8 h", de: 0, ate: 8 }, { rotulo: "8 a 10 h", de: 8, ate: 10 }, { rotulo: "10 a 12 h", de: 10, ate: 12 },
      { rotulo: "12 a 14 h", de: 12, ate: 14 }, { rotulo: "14 a 16 h", de: 14, ate: 16 }, { rotulo: "16 h ou mais", de: 16, ate: 24 },
    ],
    campoHora: "saida",
    titulos: { semanas: "Registros com déficit", tamanho: "Tamanho do déficit", operadores: "Operadores com mais horas de déficit", detalhe: "Registros com déficit" },
  },
};

function porAgente(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.matricula)) mapa.set(l.matricula, []);
    mapa.get(l.matricula).push(l);
  }
  return [...mapa.values()].sort((a, b) => b.length - a.length || a[0].nome.localeCompare(b[0].nome, "pt-BR", { numeric: true }));
}

async function abrirAgente(tipo, linha, linhas, periodo) {
  const config = CONFIG[tipo];
  const proprias = linhas.filter((l) => l.matricula === linha.matricula).sort((a, b) => b.data.localeCompare(a.data));
  const total = proprias.reduce((s, l) => s + l.minutos, 0);
  const dias = el("div", {}, el("div", { classe: "carregando" }, [icone("loader-2"), "Carregando dias"]));
  gaveta({
    rotulo: config.rotuloGaveta,
    titulo: linha.nome,
    subtitulo: `${linha.matricula} · ${linha.supervisor} · ${linha.servico}`,
    conteudo: [
      kpis([
        { rotulo: "Ocorrências", valor: fmt.numero(proprias.length), tom: proprias.length >= 2 ? "critico" : "" },
        { rotulo: tipo === "interjornada" ? "Déficit total" : tipo === "excedentes" ? "Excedente total" : "Déficit total", valor: fmt.minutos(total) },
        { rotulo: "Período", valor: `${fmt.dataCurta(periodo.de)} a ${fmt.dataCurta(periodo.ate)}` },
      ]),
      el("h3", { texto: "Ocorrências no recorte" }),
      el("div", {}, proprias.map((l) => el("div", { classe: "ocorrencia" }, [
        el("b", { texto: fmt.data(l.data) }),
        el("span", {
          texto: tipo === "interjornada"
            ? `Saída ${horaCurta(l.saida_anterior)} · entrada ${fmt.hora(l.entrada)} · descanso ${fmt.minutos(l.descanso)}`
            : `Previsto ${fmt.hora(l.entrada_prevista)} às ${fmt.hora(l.saida_prevista)} · realizado ${fmt.hora(l.entrada)} às ${fmt.hora(l.saida)}`,
        }),
        el("strong", { classe: l.minutos > 120 ? "fora" : null, texto: fmt.minutos(l.minutos) }),
      ]))),
      el("h3", { texto: "Todos os dias trabalhados" }),
      dias,
    ],
  });
  try {
    const parametros = new URLSearchParams({ tipo, de: periodo.de, ate: periodo.ate });
    const dados = await api(`/api/relatorios/colaborador/${encodeURIComponent(linha.matricula)}?${parametros}`);
    dias.replaceChildren(tabela({
      busca: false,
      porPagina: 10,
      colunas: [
        { chave: "data", titulo: "Dia", formato: fmt.data, forte: true },
        { chave: "entrada_prevista", titulo: "Previsto", formato: (v, l) => `${fmt.hora(v)} às ${fmt.hora(l.saida_prevista)}` },
        { chave: "entrada", titulo: "Realizado", formato: (v, l) => `${fmt.hora(v)} às ${fmt.hora(l.saida)}` },
        { chave: "minutos_logados", titulo: "Logado", alinhar: "direita", formato: fmt.minutos },
      ],
      linhas: dados.registros,
    }));
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

function graficoSeveridadePorCoordenacao(linhas, severidades) {
  const mapa = new Map();
  for (const l of linhas) {
    if (!l.coordenador) continue;
    if (!mapa.has(l.coordenador)) mapa.set(l.coordenador, severidades.map(() => 0));
    mapa.get(l.coordenador)[naFaixa(severidades, l.minutos)] += 1;
  }
  const top = [...mapa.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0)).slice(0, 10);
  if (!top.length) return vazio("Nenhuma coordenação no recorte");
  return [legenda(severidades), empilhadoHorizontal({ rotulos: top.map(([c]) => c), faixas: severidades, matriz: top.map(([, v]) => v), descricao: "Severidade por coordenação" })];
}

function painelQuando(config, linhas, sub) {
  return cartao({
    titulo: "Quando acontece",
    detalhe: sub,
    corpo: linhas.length
      ? mapaCalor({ linhas: DIAS_SEMANA, colunas: config.horarios.map((h) => h.rotulo), matriz: matrizCalor(linhas, { campoData: config.campoHora, campoHora: config.campoHora, faixasHora: config.horarios }) })
      : vazio("Nenhuma ocorrência no recorte"),
  });
}

function concentracaoAviso(agentes, total, rotulo) {
  if (agentes.length <= 3 || !total) return null;
  const top3 = agentes.slice(0, 3).reduce((s, a) => s + a.length, 0);
  if (top3 / total < 0.3) return null;
  return el("div", { classe: "aviso-bloco" }, [icone("info-circle"), el("div", {}, el("b", { texto: `${fmt.numero(top3)} das ${fmt.numero(total)} ${rotulo} (${fmt.pct((top3 / total) * 100)}) vêm de 3 agentes.` }))]);
}

const COLUNAS_INTERJORNADA = [
  { chave: "nome", titulo: "Agente", forte: true },
  { chave: "servico", titulo: "Serviço" },
  { chave: "supervisor", titulo: "Supervisão" },
  { chave: "coordenador", titulo: "Coordenação" },
  { chave: "gerente", titulo: "Gerência", formato: (v) => v || "Sem gerência" },
  { chave: "saida_anterior", titulo: "Saída", formato: horaCurta },
  { chave: "entrada", titulo: "Entrada", formato: horaCurta },
  { chave: "descanso", titulo: "Intervalo", alinhar: "direita", formato: fmt.minutos, render: (v) => selo(fmt.minutos(v), v < 600 ? "critico" : "forte") },
];

function desenharInterjornada(dados, abrir) {
  const config = CONFIG.interjornada;
  const linhas = dados.linhas;
  exportacao = { colunas: COLUNAS_INTERJORNADA, linhas, nome: `interjornada_${dados.de}_${dados.ate}` };
  const ctx = dados.contexto;
  const agentes = porAgente(linhas);
  const reincidentes = agentes.filter((a) => a.length >= 2);
  const servicosAfetados = new Set(linhas.map((l) => l.servico)).size;
  const serie = seriePorPeriodo(linhas, "data", dados.de, dados.ate);

  const painelGravidade = cartao({ titulo: "Gravidade por coordenação", detalhe: "Déficit de descanso, 10 coordenações com mais violações", corpo: graficoSeveridadePorCoordenacao(linhas, config.severidades) });
  const painelServicos = cartao({
    titulo: "Serviços: volume x taxa de violação",
    detalhe: "Eixo em escala logarítmica",
    corpo: ctx.servicos.length ? dispersao({
      pontos: ctx.servicos.map((s) => ({ x: s.transicoes, y: s.pct, v: s.violacoes, n: s.servico })),
      rotuloX: "Transições no período", rotuloY: "% com violação", descricao: "Serviços por volume e taxa de violação",
    }) : vazio("Nenhum serviço no recorte"),
  });
  const quando = painelQuando(config, linhas, "Pela saída do turno anterior");

  return [
    kpis([
      { rotulo: "Violações", valor: fmt.numero(linhas.length), tom: linhas.length ? "critico" : "", detalhe: ["Abaixo de 11h", `${fmt.pct(ctx.transicoes ? (linhas.length / ctx.transicoes) * 100 : 0)} das ${fmt.numero(ctx.transicoes)} transições`] },
      { rotulo: "Agentes com violação", valor: fmt.numero(agentes.length), detalhe: [`${fmt.pct(ctx.operadores_analisados ? (agentes.length / ctx.operadores_analisados) * 100 : 0)}`, `de ${fmt.numero(ctx.operadores_analisados)} operadores analisados`] },
      { rotulo: "Serviços afetados", valor: `${fmt.numero(servicosAfetados)} de ${fmt.numero(ctx.servicos_total)}`, detalhe: `Intervalo médio geral ${fmt.minutos(ctx.media_intervalo_min)}` },
    ]),
    el("div", { classe: "grade g-3-2" }, [
      cartao({ titulo: serie.porDia ? "Violações por dia" : "Violações por semana", corpo: linhas.length ? barrasComMedia({ rotulos: serie.rotulos, series: [{ nome: "Violações", valores: serie.valores }], descricao: "Violações no período" }) : vazio("Nenhuma violação no recorte") }),
      cartao({ titulo: "Distribuição dos intervalos", detalhe: `${fmt.numero(ctx.transicoes)} transições`, corpo: ctx.transicoes ? histograma({ rotulos: ctx.histograma.rotulos, valores: ctx.histograma.valores, destaque: 4, logaritmico: true, descricao: "Distribuição dos intervalos de descanso" }) : vazio("Distribuição indisponível") }),
    ]),
    reincidentes.length
      ? el("div", { classe: "grade g-2" }, [
        el("div", { classe: "grade" }, [
          cartao({
            titulo: "Agentes reincidentes",
            detalhe: `${fmt.numero(reincidentes.length)} reincidentes`,
            corpo: [
              concentracaoAviso(agentes, linhas.length, "violações"),
              rankingLista(reincidentes.slice(0, 8).map((vs) => {
                const pior = vs.reduce((a, b) => (a.descanso <= b.descanso ? a : b));
                return { nome: vs[0].nome, valor: vs.length, forte: vs.length / linhas.length >= 0.1, sub: `${vs[0].servico} · pior ${fmt.minutos(pior.descanso)}`, registro: pior };
              }), (l) => abrir(l.registro)),
            ],
          }),
          quando,
        ]),
        el("div", { classe: "grade" }, [painelGravidade, painelServicos]),
      ])
      : el("div", { classe: "grade" }, [painelGravidade, el("div", { classe: "grade g-2" }, [quando, painelServicos])]),
    cartao({
      titulo: "Matriz por gerência",
      corpo: linhas.length ? matrizGerencia({
        linhas,
        colunas: [
          { titulo: "Violações", valor: (l) => l.length },
          { titulo: "Agentes", valor: (l) => new Set(l.map((x) => x.matricula)).size },
          { titulo: "Reincidentes", valor: (l) => [...contarPor(l, "matricula").values()].filter((n) => n >= 2).length, fora: (v) => v > 0 },
          { titulo: "Maior déficit", valor: (l) => Math.max(0, ...l.map((x) => x.minutos)), formato: fmt.minutos, fora: (v, classe) => !classe },
          { titulo: "Intervalo médio", valor: (l) => l.reduce((s, x) => s + x.descanso, 0) / (l.length || 1), formato: fmt.minutos },
        ],
      }) : vazio("Nenhuma violação no recorte"),
    }),
    cartao({
      titulo: "Violações de interjornada",
      detalhe: `${fmt.numero(linhas.length)} registros`,
      corpo: tabela({
        porPagina: 20,
        colunas: COLUNAS_INTERJORNADA,
        linhas,
        exportar: `interjornada_${dados.de}_${dados.ate}.csv`,
        placeholder: "Buscar por nome ou qualquer coluna",
        textoVazio: "Nenhuma violação no recorte.",
        aoClicar: abrir,
      }),
    }),
  ];
}

function desenharJornada(tipo, dados, abrir) {
  const config = CONFIG[tipo];
  const ctx = dados.contexto;
  const severidade = estadoVisao.severidade[tipo];
  const linhas = severidade === "" ? dados.linhas : dados.linhas.filter((l) => naFaixa(config.severidades, l.minutos) === Number(severidade));
  const agentes = porAgente(linhas);
  const contagemSev = config.severidades.map((_, i) => linhas.filter((l) => naFaixa(config.severidades, l.minutos) === i).length);
  const indiceCritico = config.severidades.length - 1;
  const totalMin = linhas.reduce((s, l) => s + l.minutos, 0);
  const porMinutos = agentes.map((vs) => ({ vs, minutos: vs.reduce((s, l) => s + l.minutos, 0) })).sort((a, b) => b.minutos - a.minutos);
  const concentracao = totalMin ? (porMinutos.slice(0, 10).reduce((s, a) => s + a.minutos, 0) / totalMin) * 100 : 0;
  const serie = seriePorPeriodo(linhas, "data", dados.de, dados.ate);
  const seriesSev = config.severidades.map((f, i) => ({
    nome: f.rotulo,
    cor: f.cor,
    valores: seriePorPeriodo(linhas.filter((l) => naFaixa(config.severidades, l.minutos) === i), "data", dados.de, dados.ate).valores,
  }));
  const tamanho = config.tamanhos.map((t) => linhas.filter((l) => l.minutos >= t.de && l.minutos <= t.ate).length);
  const porSupervisao = new Map();
  for (const l of linhas) {
    if (naFaixa(config.severidades, l.minutos) !== indiceCritico) continue;
    porSupervisao.set(l.supervisor, (porSupervisao.get(l.supervisor) || 0) + 1);
  }
  const supervisoes = [...porSupervisao.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const indicadores = tipo === "excedentes"
    ? [
      { rotulo: "Acima do limite", valor: fmt.numero(linhas.length), tom: linhas.length ? "critico" : "", detalhe: `${fmt.pct(ctx.registros_analisados ? (linhas.length / ctx.registros_analisados) * 100 : 0)} de ${fmt.numero(ctx.registros_analisados)} registros` },
      { rotulo: "Críticos", valor: fmt.numero(contagemSev[2]), tom: contagemSev[2] ? "critico" : "", detalhe: "Acima de 2h" },
      { rotulo: "Altos", valor: fmt.numero(contagemSev[1]), tom: contagemSev[1] ? "alerta" : "", detalhe: "1h a 2h" },
      { rotulo: "Horas excedentes", valor: fmt.minutos(totalMin), detalhe: `Média de ${fmt.minutos(linhas.length ? totalMin / linhas.length : 0)}` },
      { rotulo: "Reincidentes", valor: fmt.numero(agentes.filter((a) => a.length >= 2).length), detalhe: `De ${fmt.numero(agentes.length)} operadores` },
      { rotulo: "Concentração", valor: fmt.pct(concentracao), detalhe: "Das horas em 10 operadores" },
    ]
    : [
      { rotulo: "Registros com déficit", valor: fmt.numero(linhas.length), tom: linhas.length ? "critico" : "", detalhe: `${fmt.pct(ctx.registros_analisados ? (linhas.length / ctx.registros_analisados) * 100 : 0)} de ${fmt.numero(ctx.registros_analisados)} registros` },
      { rotulo: "Agentes com déficit", valor: fmt.numero(agentes.length), detalhe: `De ${fmt.numero(ctx.operadores_analisados)} operadores` },
      { rotulo: "Críticos", valor: fmt.numero(contagemSev[3]), tom: contagemSev[3] ? "critico" : "", detalhe: "2 h ou mais" },
      { rotulo: "Altos", valor: fmt.numero(contagemSev[2]), tom: contagemSev[2] ? "alerta" : "", detalhe: "1 h a 2 h" },
      { rotulo: "Alertas", valor: fmt.numero(contagemSev[1]), detalhe: "30 min a 1 h" },
      { rotulo: "Horas de déficit", valor: fmt.minutos(totalMin), detalhe: `Média de ${fmt.minutos(linhas.length ? totalMin / linhas.length : 0)}` },
    ];

  const colunasDetalhe = [
    { chave: "nome", titulo: "Agente", forte: true },
    { chave: "servico", titulo: "Serviço" },
    { chave: "supervisor", titulo: "Supervisão" },
    { chave: "coordenador", titulo: "Coordenação" },
    { chave: "entrada_prevista", titulo: "Entrada planejada", formato: fmt.hora },
    { chave: "entrada", titulo: "Entrada realizada", formato: fmt.hora },
    { chave: "saida_prevista", titulo: "Saída planejada", formato: fmt.hora },
    { chave: "saida", titulo: "Saída realizada", formato: fmt.hora },
    ...(tipo === "excedentes"
      ? [
        { chave: "hora_extra", titulo: "Hora extra", alinhar: "direita", formato: (_, l) => fmt.minutos(l.minutos_logados - l.minutos_previstos) },
        { chave: "minutos", titulo: "Excedente", alinhar: "direita", formato: fmt.minutos, render: (v) => selo(fmt.minutos(v), v > 120 ? "critico" : v > 60 ? "alerta" : "forte") },
      ]
      : [
        { chave: "jornada", titulo: "Jornada" },
        { chave: "minutos", titulo: "Déficit", alinhar: "direita", formato: fmt.minutos, render: (v) => selo(fmt.minutos(v), v >= 120 ? "critico" : v > 60 ? "alerta" : "forte") },
        { chave: "observacao", titulo: "Observação", formato: (_, l) => (l.entrada > l.entrada_prevista && l.saida >= l.saida_prevista ? "Entrada atrasada" : "Saída antecipada") },
      ]),
  ];
  exportacao = { colunas: colunasDetalhe, linhas, nome: `${tipo}_${dados.de}_${dados.ate}` };

  const operadores = cartao({
    titulo: config.titulos.operadores,
    detalhe: `${fmt.numero(agentes.length)} operadores no recorte`,
    corpo: porMinutos.length ? [
      concentracaoAviso(porMinutos.map((a) => a.vs), linhas.length, "ocorrências"),
      rankingLista(porMinutos.slice(0, 8).map((a) => ({
        nome: a.vs[0].nome, valor: a.minutos, rotuloValor: fmt.minutos(a.minutos), forte: totalMin && a.minutos / totalMin >= 0.1,
        sub: `${a.vs[0].supervisor} · ${a.vs.length} ${a.vs.length === 1 ? "registro" : "registros"}`, registro: a.vs[0],
      })), (l) => abrir(l.registro)),
    ] : vazio("Nenhum operador no recorte"),
  });
  const coordenacao = cartao({ titulo: "Severidade por coordenação", detalhe: "10 coordenações com mais registros", corpo: graficoSeveridadePorCoordenacao(linhas, config.severidades) });
  const quando = painelQuando(config, linhas, "Pela saída realizada");
  const criticos = cartao({
    titulo: "Supervisões com mais críticos",
    detalhe: config.severidades[indiceCritico].rotulo,
    corpo: supervisoes.length
      ? rankingLista(supervisoes.map(([nome, n]) => {
        const exemplo = linhas.find((l) => l.supervisor === nome);
        return { nome, valor: n, forte: true, sub: `${exemplo.coordenador} · ${exemplo.gerente || "Sem gerência"}`, registro: exemplo };
      }), (l) => abrir(l.registro))
      : vazio("Nenhum registro crítico", "", "circle-check"),
  });

  return [
    kpis(indicadores),
    el("div", { classe: "grade g-3-2" }, [
      cartao({ titulo: `${config.titulos.semanas} por ${serie.porDia ? "dia" : "semana"}`, corpo: linhas.length ? barrasComMedia({ rotulos: serie.rotulos, series: seriesSev, empilhado: true, descricao: config.titulos.semanas }) : vazio("Sem dados no período", "Ajuste os filtros ou o período.") }),
      cartao({ titulo: config.titulos.tamanho, detalhe: `${fmt.numero(linhas.length)} registros`, corpo: linhas.length ? histograma({ rotulos: config.tamanhos.map((t) => t.rotulo), valores: tamanho, destaque: (i) => config.tamanhos[i].de > 120, descricao: config.titulos.tamanho }) : vazio("Sem dados no período") }),
    ]),
    el("div", { classe: "grade g-2" }, [el("div", { classe: "grade" }, [operadores, quando]), el("div", { classe: "grade" }, [coordenacao, criticos])]),
    cartao({
      titulo: "Matriz por gerência",
      corpo: linhas.length ? matrizGerencia({
        linhas,
        colunas: [
          { titulo: "Registros", valor: (l) => l.length },
          { titulo: "Agentes", valor: (l) => new Set(l.map((x) => x.matricula)).size },
          { titulo: "Críticos", valor: (l) => l.filter((x) => naFaixa(config.severidades, x.minutos) === indiceCritico).length, fora: (v) => v > 0 },
          { titulo: tipo === "excedentes" ? "Maior excedente" : "Maior déficit", valor: (l) => Math.max(0, ...l.map((x) => x.minutos)), formato: fmt.minutos, fora: (v, classe) => !classe && v > 120 },
          { titulo: tipo === "excedentes" ? "Excedente total" : "Déficit total", valor: (l) => l.reduce((s, x) => s + x.minutos, 0), formato: fmt.minutos },
        ],
      }) : vazio("Sem dados no período"),
    }),
    cartao({
      titulo: config.titulos.detalhe,
      detalhe: `${fmt.numero(linhas.length)} registros`,
      corpo: tabela({
        porPagina: 20,
        colunas: colunasDetalhe,
        linhas,
        exportar: `${tipo}_${dados.de}_${dados.ate}.csv`,
        placeholder: "Buscar por nome ou qualquer coluna",
        textoVazio: "Nenhum registro no recorte.",
        aoClicar: abrir,
      }),
    }),
  ];
}

function paginaRelatorio(tipo) {
  const config = CONFIG[tipo];
  return async (conteudo, ctx) => {
    const pagina = await paginaComFiltros(conteudo, ctx, {
      estado: filtros,
      periodo: true,
      intro: introducao(config.descricao),
      contagens: (estado) => api(`/api/relatorios/contagens${parametrosFiltro(estado)}`),
      lateral: {
        blocos: [
          { tipo: "periodo", atalhos: ["30 dias", "Mês atual", "Tudo"] },
          {
            tipo: "equipe",
            titulo: "Filtros",
            aoLimpar: () => { if (tipo !== "interjornada") estadoVisao.severidade[tipo] = ""; },
            antes: tipo === "interjornada" ? [] : [{
              chave: "severidade", rotulo: "Severidade", vazio: "Todas", unico: true,
              opcoes: config.severidades.map((f, i) => ({ t: String(i), rotulo: f.rotulo })),
              valor: () => estadoVisao.severidade[tipo],
              definir: (v) => { estadoVisao.severidade[tipo] = v; },
            }],
            niveis: [["diretoria", "Diretoria", "Todas"], ["gerente", "Gerência"], ["coordenador", "Coordenação"], ["supervisor", "Supervisão"], ["servico", "Serviço"]],
          },
          {
            tipo: "acoes",
            itens: () => [
              { icone: "file-spreadsheet", rotulo: "Exportar CSV", desabilitado: !exportacao?.linhas.length, onclick: () => baixarCsv(`${exportacao.nome}.csv`, exportacao.colunas, exportacao.linhas) },
              {
                icone: "files", rotulo: "Por gerência", titulo: "CSV ordenado e agrupado por gerência", desabilitado: !exportacao?.linhas.length,
                onclick: () => baixarCsv(`${exportacao.nome}_por_gerencia.csv`, [{ chave: "gerente", titulo: "Gerência", formato: (v) => v || "Sem gerência" }, ...exportacao.colunas.filter((c) => c.chave !== "gerente")],
                  [...exportacao.linhas].sort((a, b) => String(a.gerente).localeCompare(String(b.gerente), "pt-BR", { numeric: true }))),
              },
            ],
          },
        ],
      },
      desenhar: async (estado) => {
        const dados = await api(`/api/relatorios/${tipo}${parametrosFiltro(estado, { nivel: estadoVisao.nivel })}`);
        const periodo = { de: dados.de, ate: dados.ate };
        const abrir = (linha) => abrirAgente(tipo, linha, dados.linhas, periodo);
        return { de: dados.de, ate: dados.ate, nos: tipo === "interjornada" ? desenharInterjornada(dados, abrir) : desenharJornada(tipo, dados, abrir) };
      },
    });
    return pagina;
  };
}

moduloComNavegacao({
  titulo: "Relatórios Operacionais",
  subtitulo: "Jornada e tempo logado",
  icone: "chart-bar",
  area: "Relatórios operacionais",
  paginaInicial: "interjornada",
  grupos: [{
    titulo: "Relatórios",
    itens: [
      { chave: "interjornada", rotulo: "Interjornada", render: paginaRelatorio("interjornada") },
      { chave: "excedentes", rotulo: "Excedentes de jornada", render: paginaRelatorio("excedentes") },
      { chave: "subjornada", rotulo: "Sub-jornada", render: paginaRelatorio("subjornada") },
    ],
  }],
});
