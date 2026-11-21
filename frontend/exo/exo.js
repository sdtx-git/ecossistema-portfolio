import { api, aviso, blocoErro, botaoTema, campo, carregando, el, icone, iniciarTema, marca, rodape } from "/design-system/ui.js";
import { renderPainel } from "/exo/paginas/painel.js";
import { renderTarefas } from "/exo/paginas/tarefas.js";
import { renderCasos } from "/exo/paginas/casos.js";
import { renderMedidas } from "/exo/paginas/medidas.js";
import { renderAgenda } from "/exo/paginas/agenda.js";
import { renderEquipes } from "/exo/paginas/equipes.js";
import { renderMonitoramento } from "/exo/paginas/monitoramento.js";
import { renderAuditoria } from "/exo/paginas/auditoria.js";
import { renderBusca } from "/exo/paginas/busca.js";

iniciarTema();

const ROTAS = [
  { caminho: "/painel", rotulo: "Painel", icone: "layout-dashboard", render: renderPainel },
  { caminho: "/tarefas", rotulo: "Tarefas", icone: "checklist", render: renderTarefas },
  { caminho: "/casos", rotulo: "Acompanhamentos", icone: "folders", render: renderCasos },
  { caminho: "/medidas", rotulo: "Medidas", icone: "gavel", render: renderMedidas },
  { caminho: "/agenda", rotulo: "Agenda", icone: "calendar-event", render: renderAgenda },
  { caminho: "/equipes", rotulo: "Equipes", icone: "hierarchy-2", render: renderEquipes },
  { caminho: "/monitoramento", rotulo: "Monitoramento", icone: "activity-heartbeat", render: renderMonitoramento, admin: true },
  { caminho: "/auditoria", rotulo: "Auditoria", icone: "shield-check", render: renderAuditoria, admin: true },
  { caminho: "/busca", rotulo: "Busca", icone: "search", render: renderBusca, oculta: true },
];
const ROTULOS_NIVEL = { diretoria: "Diretoria", gerente: "Gerência", coordenador: "Coordenação", supervisor: "Supervisão" };

const raiz = document.getElementById("app");
const contexto = { usuario: null, usuarios: [], ir, recarregar: () => navegar() };
let limparPagina = null;
let casca = null;

function ir(caminho, parametros = {}) {
  const busca = new URLSearchParams(parametros).toString();
  window.location.hash = busca ? `#${caminho}?${busca}` : `#${caminho}`;
}

