import { api, cartao, el, fmt, kpis, selo, tabela, vazio } from "/design-system/ui.js";
import { mapaCalor } from "/design-system/bi.js";
import { prazoTexto, seloPrioridade, seloStatusCaso } from "/exo/componentes.js";

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function proximosDias(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString("sv-SE");
  });
}

export async function renderPainel(conteudo, contexto) {
  const dados = await api("/api/exo/painel");
  const { contadores: c, operacao } = dados;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const dias = proximosDias(14);
  const pessoas = [...new Set(dados.produtividade.map((p) => p.pessoa))];
  const matriz = pessoas.map((p) => dias.map((d) => dados.calor.find((x) => x.pessoa === p && x.dia === d)?.total || 0));

  const lista = (itens, desenharItem, titulo) => (itens.length ? el("div", { classe: "lista" }, itens.map(desenharItem)) : vazio(titulo, "", "circle-check"));

  conteudo.replaceChildren(
    el("div", { classe: "exo-saudacao" }, [
      el("h1", { texto: `${saudacao()}, ${contexto.usuario.nome}` }),
      el("p", { texto: `Hoje é ${hoje}.` }),
    ]),
    kpis([
      { rotulo: "Tarefas atrasadas", valor: fmt.numero(c.tarefas_atrasadas), tom: c.tarefas_atrasadas ? "critico" : "", detalhe: c.tarefas_atrasadas ? "Prazo vencido" : "Nenhuma vencida" },
      { rotulo: "Vencem nos próximos dias", valor: fmt.numero(c.vencem_em_breve), tom: c.vencem_em_breve ? "alerta" : "", detalhe: "Ainda dá tempo" },
      { rotulo: "Minhas tarefas em aberto", valor: fmt.numero(c.minhas_abertas), detalhe: "Atribuídas a você" },
      { rotulo: "Tarefas críticas em aberto", valor: fmt.numero(c.criticas_abertas), tom: c.criticas_abertas ? "critico" : "", detalhe: "Prioridade alta" },
      { rotulo: "Acompanhamentos ativos", valor: fmt.numero(c.casos_abertos), detalhe: "Em aberto no seu escopo" },
      { rotulo: "Medidas no mês", valor: fmt.numero(c.medidas_mes), detalhe: `${fmt.numero(c.medidas_30d)} em 30 dias` },
    ]),
    el("div", { classe: "grade g-3-2" }, [
      cartao({
        titulo: "Produtividade",
        detalhe: "Tarefas por responsável",
        corpo: dados.produtividade.length ? tabela({
          busca: false,
          porPagina: 8,
          colunas: [
            { chave: "pessoa", titulo: "Pessoa", forte: true },
            { chave: "total", titulo: "Total", alinhar: "direita" },
            { chave: "concluidas", titulo: "Concluídas", alinhar: "direita" },
            { chave: "no_prazo", titulo: "No prazo", alinhar: "direita" },
            { chave: "atrasadas", titulo: "Atrasadas", alinhar: "direita", render: (v) => selo(fmt.numero(v), v ? "critico" : "") },
            { chave: "vencendo_hoje", titulo: "Vencendo hoje", alinhar: "direita", render: (v) => selo(fmt.numero(v), v ? "alerta" : "") },
            { chave: "produtividade", titulo: "Produtividade", alinhar: "direita", formato: (v) => fmt.pct(v) },
          ],
          linhas: dados.produtividade,
        }) : vazio("Sem tarefas", "Nenhuma tarefa no seu escopo."),
      }),
      cartao({
        titulo: "Mapa de calor diário",
        detalhe: "Tarefas em aberto por prazo, próximos 14 dias",
        corpo: pessoas.length ? mapaCalor({ linhas: pessoas, colunas: dias.map((d) => fmt.dataCurta(d)), matriz }) : vazio("Sem tarefa"),
      }),
    ]),
    el("div", { classe: "grade g-3" }, [
      cartao({
        titulo: "Próximas tarefas",
        acoes: el("a", { classe: "btn pequeno", href: "#/tarefas" }, "Ver todas"),
        corpo: lista(dados.proximas_tarefas, (t) => el("a", { classe: "lista-item", href: `#/tarefas?abrir=${t.id}` }, [
          el("div", { classe: "exo-item-tarefa" }, [el("strong", { texto: t.titulo }), el("small", {}, prazoTexto(t.prazo, t.atrasada))]),
          seloPrioridade(t.prioridade),
        ]), "Nenhuma tarefa em aberto"),
      }),
      cartao({
        titulo: "Agenda",
        acoes: el("a", { classe: "btn pequeno", href: "#/agenda" }, "Abrir agenda"),
        corpo: lista(dados.proximas_reunioes, (r) => el("div", { classe: "lista-item" }, [
          el("div", { classe: "exo-item-tarefa" }, [el("strong", { texto: r.titulo }), el("small", { texto: `${fmt.dataHora(r.inicio)} · ${r.local || "Sem local"}` })]),
        ]), "Nenhuma reunião prevista"),
      }),
      cartao({
        titulo: "Acompanhamentos recentes",
        acoes: el("a", { classe: "btn pequeno", href: "#/casos" }, "Ver todos"),
        corpo: lista(dados.casos_recentes, (caso) => el("a", { classe: "lista-item", href: `#/casos?abrir=${caso.id}` }, [
          el("div", { classe: "exo-item-tarefa" }, [el("strong", { texto: caso.titulo }), el("small", { texto: `Aberto em ${fmt.data(caso.aberto_em)}` })]),
          seloStatusCaso(caso.status),
        ]), "Nenhum acompanhamento em aberto"),
      }),
    ]),
    cartao({
      titulo: "Operação no seu escopo",
      detalhe: "Dados das outras aplicações do ecossistema",
      corpo: kpis([
        { rotulo: "Ativos", valor: fmt.numero(operacao.ativos) },
        { rotulo: "Desligados em 30 dias", valor: fmt.numero(operacao.desligados_30d), tom: operacao.desligados_30d ? "critico" : "" },
        { rotulo: "Novatos em 30 dias", valor: fmt.numero(operacao.novatos_30d) },
        { rotulo: "RQs em andamento", valor: fmt.numero(operacao.rqs_em_andamento) },
        { rotulo: "Excedentes em 7 dias", valor: fmt.numero(operacao.excedentes_7d), tom: operacao.excedentes_7d ? "alerta" : "" },
        { rotulo: "Sub-jornada em 7 dias", valor: fmt.numero(operacao.subjornada_7d) },
      ]),
    }),
  );
}
