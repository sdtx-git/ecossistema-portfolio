import { api, cabecalhoPagina, cartao, el, vazio } from "/design-system/ui.js";
import { seloStatusCaso, seloStatusTarefa } from "/exo/componentes.js";

export async function renderBusca(conteudo, contexto, parametros) {
  const termo = parametros.get("q") || "";
  const dados = await api(`/api/exo/busca?q=${encodeURIComponent(termo)}`);
  const total = dados.tarefas.length + dados.casos.length + dados.pessoas.length;
  const bloco = (titulo, itens, desenhar) => cartao({
    titulo,
    corpo: itens.length ? el("div", { classe: "lista" }, itens.map(desenhar)) : el("p", { classe: "texto-secundario", texto: "Nada encontrado." }),
  });

  conteudo.replaceChildren(
    cabecalhoPagina(`Resultados para "${termo}"`, `${total} resultado(s) no seu escopo.`),
    total ? el("div", { classe: "grade g-3" }, [
      bloco("Tarefas", dados.tarefas, (t) => el("a", { classe: "lista-item", href: `#/tarefas?abrir=${t.id}`, estilo: { color: "inherit" } }, [el("span", { texto: t.titulo }), seloStatusTarefa(t.status)])),
      bloco("Acompanhamentos", dados.casos, (c) => el("a", { classe: "lista-item", href: `#/casos?abrir=${c.id}`, estilo: { color: "inherit" } }, [el("span", { texto: c.titulo }), seloStatusCaso(c.status)])),
      bloco("Pessoas", dados.pessoas, (p) => el("div", { classe: "lista-item" }, [el("div", {}, [el("span", { texto: p.nome }), el("small", { texto: `${p.matricula} · ${p.supervisor}` })])])),
    ]) : vazio("Nenhum resultado", "Tente outro termo.", "search"),
  );
}
