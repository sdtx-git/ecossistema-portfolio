import { api, aviso, cabecalhoPagina, campo, cartao, el, fmt, icone, kpis, modal, segmentado, selecao, selo, tabela } from "/design-system/ui.js";
import { TIPOS_MEDIDA, seletorPessoa } from "/exo/componentes.js";

const TOM_MEDIDA = { "Orientação verbal": "atencao", "Advertência escrita": "alerta", "Suspensão": "critico" };

export function abrirNovaMedida(contexto, aoSalvar, { pessoa: pessoaInicial = null, casoId = null } = {}) {
  let pessoa = pessoaInicial;
  const sugestao = el("div");
  const tipo = selecao(TIPOS_MEDIDA);
  const data = el("input", { classe: "entrada", type: "date", valor: new Date().toLocaleDateString("sv-SE"), max: new Date().toLocaleDateString("sv-SE") });
  const motivo = el("textarea", { classe: "area-texto", maxlength: 500 });
  const salvar = el("button", { classe: "btn principal", type: "button" }, "Registrar medida");

  async function sugerir(escolhida) {
    pessoa = escolhida;
    try {
      const dados = await api(`/api/exo/medidas/sugestao/${escolhida.id}`);
      tipo.value = dados.sugerida;
      sugestao.replaceChildren(el("div", { classe: "exo-sugestao" }, [
        dados.anteriores.length
          ? `${dados.anteriores.length} medida(s) nos últimos ${dados.janela_dias} dias. A mais recente: ${dados.anteriores[0].tipo} em ${fmt.data(dados.anteriores[0].data)}. `
          : `Nenhuma medida nos últimos ${dados.janela_dias} dias. `,
        "Próximo passo sugerido: ",
        el("strong", { texto: dados.sugerida }),
        ".",
      ]));
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  const janela = modal({
    titulo: "Registrar medida",
    conteudo: el("div", { classe: "formulario" }, [
      seletorPessoa({ aoEscolher: sugerir, inicial: pessoaInicial }),
      sugestao,
      el("div", { classe: "formulario-linha" }, [campo("Tipo", tipo), campo("Data", data)]),
      campo("Motivo", motivo),
    ]),
    acoes: [el("button", { classe: "btn", type: "button", onclick: () => janela.fechar() }, "Cancelar"), salvar],
  });
  if (pessoaInicial) sugerir(pessoaInicial);

  salvar.addEventListener("click", async () => {
    if (!pessoa) {
      aviso("Escolha a pessoa.", "erro");
      return;
    }
    salvar.disabled = true;
    try {
      await api("/api/exo/medidas", {
        metodo: "POST",
        corpo: { pessoa_id: pessoa.id, tipo: tipo.value, data: data.value, motivo: motivo.value.trim(), caso_id: casoId },
      });
      janela.fechar();
      aviso("Medida registrada.");
      aoSalvar();
    } catch (erro) {
      aviso(erro.message, "erro");
      salvar.disabled = false;
    }
  });
}

const estadoMedidas = { visao: "medidas" };

function porColaborador(medidas, inicioMes) {
  const mapa = new Map();
  for (const m of medidas) {
    const item = mapa.get(m.pessoa_id) || { pessoa: m.pessoa, supervisor: m.supervisor, total: 0, no_mes: 0, ultima: "", ultimo_tipo: "" };
    item.total += 1;
    if (m.data >= inicioMes) item.no_mes += 1;
    if (m.data > item.ultima) { item.ultima = m.data; item.ultimo_tipo = m.tipo; }
    mapa.set(m.pessoa_id, item);
  }
  return [...mapa.values()].map((i) => ({ ...i, reincidente: i.total >= 2 ? "Sim" : "Não" })).sort((a, b) => b.total - a.total || b.ultima.localeCompare(a.ultima));
}

export async function renderMedidas(conteudo, contexto) {
  const area = el("div", { classe: "grade" });

  async function carregar() {
    const medidas = await api("/api/exo/medidas");
    const inicioMes = new Date().toLocaleDateString("sv-SE").slice(0, 8) + "01";
    const colaboradores = porColaborador(medidas, inicioMes);
    const doMes = medidas.filter((m) => m.data >= inicioMes);
    const reincidentes = colaboradores.filter((c) => c.total >= 2).length;
    const suspensoes = medidas.filter((m) => m.tipo === "Suspensão").length;
    area.replaceChildren(
      kpis([
        { rotulo: "Medidas no mês", valor: fmt.numero(doMes.length), detalhe: `${fmt.numero(medidas.length)} no histórico` },
        { rotulo: "Colaboradores", valor: fmt.numero(colaboradores.length), detalhe: "Com ao menos uma medida" },
        { rotulo: "Reincidentes", valor: fmt.numero(reincidentes), tom: reincidentes ? "alerta" : "", detalhe: "Duas medidas ou mais" },
        { rotulo: "Suspensões", valor: fmt.numero(suspensoes), tom: suspensoes ? "critico" : "" },
      ]),
      el("div", { classe: "intro" }, [
        el("p", { texto: estadoMedidas.visao === "medidas" ? "Todas as medidas registradas" : "Consolidado por colaborador" }),
        segmentado({ rotulo: "Visão", opcoes: [["medidas", "Medidas"], ["colaboradores", "Colaboradores"]], ativa: estadoMedidas.visao, aoTrocar: (v) => { estadoMedidas.visao = v; recarregar(); } }),
      ]),
      estadoMedidas.visao === "medidas"
        ? cartao({
          titulo: "Medidas",
          corpo: tabela({
            colunas: [
              { chave: "data", titulo: "Data", formato: fmt.data },
              { chave: "pessoa", titulo: "Colaborador", forte: true },
              { chave: "supervisor", titulo: "Supervisão" },
              { chave: "tipo", titulo: "Tipo", render: (v) => selo(v, TOM_MEDIDA[v]) },
              { chave: "motivo", titulo: "Motivo" },
              { chave: "aplicada_por_nome", titulo: "Registrada por" },
            ],
            linhas: medidas,
            exportar: "medidas.csv",
            placeholder: "Buscar colaborador ou motivo",
            textoVazio: "Nenhuma medida registrada no seu escopo.",
          }),
        })
        : cartao({
          titulo: "Colaboradores",
          corpo: tabela({
            colunas: [
              { chave: "pessoa", titulo: "Colaborador", forte: true },
              { chave: "supervisor", titulo: "Supervisão" },
              { chave: "reincidente", titulo: "Reincidente", render: (v) => selo(v, v === "Sim" ? "alerta" : "") },
              { chave: "no_mes", titulo: "No mês", alinhar: "direita" },
              { chave: "total", titulo: "Total", alinhar: "direita" },
              { chave: "ultima", titulo: "Última", formato: (v, l) => `${fmt.data(v)} · ${l.ultimo_tipo}` },
            ],
            linhas: colaboradores,
            exportar: "medidas_por_colaborador.csv",
            placeholder: "Buscar colaborador",
          }),
        }),
    );
  }

  const recarregar = () => carregar().catch((e) => aviso(e.message, "erro"));
  conteudo.replaceChildren(
    cabecalhoPagina("Medidas", "Medidas disciplinares do seu escopo. Ao escolher a pessoa, o Exo sugere o próximo passo pelo histórico dos últimos 180 dias.",
      el("button", { classe: "btn principal", type: "button", onclick: () => abrirNovaMedida(contexto, recarregar) }, [icone("plus"), "Registrar medida"])),
    area,
  );
  await carregar();
}
