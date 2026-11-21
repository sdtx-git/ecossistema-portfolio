import {
  abas, api, blocoErro, carregando, cartao, el, fmt, grafico, icone, iniciarTema, kpis,
  moduloComMenu, parametrosFiltro, selecao, selo, tabela, vazio,
} from "/design-system/ui.js";
import { barrasComMedia } from "/design-system/bi.js";
import { criarEstadoFiltros, obterHierarquia } from "/design-system/filtrado.js";

iniciarTema();

const filtros = criarEstadoFiltros();
const estado = { modo: "quadro", checagem: "", historicoData: "", historicoAba: "geral", desligadosAba: "resumo" };
const ROTULOS_ORIGEM = {
  campo_ausente: "Campo ausente",
  agregacao_interna: "Maioria do próprio quadro",
  vinculo_hierarquico_interno: "Vínculo hierárquico interno",
  registro_direto: "Registro direto no sistema",
  vinculo_nao_localizado: "Vínculo não localizado",
};
const ICONES_CHECAGEM = { campo_ausente: "forms", coordenacao: "sitemap", gerencia: "hierarchy-2", supervisao_sistema: "arrows-diff", sem_conta: "user-off" };
const TOM_TURMA = { "Incluída": "", Parcial: "alerta", Falta: "critico" };
const TOM_PLANILHA = { "Já em dia": "", "Divergência": "critico", "Não localizada": "alerta", "Ciclo concluído": "forte", "Fora do escopo": "" };
const CORES_CLASSE = { "Voluntário": "viz-1", "Involuntário": "viz-3", "Promoção": "viz-2", "Outra saída": "viz-6" };
const ROTULO_ETAPA = { "Aprovação RH": "Aprovação RH", "Em andamento recrutamento": "Recrutamento", "Em andamento remuneração": "Remuneração", Fechada: "Fechada", Congelada: "Congelada" };
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const colunasPessoa = [
  { chave: "matricula", titulo: "Matrícula" },
  { chave: "nome", titulo: "Nome", forte: true },
  { chave: "supervisor", titulo: "Supervisão" },
  { chave: "coordenador", titulo: "Coordenação" },
  { chave: "gerente", titulo: "Gerência", formato: (v) => v || "-" },
];

async function filtrosArea(aoMudar, { periodo = false } = {}) {
  const base = await obterHierarquia();
  const sedes = [...new Set(base.supervisores.map((s) => s.sede))].sort();
  const area = selecao([["", "Todas"], ...base.gerentes.map((g) => [g.nome, g.nome])], filtros.gerente[0] || "", {
    id: "filtro-area", onchange: (e) => { filtros.gerente = e.target.value ? [e.target.value] : []; aoMudar(); },
  });
  const sede = selecao([["", "Todas"], ...sedes.map((s) => [s, s])], filtros.sede[0] || "", {
    id: "filtro-sede", onchange: (e) => { filtros.sede = e.target.value ? [e.target.value] : []; aoMudar(); },
  });
  const campos = [el("label", { for: "filtro-area", texto: "Área" }), area, el("label", { for: "filtro-sede", texto: "Sede" }), sede];
  if (periodo) {
    const de = el("input", { classe: "entrada", type: "date", id: "filtro-de", valor: filtros.de, onchange: (e) => { filtros.de = e.target.value; aoMudar(); } });
    const ate = el("input", { classe: "entrada", type: "date", id: "filtro-ate", valor: filtros.ate, "aria-label": "Fim do período", onchange: (e) => { filtros.ate = e.target.value; aoMudar(); } });
    campos.push(el("label", { for: "filtro-de", texto: "Período" }), de, ate);
  }
  return campos;
}

