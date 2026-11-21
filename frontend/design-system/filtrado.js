import { api, blocoErro, carregando, el, filtroLateral, icone } from "/design-system/ui.js";

const CAMPO_SUPERVISOR = { diretoria: "diretoria", servico: "servico", gerente: "gerente", coordenador: "coordenador", supervisor: "nome", sede: "sede" };
const NIVEIS_HIERARQUIA = Object.keys(CAMPO_SUPERVISOR);

let hierarquia = null;

export async function obterHierarquia() {
  if (!hierarquia) hierarquia = await api("/api/base/hierarquia");
  return hierarquia;
}

export function criarEstadoFiltros() {
  return { diretoria: [], servico: [], gerente: [], coordenador: [], supervisor: [], cargo: [], sede: [], de: "", ate: "" };
}

function opcoesNivel(base, estado, nivel) {
  const contagem = new Map();
  for (const s of base.supervisores) {
    const passa = NIVEIS_HIERARQUIA.every((outro) => outro === nivel || !estado[outro].length || estado[outro].includes(s[CAMPO_SUPERVISOR[outro]]));
    if (!passa) continue;
    const valor = s[CAMPO_SUPERVISOR[nivel]];
    contagem.set(valor, (contagem.get(valor) || 0) + s.ativos);
  }
  for (const valor of estado[nivel]) if (!contagem.has(valor)) contagem.set(valor, 0);
  return [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true })).map(([t, n]) => ({ t, n }));
}

function deslocar(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("sv-SE");
}

export const ATALHOS_PERIODO = {
  "30 dias": (fim) => ({ de: deslocar(fim, -29), ate: fim }),
  "Mês atual": (fim) => ({ de: `${fim.slice(0, 8)}01`, ate: fim }),
  Tudo: (fim) => ({ de: deslocar(fim, -30), ate: fim }),
};

function barraPeriodo(estado, aoMudar) {
  const inicio = el("input", { type: "date", "aria-label": "Início do período", valor: estado.de || "" });
  const fim = el("input", { type: "date", "aria-label": "Fim do período", valor: estado.ate || "" });
  const mudar = () => { estado.de = inicio.value; estado.ate = fim.value; aoMudar(); };
  inicio.addEventListener("change", mudar);
  fim.addEventListener("change", mudar);
  return {
    barra: el("div", { classe: "periodo-barra", role: "group", "aria-label": "Período" }, [
      el("label", { classe: "periodo-campo" }, [el("span", { classe: "periodo-rotulo", texto: "Início" }), inicio]),
      el("label", { classe: "periodo-campo" }, [el("span", { classe: "periodo-rotulo", texto: "Fim" }), fim]),
      el("button", {
        classe: "periodo-redefinir", type: "button", title: "Redefinir para o período padrão", "aria-label": "Redefinir para o período padrão",
        onclick: () => { estado.de = ""; estado.ate = ""; aoMudar(); },
      }, icone("restore")),
    ]),
    mostrar: (de, ate) => { inicio.value = de || ""; fim.value = ate || ""; },
  };
}

