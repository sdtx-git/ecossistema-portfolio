import { api, aviso, cabecalhoPagina, campo, el, fmt, icone, modal, vazio } from "/design-system/ui.js";
import { seletorUsuario } from "/exo/componentes.js";

function dataLocal(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return d.toLocaleDateString("sv-SE");
}

function abrirNovaReuniao(contexto, aoSalvar) {
  const titulo = el("input", { classe: "entrada", maxlength: 120 });
  const dia = el("input", { classe: "entrada", type: "date", valor: dataLocal(1) });
  const inicio = el("input", { classe: "entrada", type: "time", valor: "10:00" });
  const fim = el("input", { classe: "entrada", type: "time", valor: "11:00" });
  const local = el("input", { classe: "entrada", maxlength: 80, placeholder: "Sala ou link" });
  const pauta = el("textarea", { classe: "area-texto", maxlength: 2000 });
  const participantes = contexto.usuarios
    .filter((u) => u.id !== contexto.usuario.id)
    .map((u) => ({ usuario: u, marcador: el("input", { type: "checkbox" }) }));
  const salvar = el("button", { classe: "btn principal", type: "button" }, "Agendar");
  const janela = modal({
    titulo: "Nova reunião",
    conteudo: el("div", { classe: "formulario" }, [
      campo("Título", titulo),
      el("div", { classe: "formulario-linha" }, [campo("Dia", dia), campo("Local", local)]),
      el("div", { classe: "formulario-linha" }, [campo("Início", inicio), campo("Fim", fim)]),
      campo("Pauta", pauta),
      el("div", { classe: "campo" }, [
        el("span", { classe: "campo-rotulo", texto: "Participantes" }),
        ...participantes.map((p) => el("label", { classe: "marcador" }, [p.marcador, p.usuario.nome])),
      ]),
    ]),
    acoes: [el("button", { classe: "btn", type: "button", onclick: () => janela.fechar() }, "Cancelar"), salvar],
  });
  salvar.addEventListener("click", async () => {
    salvar.disabled = true;
    try {
      await api("/api/exo/agenda", {
        metodo: "POST",
        corpo: {
          titulo: titulo.value.trim(), inicio: `${dia.value}T${inicio.value}`, fim: `${dia.value}T${fim.value}`,
          local: local.value.trim(), pauta: pauta.value.trim(),
          participantes: participantes.filter((p) => p.marcador.checked).map((p) => p.usuario.id),
        },
      });
      janela.fechar();
      aviso("Reunião agendada.");
      aoSalvar();
    } catch (erro) {
      aviso(erro.message, "erro");
      salvar.disabled = false;
    }
  });
}

function abrirReuniao(reuniao, contexto, aoAlterar) {
  const texto = el("input", { classe: "entrada", maxlength: 500, placeholder: "O que foi decidido?" });
  const gerar = el("input", { type: "checkbox" });
  const responsavel = seletorUsuario(contexto.usuarios, contexto.usuario.id);
  const prazo = el("input", { classe: "entrada", type: "date" });
  const decisoes = el("div", { classe: "lista" });

  function desenharDecisoes(lista) {
    decisoes.replaceChildren(...(lista.length ? lista.map((d) => el("div", { classe: "lista-item" }, [
      el("span", { texto: d.texto }),
      d.tarefa_id ? el("a", { href: `#/tarefas?abrir=${d.tarefa_id}`, texto: "Ver tarefa" }) : null,
    ])) : [el("p", { classe: "texto-secundario", texto: "Nenhuma decisão registrada." })]));
  }

  async function registrar() {
    if (texto.value.trim().length < 3) return;
    try {
      const resultado = await api(`/api/exo/agenda/${reuniao.id}/decisoes`, {
        metodo: "POST",
        corpo: { texto: texto.value.trim(), gerar_tarefa: gerar.checked, responsavel_id: Number(responsavel.value), prazo: prazo.value || null },
      });
      reuniao.decisoes.push({ texto: texto.value.trim(), tarefa_id: resultado.tarefa_id });
      desenharDecisoes(reuniao.decisoes);
      texto.value = "";
      aviso(resultado.tarefa_id ? "Decisão registrada e convertida em tarefa." : "Decisão registrada.");
      aoAlterar();
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  }

  desenharDecisoes(reuniao.decisoes);
  modal({
    titulo: reuniao.titulo,
    largo: true,
    conteudo: [
      el("dl", { classe: "detalhe" }, [
        el("dt", { texto: "Quando" }), el("dd", { texto: `${fmt.dataHora(reuniao.inicio)} até ${fmt.hora(reuniao.fim)}` }),
        el("dt", { texto: "Local" }), el("dd", { texto: reuniao.local || "-" }),
        el("dt", { texto: "Organizador" }), el("dd", { texto: reuniao.organizador || "-" }),
        el("dt", { texto: "Participantes" }), el("dd", { texto: reuniao.participantes.map((p) => p.nome).join(", ") }),
      ]),
      reuniao.pauta ? el("p", { texto: reuniao.pauta }) : null,
      el("h3", { texto: "Decisões" }),
      decisoes,
      campo("Nova decisão", texto),
      el("label", { classe: "marcador" }, [gerar, "Transformar em tarefa"]),
      el("div", { classe: "formulario-linha" }, [campo("Responsável pela tarefa", responsavel), campo("Prazo da tarefa", prazo)]),
      el("div", {}, el("button", { classe: "btn principal", type: "button", onclick: registrar }, [icone("check"), "Registrar decisão"])),
    ].filter(Boolean),
  });
}

export async function renderAgenda(conteudo, contexto) {
  const area = el("div", { classe: "grade" });

  async function carregar() {
    const reunioes = await api(`/api/exo/agenda?de=${dataLocal(-7)}&ate=${dataLocal(30)}`);
    if (!reunioes.length) {
      area.replaceChildren(vazio("Nenhuma reunião prevista", "Nada entre a semana passada e os próximos 30 dias.", "calendar"));
      return;
    }
    const porDia = new Map();
    for (const r of reunioes) {
      const dia = r.inicio.slice(0, 10);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(r);
    }
    const hoje = dataLocal();
    area.replaceChildren(...[...porDia.entries()].map(([dia, lista]) => el("section", { classe: "exo-dia" }, [
      el("h3", { texto: dia === hoje ? `Hoje · ${fmt.data(dia)}` : new Date(`${dia}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) }),
      ...lista.map((r) => el("button", { classe: "exo-reuniao", type: "button", onclick: () => abrirReuniao(r, contexto, recarregar) }, [
        el("div", {}, [el("strong", { texto: r.titulo }), el("small", { texto: `${fmt.hora(r.inicio)} às ${fmt.hora(r.fim)} · ${r.local || "Sem local"} · ${r.participantes.length} participante(s)` })]),
        el("span", { classe: "contador", title: "Decisões", texto: r.decisoes.length }),
      ])),
    ])));
  }

  const recarregar = () => carregar().catch((e) => aviso(e.message, "erro"));
  conteudo.replaceChildren(
    cabecalhoPagina("Agenda", "Reuniões em que você participa. Registre decisões e transforme-as em tarefas com responsável e prazo.",
      el("button", { classe: "btn principal", type: "button", onclick: () => abrirNovaReuniao(contexto, recarregar) }, [icone("plus"), "Nova reunião"])),
    area,
  );
  await carregar();
}