async function paginaSimples(conteudo, { topo = null, periodo = false, desenhar }) {
  const corpo = el("div", { classe: "principal" });
  let pedido = 0;
  let primeiro = true;
  async function atualizar() {
    const meu = ++pedido;
    if (primeiro) corpo.replaceChildren(carregando());
    else corpo.classList.add("recarregando");
    try {
      const nos = await desenhar();
      if (meu === pedido) corpo.replaceChildren(...[].concat(nos).filter(Boolean));
    } catch (erro) {
      if (meu === pedido) corpo.replaceChildren(blocoErro(erro));
    } finally {
      if (meu === pedido) { corpo.classList.remove("recarregando"); primeiro = false; }
    }
  }
  const barra = el("div", { classe: "barra-filtros" }, await filtrosArea(atualizar, { periodo }));
  conteudo.replaceChildren(...[topo ? topo(atualizar, barra) : barra, corpo]);
  await atualizar();
  return { atualizar };
}

function rastreio(d) {
  return cartao({
    titulo: `Rastreio: ${d.nome}`,
    detalhe: `${d.matricula} · ${d.titulo}`,
    corpo: el("dl", { classe: "detalhe" }, [
      el("dt", { texto: "Campo" }), el("dd", { texto: d.campo }),
      el("dt", { texto: "Valor atual" }), el("dd", { texto: d.valor_atual || "(vazio)" }),
      el("dt", { texto: estado.modo === "quadro" ? "Informado no quadro" : "No sistema" }), el("dd", { texto: d.valor_referencia || "-" }),
      el("dt", { texto: "Origem" }), el("dd", { texto: ROTULOS_ORIGEM[d.origem] || d.origem }),
      el("dt", { texto: "Motivo" }), el("dd", { texto: d.motivo }),
    ]),
  });
}

async function detalheDiagnostico() {
  const dados = await api("/api/quadro/diagnostico");
  return [
    kpis([
      { rotulo: "Pureza média", valor: fmt.pct(dados.pureza_media), detalhe: "Equipe na coordenação majoritária" },
      { rotulo: "Supervisões mistas", valor: `${fmt.numero(dados.supervisoes_mistas)} de ${fmt.numero(dados.linhas.length)}`, tom: dados.supervisoes_mistas ? "alerta" : "" },
    ]),
    cartao({
      titulo: "Diagnóstico",
      detalhe: "Suposições por trás da checagem de coordenação, menor pureza primeiro",
      corpo: tabela({
        colunas: [
          { chave: "supervisor", titulo: "Supervisão", forte: true },
          { chave: "coordenador", titulo: "Coord. atendimento (moda)" },
          { chave: "equipe", titulo: "Operadores", alinhar: "direita" },
          { chave: "pureza", titulo: "Pureza", alinhar: "direita", formato: (v) => fmt.pct(v) },
          { chave: "situacao", titulo: "Situação", formato: (_, l) => (l.pureza < 100 ? "Mista" : "Homogênea"), render: (_, l) => selo(l.pureza < 100 ? "Mista" : "Homogênea", l.pureza < 80 ? "alerta" : "") },
        ],
        linhas: dados.linhas,
        placeholder: "Buscar supervisão",
      }),
    }),
  ];
}