export async function paginaComFiltros(conteudo, ctx, { estado, periodo = false, intro = null, lateral = null, contagens = null, desenhar }) {
  const base = await obterHierarquia();
  const corpo = el("div", { classe: "principal" });
  conteudo.replaceChildren(...[intro, corpo].filter(Boolean));
  let pedido = 0;
  let primeiro = true;
  let periodoAtual = { de: "", ate: "" };
  const controlePeriodo = periodo ? barraPeriodo(estado, atualizar) : null;
  const especificacao = lateral || { blocos: [{ tipo: "equipe", titulo: "Equipe", niveis: [["servico", "Serviço"], ["gerente", "Gerência"], ["coordenador", "Coordenação"], ["supervisor", "Supervisão"]] }] };

  async function atualizar() {
    const meu = ++pedido;
    if (primeiro) corpo.replaceChildren(carregando());
    else corpo.classList.add("recarregando");
    try {
      const resultado = await desenhar(estado);
      if (meu !== pedido) return;
      const nos = Array.isArray(resultado) || resultado instanceof Node ? resultado : resultado.nos;
      if (resultado.de) {
        periodoAtual = { de: resultado.de, ate: resultado.ate };
        if (controlePeriodo) controlePeriodo.mostrar(resultado.de, resultado.ate);
      }
      corpo.replaceChildren(...[].concat(nos).filter(Boolean));
      filtro.atualizar(blocos());
      if (contagens && ctx.definirContagens) contagens(estado).then(ctx.definirContagens).catch(() => null);
    } catch (erro) {
      if (meu === pedido) corpo.replaceChildren(blocoErro(erro));
    } finally {
      if (meu === pedido) {
        corpo.classList.remove("recarregando");
        primeiro = false;
      }
    }
  }

  function linhaPagina(def) {
    const valor = def.valor();
    return {
      chave: def.chave, rotulo: def.rotulo, vazio: def.vazio, unico: def.unico, semLimpar: def.semLimpar, semDestaque: def.semDestaque,
      sel: Array.isArray(valor) ? valor : valor ? [valor] : [],
      textoValor: def.textoValor ? def.textoValor() : undefined,
      opcoes: typeof def.opcoes === "function" ? def.opcoes() : def.opcoes,
      aoMudar: (v) => { def.definir(def.unico ? v[0] || "" : v); filtro.atualizar(blocos()); atualizar(); },
    };
  }

  function linhaPeriodo(atalhos) {
    const fim = deslocar(base.hoje, -1);
    const ativo = atalhos.find((a) => {
      const p = ATALHOS_PERIODO[a](fim);
      return a !== "Tudo" && p.de === periodoAtual.de && p.ate === periodoAtual.ate;
    });
    const dias = periodoAtual.de ? Math.round((new Date(`${periodoAtual.ate}T00:00:00`) - new Date(`${periodoAtual.de}T00:00:00`)) / 86400000) + 1 : 0;
    return {
      chave: "periodo", rotulo: "Período", unico: true, semLimpar: true, semDestaque: true, vazio: "Tudo",
      sel: ativo ? [ativo] : [],
      textoValor: ativo || (!estado.de && !estado.ate ? "Padrão" : `Personalizado, ${dias} dias`),
      opcoes: atalhos.map((t) => ({ t })),
      aoMudar: ([t]) => {
        const p = ATALHOS_PERIODO[t](fim);
        estado.de = p.de;
        estado.ate = p.ate;
        atualizar();
      },
    };
  }

  function linhaNivel([nivel, rotulo, vazio = "Todos"]) {
    return {
      chave: nivel, rotulo, vazio, sel: estado[nivel],
      opcoes: opcoesNivel(base, estado, nivel),
      aoMudar: (valores) => { estado[nivel] = valores; aplicar(); },
    };
  }

  const ativosEquipe = () => NIVEIS_HIERARQUIA.some((n) => estado[n].length) || estado.cargo.length;

  function blocos() {
    const lista = [];
    if (especificacao.visao) {
      const v = especificacao.visao;
      lista.push({ titulo: v.titulo, visao: { opcoes: v.opcoes, ativa: v.ativa(), aoTrocar: (x) => { v.aoTrocar(x); filtro.atualizar(blocos()); atualizar(); } } });
    }
    const definidos = typeof especificacao.blocos === "function" ? especificacao.blocos() : especificacao.blocos;
    for (const b of definidos.filter(Boolean)) {
      if (b.tipo === "periodo") lista.push({ titulo: b.titulo || "Período", filtros: [linhaPeriodo(b.atalhos)] });
      else if (b.tipo === "equipe") {
        lista.push({
          titulo: b.titulo || "Equipe",
          limpar: ativosEquipe() ? () => { for (const n of [...NIVEIS_HIERARQUIA, "cargo"]) estado[n] = []; (b.aoLimpar || (() => null))(); aplicar(); } : null,
          filtros: [...(b.antes || []).map(linhaPagina), ...b.niveis.map((n) => (CAMPO_SUPERVISOR[n[0]] ? linhaNivel(n) : null)), ...(b.depois || []).map(linhaPagina)],
        });
      } else if (b.tipo === "filtros") lista.push({ titulo: b.titulo, filtros: b.filtros.map(linhaPagina) });
      else if (b.tipo === "acoes") lista.push({ titulo: b.titulo || "Ações", acoes: b.itens() });
      else if (b.tipo === "conteudo") lista.push({ titulo: b.titulo, conteudo: b.nos(atualizar) });
    }
    return lista;
  }

  const filtro = filtroLateral(blocos());

  function aplicar() {
    for (const nivel of NIVEIS_HIERARQUIA) {
      const validas = new Set(opcoesNivel(base, estado, nivel).filter((o) => o.n > 0).map((o) => o.t));
      estado[nivel] = estado[nivel].filter((v) => validas.has(v));
    }
    filtro.atualizar(blocos());
    atualizar();
  }

  ctx.lateral.replaceChildren(filtro.raiz);
  ctx.centro.replaceChildren(controlePeriodo ? controlePeriodo.barra : "");
  await atualizar();
  return { atualizar };
}
