import { cor, el, fmt, graficoBruto, icone, kpis } from "/design-system/ui.js";

export const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const diaSemana = (iso) => (new Date(`${iso.slice(0, 10)}T00:00:00`).getDay() + 6) % 7;
export const horaDe = (iso) => Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;

export function legenda(itens) {
  return el("div", { classe: "legenda" }, itens.map((i) => el("span", {}, [el("i", { estilo: { background: cor(i.cor) } }), i.rotulo])));
}

export function semanaDe(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() - diaSemana(iso));
  return d.toLocaleDateString("sv-SE");
}

export function seriePorPeriodo(linhas, campoData, de, ate) {
  const inicio = new Date(`${de}T00:00:00`);
  const fim = new Date(`${ate}T00:00:00`);
  const dias = Math.round((fim - inicio) / 86400000) + 1;
  const porDia = dias <= 14;
  const chaves = [];
  for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = d.toLocaleDateString("sv-SE");
    const chave = porDia ? iso : semanaDe(iso);
    if (!chaves.includes(chave)) chaves.push(chave);
  }
  const contagem = new Map(chaves.map((c) => [c, 0]));
  for (const l of linhas) {
    const iso = l[campoData].slice(0, 10);
    const chave = porDia ? iso : semanaDe(iso);
    if (contagem.has(chave)) contagem.set(chave, contagem.get(chave) + 1);
  }
  return {
    porDia,
    rotulos: chaves.map((c) => (porDia ? fmt.dataCurta(c) : `Sem ${fmt.dataCurta(c)}`)),
    valores: chaves.map((c) => contagem.get(c)),
  };
}

const linhaMedia = {
  id: "media",
  afterDatasetsDraw(grafico) {
    const dados = grafico.data.datasets.reduce((soma, ds) => ds.data.map((v, i) => (soma[i] || 0) + v), []);
    if (!dados.length) return;
    const media = dados.reduce((a, b) => a + b, 0) / dados.length;
    const y = grafico.scales.y.getPixelForValue(media);
    const ctx = grafico.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = cor("text-secondary");
    ctx.beginPath();
    ctx.moveTo(grafico.chartArea.left, y);
    ctx.lineTo(grafico.chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cor("text-secondary");
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`MÉDIA ${media.toFixed(1).replace(".", ",")}`, grafico.chartArea.right, y - 5);
    ctx.restore();
  },
};

export function barrasComMedia({ rotulos, series, empilhado = false, altura = 260, descricao }) {
  return graficoBruto(() => ({
    type: "bar",
    data: {
      labels: rotulos.map((r) => r.toUpperCase()),
      datasets: series.map((s) => ({ label: s.nome.toUpperCase(), data: s.valores, backgroundColor: cor(s.cor || "accent"), borderRadius: 4, maxBarThickness: 28, stack: empilhado ? "s" : undefined })),
    },
    options: {
      layout: { padding: { top: 18 } },
      scales: {
        x: { stacked: empilhado, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { stacked: empilhado, beginAtZero: true, grid: { color: cor("border-color") }, border: { display: false }, ticks: { precision: 0 } },
      },
      plugins: {
        legend: { display: series.length > 1, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 14 } },
        datalabels: {
          display: (c) => c.datasetIndex === series.length - 1 && c.chart.data.datasets.reduce((s, d) => s + d.data[c.dataIndex], 0) > 0,
          formatter: (_, c) => c.chart.data.datasets.reduce((s, d) => s + d.data[c.dataIndex], 0),
          anchor: "end", align: "end", offset: 2, color: cor("text-primary"), font: { weight: 700 },
        },
      },
    },
    plugins: [linhaMedia],
  }), { altura, descricao });
}