async function paginaAuditoria(conteudo) {
  const base = await obterHierarquia();
  const sedes = [...new Set(base.supervisores.map((s) => s.sede))].sort();
  const corpo = el("div", { classe: "principal" });
  const modoLinha = el("div", { classe: "modo-linha" });
  let pedido = 0;

  function desenharModo() {
    modoLinha.replaceChildren(
      abas({ itens: [{ chave: "quadro", rotulo: "Dentro do quadro" }, { chave: "sistema", rotulo: "Contra o sistema" }], ativa: estado.modo, aoTrocar: (m) => { estado.modo = m; estado.checagem = ""; desenharModo(); atualizar(); } }),
      el("span", { classe: "modo-filtros" }, [
        el("label", { for: "auditoria-area", texto: "Área" }),
        selecao([["", "Todas"], ...base.gerentes.map((g) => [g.nome, g.nome])], filtros.gerente[0] || "", { id: "auditoria-area", onchange: (e) => { filtros.gerente = e.target.value ? [e.target.value] : []; atualizar(); } }),
        el("label", { for: "auditoria-sede", texto: "Sede" }),
        selecao([["", "Todas"], ...sedes.map((s) => [s, s])], filtros.sede[0] || "", { id: "auditoria-sede", onchange: (e) => { filtros.sede = e.target.value ? [e.target.value] : []; atualizar(); } }),
      ]),
    );
  }

  async function atualizar() {
    const meu = ++pedido;
    corpo.classList.add("recarregando");
    try {
      const dados = await api(`/api/quadro/auditoria${parametrosFiltro(filtros, { modo: estado.modo })}`);
      if (meu !== pedido) return;
      const checagens = [...dados.checagens].sort((a, b) => b.total - a.total);
      const itens = estado.modo === "quadro" ? [...checagens, { chave: "diagnostico", titulo: "Diagnóstico", total: null }] : checagens;
      if (!estado.checagem || !itens.some((i) => i.chave === estado.checagem)) estado.checagem = (itens.find((i) => i.total) || itens[0]).chave;
      const detalhe = el("div", { classe: "auditoria-detalhe" });
      if (!dados.divergencias.length && estado.checagem !== "diagnostico") {
        corpo.replaceChildren(cartao({ corpo: vazio("Nenhuma divergência neste recorte", `Todas as checagens ${estado.modo === "quadro" ? "dentro do quadro" : "contra o sistema"} passaram.`, "circle-check") }));
        return;
      }
      corpo.replaceChildren(
        kpis([
          { rotulo: "Registros auditados", valor: fmt.numero(dados.kpis.registros_auditados) },
          { rotulo: "Divergências", valor: fmt.numero(dados.kpis.divergencias), tom: dados.kpis.divergencias ? "critico" : "" },
          { rotulo: "Colaboradores afetados", valor: `${fmt.numero(dados.kpis.colaboradores_afetados)} de ${fmt.numero(dados.kpis.registros_auditados)}`, detalhe: `${fmt.pct(dados.kpis.percentual_afetado)} do recorte` },
        ]),
        el("div", { classe: "auditoria-split" }, [
          el("div", { classe: "divergencia-painel" }, [
            el("div", { classe: "divergencia-titulo", texto: "Checagens" }),
            el("div", { classe: "divergencia-lista", role: "listbox", "aria-label": "Checagens" }, itens.map((i) => el("button", {
              type: "button", role: "option", "aria-selected": i.chave === estado.checagem ? "true" : "false",
              classe: `divergencia-item${i.chave === estado.checagem ? " ativo" : ""}`,
              onclick: () => { estado.checagem = i.chave; atualizar(); },
            }, [
              el("span", { classe: "divergencia-nome", title: i.titulo }, [icone(i.chave === "diagnostico" ? "microscope" : ICONES_CHECAGEM[i.chave] || "list-check"), i.titulo]),
              i.total !== null ? el("span", { classe: `divergencia-qtd${i.total ? "" : " zero"}`, texto: fmt.numero(i.total) }) : null,
            ]))),
          ]),
          detalhe,
        ]),
      );
      if (estado.checagem === "diagnostico") {
        detalhe.replaceChildren(...await detalheDiagnostico());
        return;
      }
      const linhas = dados.divergencias.filter((d) => d.checagem === estado.checagem);
      const titulo = itens.find((i) => i.chave === estado.checagem).titulo;
      const padroes = new Map();
      for (const d of linhas) {
        const chave = `${d.valor_atual || "(vazio)"}|${d.valor_referencia || "-"}`;
        padroes.set(chave, (padroes.get(chave) || 0) + 1);
      }
      const clusters = [...padroes.entries()].map(([k, total]) => ({ atual: k.split("|")[0], esperado: k.split("|")[1], total })).sort((a, b) => b.total - a.total).slice(0, 5);
      const painelRastreio = el("div");
      detalhe.replaceChildren(
        cartao({
          titulo,
          detalhe: `${fmt.numero(linhas.length)} divergências · ${new Set(linhas.map((l) => l.matricula)).size} colaboradores`,
          corpo: [
            clusters.length > 1 ? el("div", { classe: "lista" }, clusters.map((c) => el("div", { classe: "lista-item" }, [
              el("div", { classe: "lista-texto" }, [el("span", { classe: "lista-titulo", texto: `${c.atual} → ${c.esperado}` }), el("span", { classe: "lista-sub", texto: "Atual e referência" })]),
              selo(fmt.numero(c.total), "forte"),
            ]))) : null,
            tabela({
              colunas: [
                { chave: "matricula", titulo: "Matrícula" },
                { chave: "nome", titulo: "Nome", forte: true },
                { chave: "sede", titulo: "Sede" },
                { chave: "campo", titulo: "Campo" },
                { chave: "valor_atual", titulo: "Atual", formato: (v) => v || "(vazio)" },
                { chave: "valor_referencia", titulo: estado.modo === "quadro" ? "Informado no quadro" : "No sistema", formato: (v) => v || "-" },
              ],
              linhas,
              exportar: `divergencias_${estado.checagem}.csv`,
              placeholder: "Buscar nome ou matrícula",
              aoClicar: (l) => painelRastreio.replaceChildren(rastreio(l)),
            }),
          ],
        }),
        painelRastreio,
      );
    } catch (erro) {
      if (meu === pedido) corpo.replaceChildren(blocoErro(erro));
    } finally {
      if (meu === pedido) corpo.classList.remove("recarregando");
    }
  }

  desenharModo();
  conteudo.replaceChildren(modoLinha, corpo);
  corpo.replaceChildren(carregando());
  await atualizar();
}

