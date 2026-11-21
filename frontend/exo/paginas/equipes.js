import { api, cabecalhoPagina, cartao, el, fmt, kpis, tabela, vazio } from "/design-system/ui.js";

export async function renderEquipes(conteudo) {
  const arvore = await api("/api/exo/equipes");
  const supervisoes = arvore.flatMap((g) => g.coordenadores.flatMap((c) => c.supervisores));
  const soma = (campo) => supervisoes.reduce((t, s) => t + s[campo], 0);

  conteudo.replaceChildren(
    cabecalhoPagina("Equipes", "A estrutura do seu escopo, com ativos, desligamentos recentes e casos em aberto por supervisão."),
    supervisoes.length ? kpis([
      { rotulo: "Supervisões", valor: fmt.numero(supervisoes.length), tom: "neutro" },
      { rotulo: "Ativos", valor: fmt.numero(soma("ativos")), tom: "positivo" },
      { rotulo: "Desligados em 30 dias", valor: fmt.numero(soma("desligados_30d")), tom: "critico" },
      { rotulo: "Casos em aberto", valor: fmt.numero(soma("casos_abertos")), tom: "alerta" },
    ]) : vazio("Nenhuma equipe no seu escopo", "", "users"),
    el("div", { classe: "exo-arvore" }, arvore.map((gerente) => cartao({
      titulo: gerente.nome,
      detalhe: `${gerente.coordenadores.length} coordenação(ões)`,
      corpo: gerente.coordenadores.map((coord) => el("div", { classe: "exo-coordenacao" }, [
        el("h3", {}, [coord.nome]),
        tabela({
          busca: false,
          porPagina: 10,
          colunas: [
            { chave: "nome", titulo: "Supervisão" },
            { chave: "ativos", titulo: "Ativos", alinhar: "direita" },
            { chave: "desligados_30d", titulo: "Desligados em 30 dias", alinhar: "direita" },
            { chave: "casos_abertos", titulo: "Casos em aberto", alinhar: "direita" },
          ],
          linhas: coord.supervisores,
        }),
      ])),
    }))),
  );
}
