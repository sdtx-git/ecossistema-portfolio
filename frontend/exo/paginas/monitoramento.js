import { api, aviso, cabecalhoPagina, cartao, el, fmt, icone, kpis, selo, tabela, vazio } from "/design-system/ui.js";

const INTERVALO_MS = 10000;
const SITUACOES = {
  ok: ["Em dia", "positivo"],
  atrasada: ["Atrasada", "alerta"],
  circuito_aberto: ["Pausada após falhas seguidas", "critico"],
  aguardando: ["Aguardando a primeira rodada", ""],
};
const RESULTADOS = {
  ok: ["Entregue", "positivo"],
  sem_mudanca: ["Sem mudança", ""],
  falha: ["Falhou", "critico"],
  reprovado: ["Reprovado na validação", "critico"],
};
const ORIGENS = { agendada: "Agendada", sob_pedido: "Sob pedido", inicial: "Inicial" };

function desenhar(area, dados, aoPedir) {
  const [rotulo, tom] = SITUACOES[dados.situacao] || [dados.situacao, ""];
  const ultima = dados.historico[0];
  area.replaceChildren(
    kpis([
      { rotulo: "Situação", valor: rotulo, tom: tom === "positivo" ? "positivo" : tom === "critico" ? "critico" : "alerta" },
      { rotulo: "Última rodada", valor: dados.ultima_rodada ? fmt.hora(dados.ultima_rodada) : "-", detalhe: ultima ? ORIGENS[ultima.origem] : "" },
      { rotulo: "Próxima rodada", valor: dados.proxima_rodada ? fmt.hora(dados.proxima_rodada) : "-", detalhe: `A cada ${dados.intervalo_segundos} segundos` },
      { rotulo: "Entregas pendentes", valor: fmt.numero(dados.pendentes.length), tom: dados.pendentes.length ? "critico" : "positivo" },
    ]),
    el("div", { classe: "grade g-2" }, [
      cartao({
        titulo: "Extração sob pedido",
        detalhe: "Entra na fila e é atendida entre uma rodada e outra",
        corpo: el("div", { classe: "lista" }, Object.entries(dados.tipos).map(([tipo, titulo]) => el("div", { classe: "lista-item" }, [
          el("span", { texto: titulo }),
          el("button", { classe: "btn pequeno", type: "button", disabled: dados.fila.includes(tipo), onclick: () => aoPedir(tipo, titulo) },
            dados.fila.includes(tipo) ? "Na fila" : [icone("download"), "Extrair agora"]),
        ]))),
      }),
      cartao({
        titulo: "Última entrega por destino",
        corpo: dados.entregas.length ? tabela({
          busca: false,
          porPagina: 10,
          colunas: [
            { chave: "tipo", titulo: "Arquivo", formato: (v) => dados.tipos[v] },
            { chave: "destino", titulo: "Destino" },
            { chave: "linhas", titulo: "Linhas", alinhar: "direita", formato: fmt.numero },
            { chave: "em", titulo: "Recebido", formato: fmt.dataHora },
          ],
          linhas: dados.entregas,
        }) : vazio("Nenhuma entrega ainda."),
      }),
    ]),
    cartao({
      titulo: "Rodadas recentes",
      detalhe: "O conteúdo é comparado por hash: sem mudança, nada é reenviado. Falhas ficam pendentes e voltam na rodada seguinte.",
      corpo: el("div", { classe: "linha-tempo" }, dados.historico.map((r) => {
        const falhas = r.entregas.filter((e) => e.resultado === "falha" || e.resultado === "reprovado");
        const entregues = r.entregas.filter((e) => e.resultado === "ok").length;
        return el("div", { classe: "linha-tempo-item" }, [
          el("div", { estilo: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
            el("strong", { texto: fmt.dataHora(r.em) }),
            selo(ORIGENS[r.origem] || r.origem),
            r.situacao === "circuito_aberto" ? selo("Circuito aberto", "critico") : selo(`${entregues} entrega(s)`, entregues ? "positivo" : ""),
            ...falhas.map((f) => selo(`${RESULTADOS[f.resultado][0]}: ${dados.tipos[f.tipo]}${f.destino ? ` → ${f.destino}` : ""}`, "critico")),
          ]),
          ...r.eventos.map((e) => el("small", { texto: e })),
        ]);
      })),
    }),
  );
}

export async function renderMonitoramento(conteudo) {
  const area = el("div", { classe: "grade" });
  conteudo.replaceChildren(
    cabecalhoPagina("Monitoramento das cargas automáticas", "Coleta periódica dos arquivos de origem, validação de layout e entrega para cada aplicação."),
    area,
  );

  async function atualizar() {
    const dados = await api("/api/exo/monitoramento");
    desenhar(area, dados, pedir);
  }

  async function pedir(tipo, titulo) {
    try {
      await api("/api/exo/monitoramento/extracoes", { metodo: "POST", corpo: { tipo } });
      aviso(`Extração de ${titulo.toLowerCase()} solicitada.`);
      await atualizar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  await atualizar();
  const intervalo = setInterval(() => atualizar().catch((e) => aviso(e.message, "erro")), INTERVALO_MS);
  return () => clearInterval(intervalo);
}