export function histograma({ rotulos, valores, destaque = 0, logaritmico = false, altura = 260, descricao }) {
  const destacado = typeof destaque === "function" ? destaque : (i) => i < destaque;
  return graficoBruto(() => ({
    type: "bar",
    data: {
      labels: rotulos.map((r) => r.toUpperCase()),
      datasets: [{ data: valores.map((v) => (logaritmico && v === 0 ? null : v)), borderRadius: 3, maxBarThickness: 30, backgroundColor: rotulos.map((_, i) => (destacado(i) ? cor("critico") : cor("viz-2"))) }],
    },
    options: {
      layout: { padding: { top: 18 } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } },
        y: logaritmico
          ? { type: "logarithmic", grid: { color: cor("border-color") }, border: { display: false }, ticks: { callback: (v) => ([1, 10, 100, 1000, 10000].includes(v) ? fmt.numero(v) : "") } }
          : { beginAtZero: true, grid: { color: cor("border-color") }, border: { display: false }, ticks: { precision: 0 } },
      },
      plugins: {
        tooltip: { callbacks: { label: (c) => ` ${fmt.numero(c.parsed.y)}` } },
        datalabels: { display: (c) => (c.dataset.data[c.dataIndex] || 0) > 0, anchor: "end", align: "end", offset: 1, color: (c) => (destacado(c.dataIndex) ? cor("critico") : cor("text-secondary")), font: { weight: 700, size: 10.5 } },
      },
    },
  }), { altura, descricao });
}

export function empilhadoHorizontal({ rotulos, faixas, matriz, altura, descricao }) {
  return graficoBruto(() => ({
    type: "bar",
    data: {
      labels: rotulos.map((r) => r.toUpperCase()),
      datasets: faixas.map((f, i) => ({ label: f.rotulo.toUpperCase(), data: matriz.map((linha) => linha[i]), backgroundColor: cor(f.cor), stack: "s", maxBarThickness: 18 })),
    },
    options: {
      indexAxis: "y",
      layout: { padding: { right: 34 } },
      scales: {
        x: { stacked: true, grid: { color: cor("border-color") }, border: { display: false }, ticks: { precision: 0 } },
        y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: cor("text-primary") } },
      },
      plugins: {
        tooltip: { mode: "index", intersect: false },
        datalabels: {
          display: (c) => c.datasetIndex === faixas.length - 1,
          formatter: (_, c) => c.chart.data.datasets.reduce((s, d) => s + d.data[c.dataIndex], 0),
          anchor: "end", align: "end", color: cor("text-primary"), font: { weight: 700 },
        },
      },
    },
  }), { altura: altura || Math.max(240, rotulos.length * 30), descricao });
}

export function dispersao({ pontos, rotuloX, rotuloY, limite = 1, altura = 280, descricao }) {
  return graficoBruto(() => ({
    type: "scatter",
    data: {
      datasets: [{
        data: pontos,
        backgroundColor: pontos.map((p) => (p.y >= limite ? cor("critico") : cor("accent"))),
        pointRadius: pontos.map((p) => 4 + Math.sqrt(p.v) * 1.3),
        pointHoverRadius: pontos.map((p) => 6 + Math.sqrt(p.v) * 1.3),
      }],
    },
    options: {
      layout: { padding: { top: 14, right: 18 } },
      scales: {
        x: { type: "logarithmic", grid: { color: cor("border-color") }, border: { display: false }, title: { display: true, text: rotuloX.toUpperCase() }, ticks: { callback: (v) => ([10, 100, 1000, 10000].includes(v) ? fmt.numero(v) : "") } },
        y: { beginAtZero: true, grid: { color: cor("border-color") }, border: { display: false }, title: { display: true, text: rotuloY.toUpperCase() }, ticks: { callback: (v) => `${v}%` } },
      },
      plugins: {
        tooltip: { callbacks: { title: (it) => it[0].raw.n.toUpperCase(), label: (it) => ` ${fmt.numero(it.raw.v)} VIOLAÇÕES · ${fmt.pct(it.raw.y)} DE ${fmt.numero(it.raw.x)}` } },
        datalabels: {
          display: "auto",
          formatter: (p) => `${p.n} · ${p.v}`.toUpperCase(),
          align: "top", offset: 6, color: cor("text-primary"), font: { weight: 600, size: 10.5 },
        },
      },
    },
  }), { altura, descricao });
}