async function paginaNovatos(conteudo) {
  await paginaSimples(conteudo, {
    desenhar: async () => {
      const dados = await api(`/api/quadro/novatos${parametrosFiltro(filtros)}`);
      if (!dados.turmas.length) return cartao({ corpo: vazio("Sem turmas no período", "Nenhuma admissão nas últimas semanas para os filtros atuais.", "user-plus") });
      const semanas = [...new Set(dados.turmas.map((t) => t.inicio))].sort();
      return [
        kpis([
          { rotulo: "Turmas", valor: fmt.numero(dados.kpis.turmas), detalhe: "Últimas 6 semanas" },
          { rotulo: "Incluídas", valor: `${fmt.numero(dados.kpis.incluidas)} de ${fmt.numero(dados.kpis.turmas)}`, detalhe: "Todos no quadro" },
          { rotulo: "Parciais", valor: fmt.numero(dados.kpis.parciais), tom: dados.kpis.parciais ? "alerta" : "" },
          { rotulo: "Faltam", valor: fmt.numero(dados.kpis.faltam), tom: dados.kpis.faltam ? "critico" : "", detalhe: "Previstos fora do quadro" },
          { rotulo: "Novatos no quadro", valor: fmt.numero(dados.total) },
        ]),
        el("div", { classe: "grade g-3-2" }, [
          cartao({
            titulo: "Turmas",
            detalhe: "Mais recentes primeiro",
            corpo: tabela({
              busca: false, porPagina: 8,
              colunas: [
                { chave: "turma", titulo: "Turma", forte: true },
                { chave: "servico", titulo: "Segmento" },
                { chave: "sede", titulo: "Sede" },
                { chave: "entrega_prevista", titulo: "Entrega prevista", formato: fmt.data },
                { chave: "no_quadro", titulo: "Pessoas no quadro", alinhar: "direita", formato: (v, l) => `${v} de ${l.previstas}` },
                { chave: "situacao", titulo: "Situação", render: (v) => selo(v, TOM_TURMA[v]) },
              ],
              linhas: dados.turmas,
            }),
          }),
          cartao({
            titulo: "Admitidos por semana",
            corpo: grafico({
              rotulos: semanas.map((d) => `Sem ${fmt.dataCurta(d)}`),
              series: [{ nome: "Admitidos", valores: semanas.map((d) => dados.turmas.filter((t) => t.inicio === d).reduce((s, t) => s + t.no_quadro, 0)) }],
              unidade: "Pessoas", descricao: "Admitidos por semana",
            }),
          }),
        ]),
        cartao({ titulo: "Novatos no quadro", corpo: tabela({ colunas: [...colunasPessoa, { chave: "sede", titulo: "Sede" }, { chave: "admissao", titulo: "Admissão", formato: fmt.data }], linhas: dados.linhas, exportar: "novatos.csv", placeholder: "Buscar nome ou matrícula" }) }),
      ];
    },
  });
}

