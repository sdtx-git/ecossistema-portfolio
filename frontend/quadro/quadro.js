import {
  abas, api, aviso, blocoErro, botao, carregando, cartao, cor, el, fmt, grafico, graficoBruto, icone, iniciarTema, kpis,
  moduloComMenu, parametrosFiltro, segmentado, selecao, selo, tabela, vazio,
} from "/design-system/ui.js";
import { criarEstadoFiltros, obterHierarquia } from "/design-system/filtrado.js";

iniciarTema("dark");

const filtros = criarEstadoFiltros();
const estado = {
  modo: "quadro", checagem: "", area: "", rodada: { quadro: false, sistema: false },
  novatosAba: "arquivo", arquivoNovatos: null, referenciaSituacao: "", vagasAba: "planilhas",
  historicoData: "", historicoAba: "quadro", desligadosAba: "resumo", desligadosArea: "", desligadosClasse: "",
  orgSetor: "", orgSituacao: "Desligado",
};
const EXTENSOES = ".xlsx,.xls,.csv";
const AREAS = [["", "Todas"], ["Planejamento", "Planejamento"], ["PGT", "PGT"]];
const ROTULO_CLASSE = { "Voluntário": "Voluntário", "Involuntário": "Involuntário", "Promoção": "Promovido", "Outra saída": "Outra saída" };
const STATUS_PLURAL = { Ativo: "Ativos", Afastado: "Afastados", "Férias": "Férias", Treinamento: "Treinamento" };
const COR_STATUS = { Ativo: "var(--ok)", Afastado: "var(--alerta)", "Férias": "var(--accent)", Treinamento: "var(--roxo)" };
const TOM_REFERENCIA = { Diverge: "critico", "Não localizada": "alerta", Confere: "" };
const ROTULO_IMPORTAR = { quadro: "Importar quadro", organizacao: "Importar organização", relatorio: "Importar relatório", treinamento: "Importar planilhas", rh: "Importar planilha" };
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
  const campos = [el("label", { for: "filtro-area", texto: "Gerência" }), area, el("label", { for: "filtro-sede", texto: "Sede" }), sede];
  if (periodo) {
    const de = el("input", { classe: "entrada", type: "date", id: "filtro-de", valor: filtros.de, onchange: (e) => { filtros.de = e.target.value; aoMudar(); } });
    const ate = el("input", { classe: "entrada", type: "date", id: "filtro-ate", valor: filtros.ate, "aria-label": "Fim do período", onchange: (e) => { filtros.ate = e.target.value; aoMudar(); } });
    campos.push(el("label", { for: "filtro-de", texto: "Período" }), de, ate);
  }
  return campos;
}

function zonaEnvio({ titulo, texto, formato, multiplo = true, compacto = false, aoEnviar }) {
  const entrada = el("input", { type: "file", accept: EXTENSOES, multiple: multiplo, hidden: true });
  const zona = el("div", { classe: `envio${compacto ? " compacto" : ""}`, role: "button", tabindex: "0", "aria-label": titulo }, [
    el("span", { classe: "envio-icone" }, icone("cloud-upload")),
    el("div", {}, [el("strong", { texto: compacto ? "Enviar outro arquivo" : titulo }), el("p", { texto })]),
    compacto ? null : el("span", { classe: "envio-formato" }, [icone("file-spreadsheet"), formato, el("code", { texto: ".xlsx" })]),
    entrada,
  ]);
  async function enviar(arquivos) {
    const nomes = [...arquivos].map((a) => a.name);
    if (!nomes.length) return;
    zona.classList.add("recarregando");
    try {
      await aoEnviar(nomes);
    } catch (erro) {
      aviso(erro.message, "erro");
    } finally {
      zona.classList.remove("recarregando");
    }
  }
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrada.click(); } });
  entrada.addEventListener("click", (e) => e.stopPropagation());
  entrada.addEventListener("change", () => { enviar(entrada.files); entrada.value = ""; });
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("arrastando"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("arrastando"));
  zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("arrastando"); enviar(e.dataTransfer.files); });
  return zona;
}

function linhaFonte(fonte, { rotulo, prefixo = "Recebido em" }) {
  const carregado = Boolean(fonte?.em);
  const arquivos = carregado ? fonte.arquivos.join(", ") : "";
  return el("div", { classe: "fonte-linha" }, [
    icone("file-description"),
    el("span", { texto: rotulo }),
    carregado ? el("code", { texto: arquivos, title: arquivos }) : null,
    el("span", { classe: `fonte-situacao${carregado ? "" : " ausente"}`, texto: carregado ? "Carregado" : "Aguardando arquivo" }),
    carregado ? el("span", {}, [`${prefixo} `, el("b", { texto: fmt.dataHora(fonte.em) })]) : null,
  ]);
}