export function mapaCalor({ linhas, colunas, matriz, legenda: textoLegenda = "Menos" }) {
  const maximo = Math.max(1, ...matriz.flat());
  const fundo = (v) => (v ? `color-mix(in srgb, var(--critico) ${Math.round(12 + (v / maximo) * 78)}%, var(--bg-surface))` : "var(--bg-surface-alt)");
  const texto = (v) => (v / maximo > 0.55 ? "#FFFFFF" : "var(--text-primary)");
  return el("div", { classe: "mapa-calor" }, [
    el("table", {}, [
      el("thead", {}, el("tr", {}, [el("th", { classe: "lin" }), ...colunas.map((c) => el("th", { texto: c, title: c }))])),
      el("tbody", {}, linhas.map((linha, i) => el("tr", {}, [
        el("th", { classe: "lin", texto: linha }),
        ...matriz[i].map((v, j) => el("td", { title: `${linha} · ${colunas[j]}: ${fmt.numero(v)}`, estilo: { background: fundo(v), color: texto(v) } }, v ? fmt.numero(v) : "")),
      ]))),
    ]),
    el("div", { classe: "mapa-calor-legenda" }, [textoLegenda, ...[0.15, 0.4, 0.65, 0.9].map((p) => el("span", { estilo: { background: `color-mix(in srgb, var(--critico) ${Math.round(12 + p * 78)}%, var(--bg-surface))` } })), "Mais"]),
  ]);
}

export function matrizCalor(linhasDados, { campoData, campoHora, faixasHora }) {
  const matriz = DIAS_SEMANA.map(() => faixasHora.map(() => 0));
  for (const l of linhasDados) {
    const iso = l[campoHora];
    if (!iso) continue;
    const h = horaDe(iso);
    const j = faixasHora.findIndex((f) => h >= f.de && h < f.ate);
    if (j >= 0) matriz[diaSemana(l[campoData] || iso)][j] += 1;
  }
  return matriz;
}

export function matrizGerencia({ linhas, colunas, chaveNome = "nome", detalhe = null, rotuloPrimeira = "Gerência" }) {
  const abertos = new Set();
  const coordAbertas = new Set();
  const raiz = el("div");
  const sem = (v, padrao) => (v && String(v).trim() ? v : padrao);
  const agrupar = (lista, campo, padrao) => {
    const mapa = new Map();
    for (const l of lista) {
      const k = sem(l[campo], padrao);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(l);
    }
    return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
  };
  const grupos = agrupar(linhas, "gerente", "Sem gerência").map(([g, lista]) => ({ g, lista, coords: agrupar(lista, "coordenador", "Sem coordenação") }));

  function linha(nome, lista, classe, primeira) {
    return el("tr", { classe }, [
      primeira || el("td", { texto: nome, title: nome }),
      ...colunas.map((c) => {
        const valor = c.valor(lista, chaveNome);
        return el("td", { classe: c.fora && c.fora(valor, classe) ? "fora" : null }, c.formato ? c.formato(valor) : fmt.numero(valor));
      }),
    ]);
  }

  function desenhar() {
    const todosAbertos = grupos.length > 0 && grupos.every((g) => abertos.has(g.g));
    raiz.replaceChildren(el("table", { classe: "matriz" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, el("span", { classe: "matriz-cab" }, [rotuloPrimeira, el("button", { type: "button", onclick: () => { grupos.forEach((g) => (todosAbertos ? abertos.delete(g.g) : abertos.add(g.g))); desenhar(); } }, todosAbertos ? "Recolher" : "Expandir")])),
        ...colunas.map((c) => el("th", { texto: c.titulo, title: c.titulo })),
      ])),
      el("tbody", {}, [
        ...grupos.flatMap((gr) => [
          linha(gr.g, gr.lista, "", el("td", {}, el("button", {
            classe: "matriz-abrir", type: "button", "aria-expanded": abertos.has(gr.g) ? "true" : "false",
            onclick: () => { abertos.has(gr.g) ? abertos.delete(gr.g) : abertos.add(gr.g); desenhar(); },
          }, [icone("chevron-right"), el("span", { texto: gr.g, title: gr.g })]))),
          ...(abertos.has(gr.g) ? gr.coords.flatMap(([c, lista]) => {
            const chave = `${gr.g}|${c}`;
            if (!detalhe) return [linha(c, lista, "coord")];
            const aberta = coordAbertas.has(chave);
            return [
              linha(c, lista, "coord", el("td", {}, el("button", {
                classe: "matriz-abrir", type: "button", "aria-expanded": aberta ? "true" : "false",
                onclick: () => { aberta ? coordAbertas.delete(chave) : coordAbertas.add(chave); desenhar(); },
              }, [icone("chevron-right"), el("span", { texto: c, title: c })]))),
              aberta ? el("tr", { classe: "matriz-detalhe" }, el("td", { colspan: colunas.length + 1 }, detalhe(lista))) : null,
            ];
          }) : []),
        ]),
        linha("Total geral", linhas, "total"),
      ]),
    ]));
  }

  desenhar();
  return raiz;
}