async function paginaVagas(conteudo) {
  await paginaSimples(conteudo, {
    desenhar: async () => {
      const dados = await api(`/api/quadro/vagas${parametrosFiltro(filtros)}`);
      const k = dados.kpis;
      return [
        kpis([
          { rotulo: "Linhas na planilha", valor: fmt.numero(k.linhas_planilha) },
          { rotulo: "RQs no quadro de vagas", valor: `${fmt.numero(k.rqs_quadro)} de ${fmt.numero(k.linhas_planilha)}` },
          { rotulo: "Divergências", valor: fmt.numero(k.divergencias), tom: k.divergencias ? "critico" : "", detalhe: "Etapa diferente" },
          { rotulo: "Não localizadas", valor: fmt.numero(k.nao_localizadas), tom: k.nao_localizadas ? "alerta" : "" },
          { rotulo: "Já em dia", valor: fmt.numero(k.em_dia) },
          { rotulo: "Ciclo concluído", valor: fmt.numero(k.ciclo_concluido), detalhe: "Fechada no quadro" },
          { rotulo: "Fora do escopo", valor: fmt.numero(k.fora_escopo), detalhe: "Aumento de quadro" },
        ]),
        cartao({
          titulo: "Consolidado das planilhas de RQs",
          detalhe: "Divergências e não localizadas primeiro",
          corpo: tabela({
            colunas: [
              { chave: "rq", titulo: "RQ", forte: true },
              { chave: "colaborador", titulo: "Colaborador/vaga" },
              { chave: "no_quadro", titulo: "No quadro hoje", formato: (v) => ROTULO_ETAPA[v] || v },
              { chave: "planilha", titulo: "Atualizar para (planilha)", formato: (v) => ROTULO_ETAPA[v] || v },
              { chave: "situacao", titulo: "Situação", render: (v) => selo(v, TOM_PLANILHA[v]) },
              { chave: "motivo", titulo: "Tipo" },
              { chave: "gerente", titulo: "Gerente (planilha)" },
              { chave: "servico", titulo: "Serviço" },
            ],
            linhas: dados.linhas,
            exportar: "cruzamento_planilha_rq.csv",
            placeholder: "Buscar RQ ou colaborador",
          }),
        }),
      ];
    },
  });
}

