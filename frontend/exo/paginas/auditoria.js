import { api, cabecalhoPagina, cartao, fmt, tabela } from "/design-system/ui.js";

const ACOES = { entrada: "Entrou", criar: "Criou", alterar: "Alterou", solicitar: "Solicitou" };

export async function renderAuditoria(conteudo) {
  const registros = await api("/api/exo/auditoria");
  conteudo.replaceChildren(
    cabecalhoPagina("Auditoria", "Últimas 200 ações registradas no Exo."),
    cartao({
      corpo: tabela({
        colunas: [
          { chave: "em", titulo: "Quando", formato: fmt.dataHora },
          { chave: "usuario", titulo: "Usuário" },
          { chave: "acao", titulo: "Ação", formato: (v) => ACOES[v] || v },
          { chave: "entidade", titulo: "Entidade" },
          { chave: "entidade_id", titulo: "ID", alinhar: "direita", formato: (v) => v ?? "-" },
          { chave: "detalhe", titulo: "Detalhe" },
        ],
        linhas: registros,
        porPagina: 20,
        exportar: "auditoria_exo.csv",
      }),
    }),
  );
}