export function contarPor(lista, chave) {
  const mapa = new Map();
  for (const l of lista) mapa.set(l[chave], (mapa.get(l[chave]) || 0) + 1);
  return mapa;
}

export function rankingLista(linhas, aoSelecionar) {
  const maximo = Math.max(1, ...linhas.map((l) => l.valor));
  return el("div", { classe: "ranking" }, linhas.map((l, i) => el("button", { classe: "ranking-linha", type: "button", onclick: () => aoSelecionar(l) }, [
    el("span", { classe: "ranking-pos", texto: i + 1 }),
    el("span", { estilo: { minWidth: "0" } }, [el("span", { classe: "ranking-nome", texto: l.nome, title: l.nome }), el("span", { classe: "ranking-sub", texto: l.sub, title: l.sub })]),
    el("span", { classe: "ranking-barra" }, el("span", { estilo: { width: `${Math.round((l.valor / maximo) * 100)}%`, background: l.forte ? "var(--critico)" : null } })),
    el("span", { classe: "ranking-n", texto: l.rotuloValor ?? fmt.numero(l.valor) }),
  ])));
}

export function gaveta({ rotulo, titulo, subtitulo, conteudo }) {
  const anterior = document.activeElement;
  const fundo = el("div", { classe: "gaveta-fundo" });
  const painel = el("aside", { classe: "gaveta", role: "dialog", "aria-modal": "true", "aria-label": titulo }, [
    el("div", { classe: "gaveta-cabecalho" }, [
      el("div", { estilo: { minWidth: "0" } }, [el("small", { texto: rotulo }), el("h2", { texto: titulo }), subtitulo ? el("p", { texto: subtitulo }) : null]),
      el("button", { classe: "btn fantasma pequeno icone", type: "button", "aria-label": "Fechar", title: "Fechar", onclick: () => fechar() }, icone("x")),
    ]),
    el("div", { classe: "gaveta-corpo" }, conteudo),
  ]);
  const aoTeclar = (e) => { if (e.key === "Escape") fechar(); };
  function fechar() {
    document.removeEventListener("keydown", aoTeclar);
    fundo.remove();
    painel.remove();
    if (anterior && anterior.focus) anterior.focus();
  }
  fundo.addEventListener("click", fechar);
  document.addEventListener("keydown", aoTeclar);
  document.body.append(fundo, painel);
  painel.querySelector("button").focus();
  return { fechar };
}

export { kpis };