async function paginaHistorico(conteudo) {
  await paginaSimples(conteudo, {
    topo: (atualizar, barra) => {
      const abasHistorico = el("div");
      const desenharAbas = () => abasHistorico.replaceChildren(abas({
        itens: [{ chave: "geral", rotulo: "Visão geral" }, { chave: "movimentacoes", rotulo: "Movimentações" }],
        ativa: estado.historicoAba, aoTrocar: (v) => { estado.historicoAba = v; desenharAbas(); atualizar(); },
      }));
      desenharAbas();
      barra.append(
        el("label", { for: "historico-data", texto: "Ver como estava em" }),
        el("input", { classe: "entrada", type: "date", id: "historico-data", valor: estado.historicoData, onchange: (e) => { estado.historicoData = e.target.value; atualizar(); } }),
      );
      return el("div", { classe: "grade" }, [abasHistorico, barra]);
    },
    desenhar: async () => {
      const dados = await api(`/api/quadro/historico${parametrosFiltro(filtros, { data: estado.historicoData })}`);
      const variacao = dados.total_no_dia - dados.total_comparado;
      const tipos = new Map();
      for (const m of dados.movimentacoes) tipos.set(m.tipo, (tipos.get(m.tipo) || 0) + 1);
      const faixa = kpis([
        { rotulo: "Quadro na data", valor: fmt.numero(dados.total_no_dia), detalhe: fmt.data(dados.data) },
        { rotulo: "Comparado com", valor: fmt.numero(dados.total_comparado), detalhe: fmt.data(dados.comparado_com) },
        { rotulo: "Variação", valor: `${variacao > 0 ? "+" : ""}${fmt.numero(variacao)}`, tom: variacao < 0 ? "alerta" : "" },
        { rotulo: "Entradas", valor: fmt.numero(tipos.get("Entrada") || 0) },
        { rotulo: "Saídas", valor: fmt.numero(tipos.get("Saída") || 0), tom: tipos.get("Saída") ? "critico" : "" },
        { rotulo: "Alterações", valor: fmt.numero(tipos.get("Alteração") || 0), detalhe: "Troca de supervisão" },
      ]);
      if (estado.historicoAba === "movimentacoes") {
        return [faixa, cartao({
          titulo: "Movimentações",
          detalhe: `${fmt.data(dados.comparado_com)} a ${fmt.data(dados.data)}`,
          corpo: tabela({
            colunas: [
              { chave: "data", titulo: "Data", formato: fmt.data },
              { chave: "gerente", titulo: "Gerente", formato: (v) => v || "Sem gerência" },
              { chave: "matricula", titulo: "Matrícula" },
              { chave: "nome", titulo: "Colaborador", forte: true },
              { chave: "tipo", titulo: "Tipo", render: (v) => selo(v, v === "Saída" ? "critico" : v === "Alteração" ? "alerta" : "") },
              { chave: "campo", titulo: "Campo" },
              { chave: "de", titulo: "De" },
              { chave: "para", titulo: "Para" },
            ],
            linhas: dados.movimentacoes, exportar: "movimentacoes.csv", placeholder: "Buscar nome ou matrícula",
          }),
        })];
      }
      return [
        faixa,
        cartao({ titulo: "Ativos por dia", detalhe: "Últimos 60 dias", corpo: grafico({ tipo: "line", altura: 240, rotulos: dados.serie.map((p) => fmt.dataCurta(p.data)), series: [{ nome: "Ativos", valores: dados.serie.map((p) => p.ativos) }], unidade: "Pessoas", descricao: "Ativos por dia" }) }),
        el("div", { classe: "grade g-3" }, dados.quebras.map((q) => cartao({
          titulo: q.titulo,
          corpo: tabela({
            busca: false, porPagina: 6,
            colunas: [
              { chave: "nome", titulo: q.titulo.replace("Por ", ""), forte: true },
              { chave: "total", titulo: "Hoje", alinhar: "direita" },
              { chave: "antes", titulo: "Comparado", alinhar: "direita" },
              { chave: "delta", titulo: "Var.", alinhar: "direita", formato: (_, l) => { const d = l.total - l.antes; return `${d > 0 ? "+" : ""}${d}`; } },
            ],
            linhas: q.linhas,
          }),
        }))),
      ];
    },
  });
}

