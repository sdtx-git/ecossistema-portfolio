import { api, el, fmt, selecao, selo } from "/design-system/ui.js";

export const TOM_STATUS_TAREFA = { "A fazer": "", "Em andamento": "atencao", Aguardando: "alerta", "Concluída": "positivo" };
export const TOM_STATUS_CASO = { Aberto: "alerta", "Em acompanhamento": "atencao", Encerrado: "positivo" };
export const TOM_PRIORIDADE = { Baixa: "", "Média": "atencao", Alta: "critico" };
export const STATUS_TAREFA = ["A fazer", "Em andamento", "Aguardando", "Concluída"];
export const STATUS_CASO = ["Aberto", "Em acompanhamento", "Encerrado"];
export const PRIORIDADES = ["Baixa", "Média", "Alta"];
export const TIPOS_CASO = ["Absenteísmo", "Conduta", "Desempenho", "Saúde e bem-estar", "Jornada"];
export const TIPOS_MEDIDA = ["Orientação verbal", "Advertência escrita", "Suspensão"];

export const seloStatusTarefa = (s) => selo(s, TOM_STATUS_TAREFA[s]);
export const seloStatusCaso = (s) => selo(s, TOM_STATUS_CASO[s]);
export const seloPrioridade = (p) => selo(p, TOM_PRIORIDADE[p]);

export function prazoTexto(prazo, atrasada) {
  if (!prazo) return el("span", { classe: "texto-secundario", texto: "Sem prazo" });
  return el("span", { classe: atrasada ? "texto-critico" : "", texto: atrasada ? `${fmt.data(prazo)} · atrasada` : fmt.data(prazo) });
}

export function seletorUsuario(usuarios, valor = "", { vazio = false } = {}) {
  const opcoes = usuarios.map((u) => [u.id, u.nome]);
  return selecao(vazio ? [["", "Eu mesmo"], ...opcoes] : opcoes, valor);
}

export function linhaTempo(itens) {
  if (!itens.length) return el("p", { classe: "texto-secundario", texto: "Sem registros." });
  return el("div", { classe: "linha-tempo" }, itens.map((i) => el("div", { classe: "linha-tempo-item" }, [
    el("span", { texto: i.texto }),
    el("small", { texto: `${i.autor || "Sistema"} · ${fmt.dataHora(i.em)}` }),
  ])));
}

export function seletorPessoa({ aoEscolher, inicial = null }) {
  let escolhida = inicial;
  let temporizador = null;
  const resultados = el("div", { classe: "exo-resultados" });
  const entrada = el("input", { classe: "entrada", type: "search", placeholder: "Buscar por nome ou matrícula", "aria-label": "Buscar pessoa" });

  function desenhar(pessoas) {
    resultados.replaceChildren(...pessoas.map((p) => el("button", {
      classe: "exo-resultado", type: "button", "aria-pressed": escolhida?.id === p.id ? "true" : "false",
      onclick: () => { escolhida = p; desenhar(pessoas); aoEscolher(p); },
    }, [el("span", { texto: p.nome }), el("small", { texto: `${p.matricula} · ${p.supervisor}` })])));
    if (!pessoas.length) resultados.replaceChildren(el("p", { classe: "texto-secundario", texto: "Nenhuma pessoa encontrada no seu escopo." }));
  }

  async function buscar() {
    const pessoas = await api(`/api/exo/pessoas?busca=${encodeURIComponent(entrada.value)}`);
    desenhar(pessoas);
  }

  entrada.addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 250);
  });
  if (inicial) desenhar([inicial]);
  else buscar();
  return el("div", { classe: "campo" }, [el("span", { classe: "campo-rotulo", texto: "Pessoa" }), entrada, resultados]);
}