function rotaAtual() {
  const [caminho, busca = ""] = (window.location.hash || "#/painel").replace(/^#/, "").split("?");
  const permitidas = ROTAS.filter((r) => !r.admin || contexto.usuario.papel === "admin");
  const rota = permitidas.find((r) => r.caminho === caminho) || permitidas[0];
  return { rota, parametros: new URLSearchParams(busca) };
}

function telaEntrada(mensagem = "") {
  casca = null;
  const login = el("input", { classe: "entrada", autocomplete: "username", required: true });
  const senha = el("input", { classe: "entrada", type: "password", autocomplete: "current-password", required: true });
  const erro = el("p", { classe: "texto-critico", role: "alert", texto: mensagem });
  const entrar = el("button", { classe: "btn principal", type: "submit" }, "Entrar");
  const formulario = el("form", { classe: "formulario" }, [campo("Login", login), campo("Senha", senha), erro, entrar]);
  formulario.addEventListener("submit", async (e) => {
    e.preventDefault();
    entrar.disabled = true;
    erro.textContent = "";
    try {
      await api("/api/exo/entrar", { metodo: "POST", corpo: { login: login.value, senha: senha.value } });
      await iniciar();
    } catch (falha) {
      erro.textContent = falha.message;
      entrar.disabled = false;
    }
  });
  raiz.replaceChildren(el("main", { classe: "exo-entrada" }, el("div", { classe: "exo-entrada-cartao" }, [
    marca({ icone: "sparkles", titulo: "Exo", subtitulo: "Assistente de gestão" }),
    formulario,
    el("div", { classe: "exo-dica" }, [
      el("b", { texto: "Demonstração" }),
      el("span", { texto: "Usuários: admin, gerente1, coordenador1 e supervisor1. Senha: demo123." }),
    ]),
    el("a", { href: "/", classe: "btn fantasma" }, [icone("arrow-left"), "Voltar ao Hub"]),
  ])));
  login.focus();
}

async function sair() {
  await api("/api/exo/sair", { metodo: "POST" });
  contexto.usuario = null;
  window.location.hash = "";
  telaEntrada();
}

function montarCasca() {
  const busca = el("input", { type: "search", placeholder: "Buscar tarefas, casos e pessoas", "aria-label": "Busca global" });
  busca.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && busca.value.trim().length >= 2) ir("/busca", { q: busca.value.trim() });
  });
  const usuario = contexto.usuario;
  const lateral = el("nav", { classe: "exo-lateral", "aria-label": "Navegação do Exo" });
  const conteudo = el("main", { classe: "exo-conteudo" });
  raiz.replaceChildren(el("div", { classe: "app" }, [
    el("div", { classe: "exo-topo-faixa" }, el("header", { classe: "topo exo-topo" }, el("div", { classe: "topo-principal" }, [
      marca({ icone: "sparkles", titulo: "Exo", subtitulo: "Assistente de gestão" }),
      el("div", { classe: "topo-centro" }, el("div", { classe: "exo-busca" }, [icone("search"), busca])),
      el("div", { classe: "topo-acoes" }, [
        el("div", { classe: "exo-usuario" }, [el("strong", { texto: usuario.nome }), el("span", { texto: usuario.escopo ? `${ROTULOS_NIVEL[usuario.nivel]} · ${usuario.escopo}` : "Acesso total" })]),
        el("a", { classe: "btn", href: "/" }, [icone("arrow-left"), "Hub"]),
        botaoTema(),
        el("button", { classe: "btn icone", type: "button", title: "Sair", "aria-label": "Sair", onclick: () => sair().catch((e) => aviso(e.message, "erro")) }, icone("logout")),
      ]),
    ]))),
    el("div", { classe: "exo-casca" }, [lateral, el("div", { classe: "exo-coluna" }, [conteudo, rodape("Exo")])]),
  ]));
  return { lateral, conteudo };
}

async function navegar() {
  if (!contexto.usuario || !casca) return;
  if (limparPagina) {
    limparPagina();
    limparPagina = null;
  }
  const { rota, parametros } = rotaAtual();
  const visiveis = ROTAS.filter((r) => !r.oculta && (!r.admin || contexto.usuario.papel === "admin"));
  const grupo = (titulo, rotas) => (rotas.length ? el("div", { classe: "exo-grupo" }, [
    el("div", { classe: "exo-grupo-titulo", texto: titulo }),
    ...rotas.map((r) => el("a", { classe: "exo-item", href: `#${r.caminho}`, "aria-current": r === rota ? "page" : null }, [icone(r.icone), r.rotulo])),
  ]) : null);
  casca.lateral.replaceChildren(grupo("Gestão", visiveis.filter((r) => !r.admin)), grupo("Administração", visiveis.filter((r) => r.admin)));
  document.title = `${rota.rotulo} · Exo`;
  casca.conteudo.replaceChildren(carregando());
  try {
    limparPagina = (await rota.render(casca.conteudo, contexto, parametros)) || null;
  } catch (erro) {
    if (erro.status === 401) {
      telaEntrada("Sua sessão expirou. Entre novamente.");
      return;
    }
    casca.conteudo.replaceChildren(blocoErro(erro));
  }
}

async function iniciar() {
  try {
    contexto.usuario = await api("/api/exo/eu");
  } catch (erro) {
    if (erro.status === 401) {
      telaEntrada();
      return;
    }
    raiz.replaceChildren(blocoErro(erro));
    return;
  }
  contexto.usuarios = await api("/api/exo/usuarios");
  casca = montarCasca();
  await navegar();
}

window.addEventListener("hashchange", navegar);
window.addEventListener("temaalterado", navegar);
iniciar();