async function paginaDesligados(conteudo) {
  await paginaSimples(conteudo, {
    periodo: true,
    topo: (atualizar, barra) => {
      const abasDesligados = el("div");
      const desenharAbas = () => abasDesligados.replaceChildren(abas({
        itens: [{ chave: "resumo", rotulo: "Resumo" }, { chave: "gerencia", rotulo: "Análise por gerência" }, { chave: "registros", rotulo: "Registros" }],
        ativa: estado.desligadosAba, aoTrocar: (v) => { estado.desligadosAba = v; desenharAbas(); atualizar(); },
      }));
      desenharAbas();
      return el("div", { classe: "grade" }, [abasDesligados, barra]);
    },
    desenhar: async () => {
      const dados = await api(`/api/quadro/desligados${parametrosFiltro(filtros)}`);
      const k = dados.kpis;
      const faixa = kpis([
        { rotulo: "Desligamentos", valor: fmt.numero(k.desligados), tom: k.desligados ? "critico" : "", detalhe: [`${fmt.pct(k.turnover)} do efetivo`, `${fmt.data(dados.de)} a ${fmt.data(dados.ate)}`] },
        { rotulo: "Voluntários", valor: fmt.numero(k["Voluntário"]), detalhe: `${fmt.pct(k.desligados ? (k["Voluntário"] / k.desligados) * 100 : 0)} das saídas` },
        { rotulo: "Involuntários", valor: fmt.numero(k["Involuntário"]), detalhe: `${fmt.pct(k.desligados ? (k["Involuntário"] / k.desligados) * 100 : 0)} das saídas` },
        { rotulo: "Promovidos", valor: fmt.numero(k["Promoção"]), detalhe: "Saíram por promoção" },
        { rotulo: "Efetivo inicial", valor: fmt.numero(k.efetivo_inicial), detalhe: fmt.data(dados.de) },
        { rotulo: "Outras saídas", valor: fmt.numero(k["Outra saída"]) },
      ]);
      const rotuloMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
      if (estado.desligadosAba === "gerencia") {
        return [faixa, cartao({
          titulo: "Análise por gerência", detalhe: "Taxa sobre o efetivo no início do período",
          corpo: tabela({
            busca: false,
            colunas: [
              { chave: "gerente", titulo: "Gerência", forte: true },
              { chave: "efetivo", titulo: "Efetivo inicial", alinhar: "direita" },
              { chave: "total", titulo: "Desligamentos", alinhar: "direita" },
              ...dados.classes.map((c) => ({ chave: c, titulo: c, alinhar: "direita" })),
              { chave: "taxa", titulo: "Taxa", alinhar: "direita", formato: (v) => fmt.pct(v), render: (v) => selo(fmt.pct(v), v > k.turnover ? "critico" : "forte") },
            ],
            linhas: dados.por_gerencia,
          }),
        })];
      }
      if (estado.desligadosAba === "registros") {
        return [faixa, cartao({
          titulo: "Registros",
          corpo: tabela({
            colunas: [
              { chave: "matricula", titulo: "Matrícula" },
              { chave: "nome", titulo: "Colaborador", forte: true },
              { chave: "cargo", titulo: "Cargo" },
              { chave: "sede", titulo: "Sede" },
              { chave: "supervisor", titulo: "Responsável direto" },
              { chave: "coordenador", titulo: "Coord. operações" },
              { chave: "gerente", titulo: "Gerente", formato: (v) => v || "Sem gerência" },
              { chave: "motivo_desligamento", titulo: "Motivo do desligamento" },
              { chave: "classe", titulo: "Classe" },
              { chave: "data_desligamento", titulo: "Data de desligamento", formato: fmt.data },
            ],
            linhas: dados.linhas, exportar: "desligados.csv", placeholder: "Buscar nome ou matrícula",
          }),
        })];
      }
      return [
        faixa,
        cartao({
          titulo: "Evolução mensal",
          detalhe: `Últimos ${dados.evolucao.length} meses, por classe`,
          corpo: dados.evolucao.some((m) => dados.classes.some((c) => m[c]))
            ? barrasComMedia({ rotulos: dados.evolucao.map((m) => rotuloMes(m.mes)), empilhado: true, series: dados.classes.map((c) => ({ nome: c, cor: CORES_CLASSE[c], valores: dados.evolucao.map((m) => m[c]) })), descricao: "Evolução mensal dos desligamentos" })
            : vazio("Sem desligamentos nos 6 meses"),
        }),
        el("div", { classe: "grade g-2" }, [
          cartao({ titulo: "Por sede", corpo: dados.por_sede.length ? grafico({ horizontal: true, altura: 200, rotulos: dados.por_sede.map((s) => s.nome), series: [{ nome: "Desligados", valores: dados.por_sede.map((s) => s.total) }], descricao: "Desligados por sede" }) : vazio("Sem dados no período") }),
          cartao({ titulo: "Motivos", corpo: dados.por_motivo.length ? grafico({ horizontal: true, altura: 220, rotulos: dados.por_motivo.map((m) => m.nome), series: [{ nome: "Desligados", valores: dados.por_motivo.map((m) => m.total), cor: "viz-3" }], descricao: "Desligados por motivo" }) : vazio("Sem dados no período") }),
        ]),
      ];
    },
  });
}