function sparkline(valores, { altura = 40, traco = null, descricao = "Tendência" } = {}) {
  return graficoBruto(() => ({
    type: "line",
    data: { labels: valores.map((_, i) => i), datasets: [{ data: valores, borderColor: traco || cor("accent"), borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false }] },
    options: { animation: false, events: [], scales: { x: { display: false }, y: { display: false, grace: "15%" } }, plugins: { tooltip: { enabled: false } } },
  }), { altura, descricao });
}

function listaBarras(itens) {
  const total = itens.reduce((s, i) => s + i.total, 0);
  return el("div", { classe: "lista-barras" }, itens.map((i) => {
    const pct = total ? (i.total / total) * 100 : 0;
    return el("div", {}, [
      el("div", { classe: "topo-linha" }, [el("span", { texto: i.nome }), el("span", {}, [el("b", { texto: fmt.numero(i.total) }), el("small", { texto: fmt.pct(pct) })])]),
      el("div", { classe: "trilho" }, el("span", { estilo: { width: `${pct}%` } })),
    ]);
  }));
}

function celulaDupla(principal, secundario) {
  return el("span", { classe: "celula-dupla" }, [principal, el("small", { texto: secundario || "-" })]);
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
      el("dt", { texto: estado.modo === "quadro" ? "Informado no quadro" : "No relatório" }), el("dd", { texto: d.valor_referencia || "-" }),
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
  const corpo = el("div", { classe: "principal" });
  const modoLinha = el("div", { classe: "cabecalho-abas" });
  let pedido = 0;

  function desenharModo() {
    modoLinha.replaceChildren(
      abas({ itens: [{ chave: "quadro", rotulo: "Dentro do quadro" }, { chave: "sistema", rotulo: "Contra o relatório" }], ativa: estado.modo, aoTrocar: (m) => { estado.modo = m; estado.checagem = ""; desenharModo(); atualizar(); } }),
      el("span", { classe: "modo-filtros" }, [
        el("label", { for: "auditoria-area", texto: "Área" }),
        selecao(AREAS, estado.area, { id: "auditoria-area", onchange: (e) => { estado.area = e.target.value; atualizar(); } }),
      ]),
    );
  }

  async function telaPronta() {
    const doQuadro = estado.modo === "quadro";
    const fontes = await api("/api/quadro/fontes");
    return el("div", { classe: "pronto" }, [
      el("strong", { texto: "Tudo pronto para auditar" }),
      el("p", { texto: doQuadro ? "Rode as checagens quando quiser: nada é processado antes do clique." : "Relatório novo entra pela página Upload manual. Rode a comparação quando quiser." }),
      botao("Rodar auditoria", { icone: "player-play", onclick: () => { estado.rodada[estado.modo] = true; atualizar(); } }),
      linhaFonte(fontes.find((f) => f.chave === (doQuadro ? "quadro" : "relatorio")), { rotulo: doQuadro ? "Quadro funcional" : "Relatório de funcionários", prefixo: doQuadro ? "Recebido em" : "Importado em" }),
    ]);
  }

  async function atualizar() {
    const meu = ++pedido;
    corpo.classList.add("recarregando");
    try {
      if (!estado.rodada[estado.modo]) {
        const tela = await telaPronta();
        if (meu === pedido) corpo.replaceChildren(tela);
        return;
      }
      const dados = await api(`/api/quadro/auditoria${parametrosFiltro({}, { modo: estado.modo, area: estado.area })}`);
      if (meu !== pedido) return;
      const checagens = [...dados.checagens].sort((a, b) => b.total - a.total);
      const itens = estado.modo === "quadro" ? [...checagens, { chave: "diagnostico", titulo: "Diagnóstico", total: null }] : checagens;
      if (!estado.checagem || !itens.some((i) => i.chave === estado.checagem)) estado.checagem = (itens.find((i) => i.total) || itens[0]).chave;
      const detalhe = el("div", { classe: "auditoria-detalhe" });
      if (!dados.divergencias.length && estado.checagem !== "diagnostico") {
        corpo.replaceChildren(cartao({ corpo: vazio("Nenhuma divergência neste recorte", `Todas as checagens ${estado.modo === "quadro" ? "dentro do quadro" : "contra o relatório"} passaram.`, "circle-check") }));
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
                { chave: "valor_referencia", titulo: estado.modo === "quadro" ? "Informado no quadro" : "No relatório", formato: (v) => v || "-" },
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

function telaArquivoNovatos(corpo) {
  const zona = zonaEnvio({
    titulo: "Envie as planilhas de planejamento",
    texto: "Arraste os arquivos aqui ou clique para selecionar; várias planilhas viram um só arquivo de inserção.",
    formato: "Planilhas de planejamento",
    compacto: Boolean(estado.arquivoNovatos),
    aoEnviar: async (arquivos) => {
      estado.arquivoNovatos = await api("/api/quadro/novatos/arquivo", { metodo: "POST", corpo: { arquivos } });
      corpo.replaceChildren(...telaArquivoNovatos(corpo));
    },
  });
  const r = estado.arquivoNovatos;
  if (!r) return [zona];
  return [zona, cartao({
    titulo: "Arquivo de inserção",
    detalhe: `${fmt.numero(r.planilhas.length)} ${r.planilhas.length === 1 ? "planilha" : "planilhas"} · gerado em ${fmt.dataHora(r.gerado_em)}`,
    corpo: tabela({
      colunas: [...colunasPessoa, { chave: "cargo", titulo: "Cargo" }, { chave: "servico", titulo: "Serviço" }, { chave: "sede", titulo: "Sede" }, { chave: "turno", titulo: "Turno" }, { chave: "admissao", titulo: "Admissão", formato: fmt.data }],
      linhas: r.linhas, exportar: "arquivo_insercao_novatos.csv", placeholder: "Buscar nome ou matrícula", textoVazio: "Nenhum novato nas planilhas enviadas.",
    }),
  })];
}

async function paginaNovatos(conteudo) {
  const abasNovatos = el("div");
  const corpo = el("div", { classe: "principal" });
  async function desenhar() {
    abasNovatos.replaceChildren(abas({
      itens: [{ chave: "arquivo", rotulo: "Gerar arquivo" }, { chave: "turmas", rotulo: "Turmas" }],
      ativa: estado.novatosAba, aoTrocar: (v) => { estado.novatosAba = v; desenhar(); },
    }));
    if (estado.novatosAba === "turmas") await turmasNovatos(corpo);
    else corpo.replaceChildren(...telaArquivoNovatos(corpo));
  }
  conteudo.replaceChildren(abasNovatos, corpo);
  await desenhar();
}

async function turmasNovatos(conteudo) {
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

async function paginaReferencia(conteudo) {
  const corpo = el("div", { classe: "principal" });
  conteudo.replaceChildren(corpo);
  function desenhar(dados) {
    const zona = zonaEnvio({
      titulo: "Envie os arquivos mensais de ajuste",
      texto: "Arraste os arquivos aqui ou clique para selecionar; cada linha é cruzada com o quadro pela matrícula.",
      formato: "Arquivos de ajuste",
      compacto: Boolean(dados.fonte.em),
      aoEnviar: async (arquivos) => { estado.referenciaSituacao = ""; desenhar(await api("/api/quadro/referencia", { metodo: "POST", corpo: { arquivos } })); },
    });
    if (!dados.fonte.em) {
      corpo.replaceChildren(zona);
      return;
    }
    const c = dados.contagem;
    const linhas = estado.referenciaSituacao ? dados.linhas.filter((l) => l.situacao === estado.referenciaSituacao) : dados.linhas;
    corpo.replaceChildren(
      zona,
      el("p", { classe: "linha-info" }, ["Importado em ", el("b", { texto: fmt.dataHora(dados.fonte.em) }), ` · ${dados.fonte.arquivos.join(", ")}`]),
      abas({
        itens: [
          { chave: "", rotulo: "Todas", contador: dados.linhas.length },
          { chave: "Diverge", rotulo: "Divergem do quadro", contador: c.Diverge || 0 },
          { chave: "Não localizada", rotulo: "Não localizadas", contador: c["Não localizada"] || 0 },
          { chave: "Confere", rotulo: "Conferem", contador: c.Confere || 0 },
        ],
        ativa: estado.referenciaSituacao, aoTrocar: (v) => { estado.referenciaSituacao = v; desenhar(dados); },
      }),
      cartao({
        corpo: tabela({
          colunas: [
            { chave: "matricula", titulo: "Matrícula" },
            { chave: "nome", titulo: "Nome", forte: true },
            { chave: "campo", titulo: "Campo" },
            { chave: "no_arquivo", titulo: "No arquivo de ajuste" },
            { chave: "no_quadro", titulo: "No quadro" },
            { chave: "situacao", titulo: "Situação", render: (v) => selo(v, TOM_REFERENCIA[v]) },
          ],
          linhas, exportar: "conferencia_referencia.csv", placeholder: "Buscar nome ou matrícula", textoVazio: "Nenhuma linha nesta situação.",
        }),
      }),
    );
  }
  desenhar(await api("/api/quadro/referencia"));
}

async function paginaVagas(conteudo) {
  const corpo = el("div", { classe: "principal" });
  conteudo.replaceChildren(corpo);
  async function desenhar() {
    const dados = await api("/api/quadro/vagas");
    const zona = zonaEnvio({
      titulo: "Envie a planilha semanal de RQs",
      texto: "Arraste a planilha aqui ou clique para selecionar; ela precisa da coluna de RQ (\"Nº ID\") e do candidato aprovado ou do status da vaga.",
      formato: "Planilha semanal",
      multiplo: false,
      aoEnviar: async (arquivos) => {
        await api("/api/quadro/vagas/planilha", { metodo: "POST", corpo: { arquivos } });
        aviso(`Planilha ${arquivos[0]} registrada.`);
        await desenhar();
      },
    });
    const tabelaAtual = estado.vagasAba === "rh"
      ? tabela({
        colunas: [
          { chave: "rq", titulo: "RQ", forte: true },
          { chave: "colaborador", titulo: "Colaborador/vaga" },
          { chave: "no_quadro", titulo: "No quadro hoje", formato: (v) => ROTULO_ETAPA[v] || v },
          { chave: "planilha", titulo: "Na planilha do RH", formato: (v) => ROTULO_ETAPA[v] || v },
          { chave: "situacao", titulo: "Situação", render: (v) => selo(v, TOM_PLANILHA[v]) },
          { chave: "motivo", titulo: "Tipo" },
          { chave: "gerente", titulo: "Gerente" },
        ],
        linhas: dados.linhas, exportar: "acompanhamento_rh.csv", placeholder: "Buscar RQ ou colaborador",
      })
      : tabela({
        colunas: [
          { chave: "id", titulo: "Nº ID", forte: true },
          { chave: "status", titulo: "Status do processo" },
          { chave: "candidato", titulo: "Candidato aprovado" },
          { chave: "matricula", titulo: "Matrícula" },
          { chave: "admissao", titulo: "Data de admissão", formato: fmt.data },
          { chave: "gerente", titulo: "Gerente" },
          { chave: "planilha", titulo: "Planilha da semana", formato: fmt.data },
        ],
        linhas: dados.consolidado, exportar: "consolidado_rqs.csv", placeholder: "Buscar RQ ou candidato",
      });
    corpo.replaceChildren(zona, cartao({
      titulo: "Consolidado das planilhas de RQs",
      detalhe: `${fmt.numero(dados.planilhas)} planilhas semanais · última em ${fmt.dataHora(dados.fonte.em)}`,
      corpo: [
        abas({
          itens: [{ chave: "planilhas", rotulo: "Planilhas de RQs", contador: dados.consolidado.length }, { chave: "rh", rotulo: "Acompanhamento RH", contador: dados.linhas.length }],
          ativa: estado.vagasAba, aoTrocar: (v) => { estado.vagasAba = v; desenhar(); },
        }),
        tabelaAtual,
      ],
    }));
  }
  await desenhar();
}

function heroQuadro(dados) {
  const [primeira, segunda] = dados.concentracao.gerentes;
  return el("section", { classe: "hero-quadro" }, [
    el("div", { classe: "hero-quadro-topo" }, [icone("trending-up"), `Quadro em ${fmt.data(dados.data)}`]),
    el("div", { classe: "hero-quadro-corpo" }, [
      el("div", { classe: "hero-quadro-numero", texto: fmt.numero(dados.total_no_dia) }),
      sparkline(dados.serie.map((p) => p.ativos), { altura: 110, traco: "rgba(255, 255, 255, 0.85)", descricao: "Ativos nos últimos 60 dias" }),
    ]),
    segunda ? el("div", { classe: "hero-quadro-nota" }, [
      icone("info-circle"),
      el("span", {}, ["As 2 maiores gerências, ", el("b", { texto: primeira }), " e ", el("b", { texto: segunda }), ", concentram ", el("b", { texto: fmt.pct(dados.concentracao.percentual) }), " do quadro."]),
    ]) : null,
  ]);
}

function barrasStatus(linhas) {
  const total = linhas.reduce((s, l) => s + l.total, 0);
  return el("div", { classe: "barras-lista" }, [
    ...linhas.map((l) => {
      const pct = total ? (l.total / total) * 100 : 0;
      return el("div", { classe: "barras-linha" }, [
        el("span", { classe: "rotulo" }, [el("i", { estilo: { background: COR_STATUS[l.nome] } }), STATUS_PLURAL[l.nome]]),
        el("span", { classe: "trilho" }, el("span", { estilo: { width: `${pct}%`, background: COR_STATUS[l.nome] } })),
        el("span", { classe: "valor", texto: fmt.numero(l.total) }),
        el("span", { classe: "pct", texto: fmt.pct(pct) }),
      ]);
    }),
    el("p", { classe: "barras-nota", texto: "Treinamento reúne admitidos há menos de 14 dias; afastados reúnem licenças e afastamentos." }),
  ]);
}

function linhaAtivos(serie) {
  return graficoBruto(() => ({
    type: "line",
    data: { labels: serie.map((p) => fmt.dataCurta(p.data)), datasets: [{ label: "Ativos", data: serie.map((p) => p.ativos), borderColor: cor("accent"), backgroundColor: cor("accent-light"), borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true }] },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: false, grace: "10%", grid: { color: cor("border-color") }, border: { display: false }, ticks: { precision: 0 } },
      },
    },
  }), { altura: 240, descricao: "Ativos por dia nos últimos 60 dias" });
}

async function paginaHistorico(conteudo) {
  const ultimaAtualizacao = el("b", { texto: "-" });
  const data = el("input", { type: "date", id: "historico-data", "aria-label": "Quadro em", valor: estado.historicoData });
  let redesenharAbas = () => {};
  await paginaSimples(conteudo, {
    topo: (atualizar, barra) => {
      const abasHistorico = el("div");
      redesenharAbas = (movimentacoes) => abasHistorico.replaceChildren(abas({
        itens: [{ chave: "quadro", rotulo: "Quadro funcional" }, { chave: "geral", rotulo: "Visão geral" }, { chave: "movimentacoes", rotulo: "Movimentações", contador: movimentacoes }],
        ativa: estado.historicoAba, aoTrocar: (v) => { estado.historicoAba = v; redesenharAbas(movimentacoes); atualizar(); },
      }));
      redesenharAbas();
      data.onchange = (e) => { estado.historicoData = e.target.value; atualizar(); };
      return el("div", { classe: "grade" }, [
        abasHistorico,
        el("div", { classe: "data-quadro" }, [
          el("div", {}, [icone("calendar"), el("label", { for: "historico-data" }, [el("small", { texto: "Quadro em" }), data])]),
          el("div", {}, [icone("info-circle"), el("span", {}, [el("small", { texto: "Última atualização" }), ultimaAtualizacao])]),
          barra,
        ]),
      ]);
    },
    desenhar: async () => {
      const dados = await api(`/api/quadro/historico${parametrosFiltro(filtros, { data: estado.historicoData })}`);
      ultimaAtualizacao.textContent = fmt.dataHora(dados.atualizado_em);
      data.value = dados.data;
      redesenharAbas(dados.movimentacoes.length);
      if (estado.historicoAba === "quadro") {
        return [
          el("div", { classe: "grade g-3-2" }, [heroQuadro(dados), cartao({ titulo: "Por status", corpo: barrasStatus(dados.por_status) })]),
          cartao({
            corpo: tabela({
              colunas: [
                { chave: "status", titulo: "Status · escala", render: (v, l) => celulaDupla(el("span", { classe: `status-ponto ${v}`, texto: v }), l.escala) },
                { chave: "nome", titulo: "Colaborador · matrícula", formato: (v, l) => `${v} (${l.matricula})`, render: (v, l) => celulaDupla(el("b", { texto: v }), l.matricula) },
                { chave: "servico", titulo: "Serviço" },
                { chave: "supervisor", titulo: "Supervisor" },
                { chave: "gerente", titulo: "Gerente · coordenador", formato: (v, l) => `${v || "-"} / ${l.coordenador || "-"}`, render: (v, l) => celulaDupla(el("b", { texto: v || "-" }), l.coordenador) },
                { chave: "cargo", titulo: "Cargo" },
              ],
              linhas: dados.colaboradores, porPagina: 20, exportar: `quadro_${dados.data}.csv`, placeholder: "Buscar nome, matrícula ou serviço",
            }),
          }),
        ];
      }
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
        cartao({ titulo: "Ativos por dia", detalhe: "Últimos 60 dias", corpo: linhaAtivos(dados.serie) }),
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

function evolucaoMensal(dados) {
  const completos = dados.evolucao.filter((m) => !m.parcial);
  const totalMes = (m) => dados.classes.reduce((s, c) => s + m[c], 0);
  const media = completos.length ? completos.reduce((s, m) => s + totalMes(m), 0) / completos.length : null;
  const rotuloMes = (m) => `${MESES[Number(m.mes.slice(5, 7)) - 1]}/${m.mes.slice(2, 4)}${m.parcial ? "*" : ""}`;
  const linhaMedia = {
    id: "mediaCompletos",
    afterDatasetsDraw(grafico) {
      if (media === null) return;
      const y = grafico.scales.y.getPixelForValue(media);
      const ctx = grafico.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = cor("text-tertiary");
      ctx.beginPath();
      ctx.moveTo(grafico.chartArea.left, y);
      ctx.lineTo(grafico.chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cor("text-secondary");
      ctx.font = "500 11.5px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Média ${fmt.numero(Math.round(media))}`, grafico.chartArea.left, y - 6);
      ctx.restore();
    },
  };
  return graficoBruto(() => ({
    type: "bar",
    data: {
      labels: dados.evolucao.map(rotuloMes),
      datasets: dados.classes.map((c) => ({ label: ROTULO_CLASSE[c], data: dados.evolucao.map((m) => m[c]), backgroundColor: cor(CORES_CLASSE[c]), maxBarThickness: 96, stack: "s" })),
    },
    options: {
      layout: { padding: { top: 22 } },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: cor("text-secondary") } },
        y: { stacked: true, display: false, beginAtZero: true, grace: "12%" },
      },
      plugins: {
        legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 14, filter: (item) => dados.evolucao.some((m) => m[dados.classes[item.datasetIndex]]) } },
        datalabels: {
          display: (c) => c.datasetIndex === dados.classes.length - 1 && totalMes(dados.evolucao[c.dataIndex]) > 0,
          formatter: (_, c) => fmt.numero(totalMes(dados.evolucao[c.dataIndex])),
          anchor: "end", align: "end", offset: 2, color: cor("text-primary"), font: { weight: 600 },
        },
      },
    },
    plugins: [linhaMedia],
  }), { altura: 300, descricao: "Evolução mensal dos desligamentos por tipo" });
}

function kpiTendencia({ rotulo, valor, detalhe, titulo = null, serie }) {
  return el("div", { classe: "kpi kpi-spark", title: titulo }, [
    el("div", { classe: "kpi-rotulo", texto: rotulo }),
    el("div", { classe: "kpi-valor", texto: valor }),
    el("div", { classe: "kpi-detalhe", texto: detalhe }),
    sparkline(serie, { altura: 36, descricao: `Tendência mensal de ${rotulo.toLowerCase()}` }),
  ]);
}

async function paginaDesligados(conteudo) {
  const base = await obterHierarquia();
  const sedes = [...new Set(base.supervisores.map((s) => s.sede))].sort();
  const cabecalho = el("div", { classe: "cabecalho-periodo" });
  const barra = el("div", { classe: "barra-desligados" });
  const abasDesligados = el("div");
  const corpo = el("div", { classe: "principal" });
  let pedido = 0;
  let primeiro = true;

  function desenharBarra() {
    const campoData = (rotulo, chave) => el("label", { classe: "campo-data" }, [
      el("span", { texto: rotulo }),
      el("input", { type: "date", valor: filtros[chave], onchange: (e) => { filtros[chave] = e.target.value; desenharBarra(); atualizar(); } }),
    ]);
    const filtrosAtivos = filtros.de || filtros.ate || estado.desligadosArea || estado.desligadosClasse || filtros.sede.length || filtros.gerente.length;
    barra.replaceChildren(...[
      campoData("De", "de"),
      campoData("Até", "ate"),
      segmentado({ opcoes: AREAS.map(([v, r]) => [v, v ? r : "Todos"]), ativa: estado.desligadosArea, rotulo: "Área", aoTrocar: (v) => { estado.desligadosArea = v; desenharBarra(); atualizar(); } }),
      selecao([["", "Todas as sedes"], ...sedes.map((s) => [s, s])], filtros.sede[0] || "", { "aria-label": "Sede", onchange: (e) => { filtros.sede = e.target.value ? [e.target.value] : []; desenharBarra(); atualizar(); } }),
      selecao([["", "Todas as gerências"], ...base.gerentes.map((g) => [g.nome, g.nome])], filtros.gerente[0] || "", { "aria-label": "Gerência", onchange: (e) => { filtros.gerente = e.target.value ? [e.target.value] : []; desenharBarra(); atualizar(); } }),
      selecao([["", "Todos os tipos"], ...Object.entries(ROTULO_CLASSE)], estado.desligadosClasse, { "aria-label": "Tipo de desligamento", onchange: (e) => { estado.desligadosClasse = e.target.value; desenharBarra(); atualizar(); } }),
      filtrosAtivos ? el("button", {
        classe: "btn fantasma limpar", type: "button",
        onclick: () => {
          filtros.de = ""; filtros.ate = ""; filtros.sede = []; filtros.gerente = [];
          estado.desligadosArea = ""; estado.desligadosClasse = "";
          desenharBarra(); atualizar();
        },
      }, "Limpar filtros") : null,
    ].filter(Boolean));
  }

  function desenharAbas(registros) {
    abasDesligados.replaceChildren(abas({
      itens: [{ chave: "resumo", rotulo: "Resumo" }, { chave: "gerencia", rotulo: "Análise por gerência" }, { chave: "registros", rotulo: "Registros", contador: registros }],
      ativa: estado.desligadosAba, aoTrocar: (v) => { estado.desligadosAba = v; desenharAbas(registros); atualizar(); },
    }));
  }

  function conteudoAba(dados) {
    const k = dados.kpis;
    const serieTotal = dados.evolucao.map((m) => dados.classes.reduce((s, c) => s + m[c], 0));
    const diferenca = k.desligados - dados.anterior.desligados;
    const parteDe = (classe) => `${fmt.pct(k.desligados ? (k[classe] / k.desligados) * 100 : 0)} de ${fmt.numero(k.desligados)} desligamentos`;
    const faixa = el("div", { classe: "faixa" }, [
      kpiTendencia({
        rotulo: "Desligamentos", valor: fmt.numero(k.desligados), serie: serieTotal,
        detalhe: `${diferenca > 0 ? "+" : diferenca < 0 ? "−" : ""}${fmt.numero(Math.abs(diferenca))} vs. ${fmt.numero(dados.anterior.desligados)}`,
        titulo: `Comparado com ${fmt.data(dados.anterior.de)} a ${fmt.data(dados.anterior.ate)}`,
      }),
      kpiTendencia({ rotulo: "Voluntários", valor: fmt.numero(k["Voluntário"]), detalhe: parteDe("Voluntário"), serie: dados.evolucao.map((m) => m["Voluntário"]) }),
      kpiTendencia({ rotulo: "Involuntários", valor: fmt.numero(k["Involuntário"]), detalhe: parteDe("Involuntário"), serie: dados.evolucao.map((m) => m["Involuntário"]) }),
      kpiTendencia({ rotulo: "Promovidos", valor: fmt.numero(k["Promoção"]), detalhe: parteDe("Promoção"), serie: dados.evolucao.map((m) => m["Promoção"]) }),
    ]);
    if (estado.desligadosAba === "gerencia") {
      return [faixa, cartao({
        titulo: "Análise por gerência", detalhe: `Taxa geral ${fmt.pct(k.turnover)} sobre o efetivo inicial de ${fmt.numero(k.efetivo_inicial)}`,
        corpo: tabela({
          busca: false,
          colunas: [
            { chave: "gerente", titulo: "Gerência", forte: true },
            { chave: "efetivo", titulo: "Efetivo inicial", alinhar: "direita" },
            { chave: "total", titulo: "Desligamentos", alinhar: "direita" },
            ...dados.classes.map((c) => ({ chave: c, titulo: ROTULO_CLASSE[c], alinhar: "direita" })),
            { chave: "taxa", titulo: "Taxa", alinhar: "direita", formato: (v) => fmt.pct(v), render: (v) => selo(fmt.pct(v), v > k.turnover ? "critico" : "forte") },
          ],
          linhas: dados.por_gerencia,
          textoVazio: "Sem desligamentos no período.",
        }),
      })];
    }
    if (estado.desligadosAba === "registros") {
      return [cartao({
        corpo: tabela({
          colunas: [
            { chave: "matricula", titulo: "Matrícula" },
            { chave: "nome", titulo: "Colaborador", forte: true },
            { chave: "cargo", titulo: "Cargo" },
            { chave: "sede", titulo: "Sede" },
            { chave: "supervisor", titulo: "Supervisor" },
            { chave: "gerente", titulo: "Gerente", formato: (v) => v || "Sem gerência" },
            { chave: "motivo_desligamento", titulo: "Motivo" },
            { chave: "classe", titulo: "Tipo", formato: (v) => ROTULO_CLASSE[v] || v },
            { chave: "data_desligamento", titulo: "Desligamento", formato: fmt.data },
          ],
          linhas: dados.linhas, exportar: "desligados.csv", placeholder: "Buscar nome ou matrícula", textoVazio: "Sem desligamentos no período.",
        }),
      })];
    }
    const meses = dados.evolucao;
    const nomeMes = (m) => `${MESES[Number(m.mes.slice(5, 7)) - 1]}/${m.mes.slice(2, 4)}`;
    return [
      faixa,
      el("div", { classe: "grade g-3-2" }, [
        cartao({
          titulo: "Evolução mensal",
          detalhe: `${nomeMes(meses[0])} a ${nomeMes(meses.at(-1))}, mesmos filtros de área, sede, gerência e tipo${meses.some((m) => m.parcial) ? " · * mês parcial, fora da média" : ""}`,
          corpo: serieTotal.some(Boolean) ? evolucaoMensal(dados) : vazio("Sem desligamentos nos últimos meses"),
        }),
        el("div", { classe: "grade" }, [
          cartao({ titulo: "Por sede", corpo: dados.por_sede.length ? listaBarras(dados.por_sede) : vazio("Sem desligamentos no período") }),
          cartao({ titulo: "Motivos", corpo: dados.por_motivo.length ? listaBarras(dados.por_motivo) : vazio("Sem desligamentos no período") }),
        ]),
      ]),
    ];
  }

  async function atualizar() {
    const meu = ++pedido;
    if (primeiro) corpo.replaceChildren(carregando());
    else corpo.classList.add("recarregando");
    try {
      const dados = await api(`/api/quadro/desligados${parametrosFiltro(filtros, { area: estado.desligadosArea, classe: estado.desligadosClasse })}`);
      if (meu !== pedido) return;
      cabecalho.replaceChildren(el("div", { classe: "periodo-texto" }, [
        el("b", { texto: `${fmt.data(dados.de)} a ${fmt.data(dados.ate)}` }),
        dados.parcial ? selo(`Parcial · corte ${fmt.dataCurta(dados.corte)}`) : null,
        el("span", { classe: "linha-info", texto: `Atualizado ${fmt.dataHora(dados.atualizado_em)}` }),
      ]));
      desenharAbas(dados.linhas.length);
      corpo.replaceChildren(...conteudoAba(dados));
    } catch (erro) {
      if (meu === pedido) corpo.replaceChildren(blocoErro(erro));
    } finally {
      if (meu === pedido) { corpo.classList.remove("recarregando"); primeiro = false; }
    }
  }

  desenharBarra();
  desenharAbas();
  conteudo.replaceChildren(cabecalho, barra, abasDesligados, corpo);
  await atualizar();
}

async function paginaOrganizacao(conteudo) {
  const corpo = el("div", { classe: "principal" });
  conteudo.replaceChildren(corpo);
  async function desenhar() {
    const dados = await api(`/api/quadro/organizacao${parametrosFiltro({}, { setor: estado.orgSetor, situacao: estado.orgSituacao })}`);
    const cs = dados.contagem_setor;
    const cr = dados.contagem_situacao;
    corpo.replaceChildren(
      el("div", { classe: "filtros-grupos" }, [
        el("div", { classe: "filtro-grupo" }, [el("span", { texto: "Setor" }), abas({
          itens: [{ chave: "", rotulo: "Todos", contador: cs[""] }, { chave: "Agendamento", rotulo: "Agendamento", contador: cs.Agendamento }, { chave: "Atendimento", rotulo: "Atendimento", contador: cs.Atendimento }],
          ativa: estado.orgSetor, aoTrocar: (v) => { estado.orgSetor = v; desenhar(); },
        })]),
        el("div", { classe: "filtro-grupo" }, [el("span", { texto: "Situação no relatório de funcionários" }), abas({
          itens: [{ chave: "Desligado", rotulo: "Desligados no relatório", contador: cr.Desligado }, { chave: "Ativo", rotulo: "Ativos no relatório", contador: cr.Ativo }, { chave: "Sem registro", rotulo: "Sem registro no relatório", contador: cr["Sem registro"] }],
          ativa: estado.orgSituacao, aoTrocar: (v) => { estado.orgSituacao = v; desenhar(); },
        })]),
      ]),
      el("p", { classe: "linha-info" }, [
        "Organização importada em ", el("b", { texto: fmt.dataHora(dados.fontes.organizacao.em) }),
        " · Relatório de funcionários em ", el("b", { texto: fmt.dataHora(dados.fontes.relatorio.em) }),
      ]),
      cartao({
        corpo: tabela({
          colunas: [
            { chave: "matricula", titulo: "Matrícula" },
            { chave: "nome", titulo: "Nome", forte: true },
            { chave: "login", titulo: "ID de acesso" },
            { chave: "classe", titulo: "Tipo de desligamento", formato: (v) => ROTULO_CLASSE[v] || v },
            { chave: "data_desligamento", titulo: "Data", formato: fmt.data },
            { chave: "perfil", titulo: "Perfil na organização" },
            { chave: "situacao_relatorio", titulo: "Situação no relatório", formato: (v, l) => (v === "Desligado" ? `Desligado em ${fmt.data(l.data_relatorio)}` : v) },
          ],
          linhas: dados.linhas, exportar: "contas_pendentes_organizacao.csv", placeholder: "Buscar nome ou matrícula", textoVazio: "Nenhum desligado neste recorte.",
        }),
      }),
    );
  }
  await desenhar();
}

async function paginaUpload(conteudo) {
  const lista = el("div", { classe: "fontes-lista" });
  conteudo.replaceChildren(lista);
  async function desenhar() {
    const fontes = (await api("/api/quadro/fontes")).filter((f) => f.manual);
    lista.replaceChildren(...fontes.map((f) => {
      const entrada = el("input", { type: "file", accept: EXTENSOES, multiple: true, hidden: true });
      entrada.addEventListener("change", async () => {
        const arquivos = [...entrada.files].map((a) => a.name);
        entrada.value = "";
        if (!arquivos.length) return;
        try {
          await api(`/api/quadro/fontes/${f.chave}`, { metodo: "POST", corpo: { arquivos } });
          aviso(`${f.titulo}: ${arquivos.length === 1 ? arquivos[0] : `${arquivos.length} arquivos`} registrado.`);
          await desenhar();
        } catch (erro) {
          aviso(erro.message, "erro");
        }
      });
      return el("div", { classe: "fonte-item" }, [
        el("div", { estilo: { minWidth: "0" } }, [
          el("h2", { texto: f.titulo }),
          el("p", { title: f.arquivos.join(", ") }, [`${f.detalhe} `, el("b", { texto: fmt.dataHora(f.em) }), f.arquivos.length ? ` · ${f.arquivos.join(", ")}` : null]),
        ]),
        botao(ROTULO_IMPORTAR[f.chave] || "Importar", { icone: "upload", onclick: () => entrada.click() }),
        entrada,
      ]);
    }));
  }
  await desenhar();
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
        { chave: "auditoria", rotulo: "Auditoria", icone: "checkbox", descricao: "Checagens do quadro funcional, internas e contra o relatório.", render: paginaAuditoria },
        { chave: "novatos", rotulo: "Novatos", icone: "user-plus", descricao: "Planilhas de planejamento reunidas em um só arquivo de inserção, e as turmas que ainda faltam.", render: paginaNovatos },
        { chave: "referencia", rotulo: "Referência", icone: "file", descricao: "Conferência dos arquivos mensais de ajuste.", render: paginaReferencia },
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
    {
      titulo: "",
      itens: [
        { chave: "upload", rotulo: "Upload manual", icone: "upload", descricao: "Importação manual do quadro funcional, do arquivo organizacional, do relatório de funcionários e das planilhas de acompanhamento. Na demonstração, só o nome e o horário do arquivo são registrados.", render: paginaUpload },
      ],
    },
  ],
});