async function paginaOrganizacao(conteudo) {
  await paginaSimples(conteudo, {
    desenhar: async () => {
      const dados = await api(`/api/quadro/organizacao${parametrosFiltro(filtros)}`);
      const antigas = dados.linhas.filter((l) => l.dias_desligado > 30).length;
      return [
        kpis([
          { rotulo: "Contas pendentes de baixa", valor: fmt.numero(dados.total), tom: dados.total ? "critico" : "" },
          { rotulo: "Pendentes há mais de 30 dias", valor: fmt.numero(antigas), tom: antigas ? "alerta" : "" },
        ]),
        cartao({
          titulo: "Desligados no arquivo de organização",
          detalhe: "Mais antigos primeiro",
          corpo: tabela({
            colunas: [
              { chave: "matricula", titulo: "Matrícula" },
              { chave: "nome", titulo: "Nome", forte: true },
              { chave: "supervisor_sistema", titulo: "Supervisão no sistema" },
              { chave: "data_desligamento", titulo: "Desligamento", formato: fmt.data },
              { chave: "dias_desligado", titulo: "Dias", alinhar: "direita" },
            ],
            linhas: dados.linhas, exportar: "contas_pendentes.csv", placeholder: "Buscar nome ou matrícula", textoVazio: "Nenhuma conta ativa de desligado.",
          }),
        }),
      ];
    },
  });
}

moduloComMenu({
  titulo: "Gestão do Quadro",
  icone: "users-group",
  area: "Gestão do quadro",
  paginaInicial: "auditoria",
  grupos: [
    {
      titulo: "Quadro de ativos",
      itens: [
        { chave: "auditoria", rotulo: "Auditoria", icone: "checkbox", descricao: "Checagens do quadro funcional, internas e contra o sistema organizacional.", render: paginaAuditoria },
        { chave: "novatos", rotulo: "Novatos", icone: "user-plus", descricao: "Turmas de novatos e quem ainda falta entrar no quadro.", render: paginaNovatos },
        { chave: "vagas", rotulo: "Vagas", icone: "briefcase", descricao: "Planilha semanal de RQs cruzada com o quadro de vagas.", render: paginaVagas },
        { chave: "historico", rotulo: "Histórico", icone: "history", descricao: "O quadro funcional como estava em cada dia, pelos arquivos da carga automática.", render: paginaHistorico },
      ],
    },
    {
      titulo: "Quadro de desligados",
      itens: [
        { chave: "desligados", rotulo: "Desligados", icone: "user-minus", descricao: "Desligamentos do período, por área.", render: paginaDesligados },
        { chave: "organizacao", rotulo: "Organização", icone: "sitemap", descricao: "Desligados que ainda constam no arquivo de organização.", render: paginaOrganizacao },
      ],
    },
  ],
});
