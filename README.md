# Ecossistema de Governança de Pessoas

[![testes](https://github.com/sdtx-git/ecossistema-portfolio/actions/workflows/testes.yml/badge.svg)](https://github.com/sdtx-git/ecossistema-portfolio/actions/workflows/testes.yml)
![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20modules-F7DF1E?logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-4-FF6384?logo=chartdotjs&logoColor=white)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)

Réplica de demonstração de um conjunto de aplicações internas de **gestão de pessoas em operações de atendimento**: um hub de acesso, um assistente de gestão e três painéis analíticos alimentados por cargas automáticas.

Auditoria de hierarquia, SLA de reposição de vagas e compliance de jornada (interjornada, excedentes e sub-jornada) num único processo FastAPI, com frontend sem build, tema claro e escuro e dados 100% sintéticos. Roda local em um comando.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/exo-dark.png">
  <img alt="Painel do Exo, assistente de gestão" src="docs/screenshots/exo-light.png">
</picture>

> Todos os dados são **100% sintéticos**, gerados por código com semente fixa. Não há nomes reais, empresas, fornecedores, endereços ou credenciais. A hierarquia usa rótulos genéricos (`Gerente 1`, `Coordenador 3`, `Supervisor 12`, `Agente 0042`).

## Módulos

| Módulo | O que faz |
|---|---|
| **Hub de Governança** | Central de sistemas: saudação, sistemas internos com status ao vivo e indicadores (RQs pendentes, recebimento do quadro), acessos rápidos por categoria editáveis (CRUD persistido em JSON) e acesso ao Exo. |
| **Exo** | Assistente de gestão com login e escopo por nível hierárquico: painel do dia, tarefas com histórico, casos individuais, medidas disciplinares com sugestão de progressão, agenda com decisões que viram tarefas, visão de equipes, busca global, monitoramento das cargas e trilha de auditoria. |
| **Gestão do Quadro** | Auditoria sob demanda (dentro do próprio quadro e contra o relatório de funcionários) com rastreio da origem de cada divergência e filtro por área (Planejamento/PGT), arquivo de inserção de novatos e turmas, conferência dos arquivos mensais de ajuste, consolidado das planilhas de RQs e acompanhamento do RH, quadro funcional dia a dia com status e escala, desligados do mês com corte parcial e comparação com o mês anterior, contas pendentes de baixa com a situação no relatório e upload manual das fontes. Na demonstração, as importações registram só o nome e o horário do arquivo. |
| **Controle de Reposições** | Dias corridos entre o desligamento e a abertura da RQ, controle das requisições, quadro de vagas por supervisão e evolução diária. |
| **Relatórios Operacionais** | Interjornada (descanso < 11h), excedentes e sub-jornada a partir de login e logout, com filtros hierárquicos, reincidência e detalhe por colaborador. |
| **Cargas automáticas** | Ciclo em segundo plano que "extrai" os arquivos de origem, valida o layout, compara por hash, entrega só o que mudou, guarda pendências para a próxima rodada, abre circuito após falhas seguidas e atende extrações sob pedido. |

## Telas

| Hub de Governança | Gestão do Quadro |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/hub-dark.png"><img alt="Hub de Governança" src="docs/screenshots/hub-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/quadro-dark.png"><img alt="Gestão do Quadro, auditoria de hierarquia" src="docs/screenshots/quadro-light.png"></picture> |
| **Controle de Reposições** | **Relatórios Operacionais** |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/reposicoes-dark.png"><img alt="Controle de Reposições, abertura de RQ" src="docs/screenshots/reposicoes-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/relatorios-dark.png"><img alt="Relatórios Operacionais, interjornada" src="docs/screenshots/relatorios-light.png"></picture> |
| **Exo · Tarefas** | **Exo · Equipes** |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/exo-tarefas-dark.png"><img alt="Exo, tarefas com prazo e prioridade" src="docs/screenshots/exo-tarefas-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/exo-equipes-dark.png"><img alt="Exo, equipes por supervisão" src="docs/screenshots/exo-equipes-light.png"></picture> |

As imagens acompanham o tema do GitHub (claro ou escuro).

## Arquitetura

```mermaid
flowchart LR
    subgraph Origem sintética
        G[Gerador determinístico<br/>quadro, organizacional, RQs, ponto]
    end
    G --> B[(Base compartilhada<br/>em memória)]
    C[Cargas automáticas<br/>validação, hash, retentativa, circuito] -->|evolui e extrai| B
    C -.->|registra a entrega| Q & R & O
    B --> Q[Gestão do Quadro]
    B --> R[Controle de Reposições]
    B --> O[Relatórios Operacionais]
    B --> E[Exo]
    B --> A[API de hierarquia<br/>filtros em cascata]
    Q --- I[(Importações manuais<br/>em memória)]
    E --- S[(SQLite<br/>usuários, sessões, tarefas, casos,<br/>medidas, agenda, auditoria)]
    E -->|extração sob pedido| C
    H[Hub] --- L[(links.json)]
    H -->|status das cargas| C
    H -->|navegação e indicadores| Q & R & O & E
```

- **Backend:** FastAPI em um único processo, que também serve o frontend estático. Cada módulo é um `APIRouter` (`app/modulos/`). As regras de auditoria, calendário, jornada e reposição ficam em funções puras e testáveis (`app/dominio/`); os módulos montam as respostas da API e os campos derivados da demonstração.
- **Cargas:** a cada rodada, fazem a base evoluir, extraem os arquivos, validam o layout, comparam por hash e registram a entrega por destino. Os módulos leem a base diretamente e usam o registro para mostrar quando o arquivo foi recebido.
- **Persistência:** base sintética e importações manuais vivem em memória e recomeçam a cada reinício; os links do Hub ficam em `var/links.json` e os dados do Exo em `var/exo.db` (SQLite).
- **Frontend:** HTML, CSS e JavaScript (ES modules) **sem etapa de build**. Um design system próprio (`frontend/design-system/`) fornece tokens com tema claro e escuro, componentes (tabela com busca, ordenação, paginação e exportação CSV, filtros hierárquicos em cascata, KPIs, modais, avisos) e o wrapper de gráficos (Chart.js).
- **Exo:** senhas com PBKDF2-SHA256 e sal, sessão em cookie `HttpOnly`, bloqueio após tentativas seguidas, escopo de dados aplicado no SQL (o navegador esconde telas, mas quem protege o dado é o backend) e auditoria de toda alteração.

## Dados sintéticos

`app/dados/sinteticos.py` gera, a partir de uma semente:

- **Hierarquia:** 1 diretoria, 4 gerências, 12 coordenações, 48 supervisões e cerca de 530 agentes, distribuídos em 8 serviços e 3 sedes.
- **Quadro funcional** com cargo, turno, admissões, desligamentos dos últimos 120 dias (voluntários, involuntários, promoções e outras saídas), férias, afastamentos e trocas de supervisão.
- **Inconsistências propositais** para a auditoria encontrar: coordenação trocada, gerência vazia e supervisão divergente entre o quadro e o relatório de funcionários.
- **Jornada das reposições:** cada desligamento passa por Abertura RQ, Aprovação RH, Recrutamento e Remuneração até a admissão, com prazo de abertura de 7 dias (carência de 3), RQs congeladas e aumentos de quadro.
- **Login e logout** de 30 dias, com jornadas de 4h, 6h e 8h12, faltas, saídas antecipadas, horas extras e dobras que geram interjornada.

A cada rodada, as cargas automáticas fazem a base "andar": surgem desligamentos, RQs são abertas e avançam de status. As telas refletem isso sem recarregar o servidor.

## Como rodar

Requer Python 3.10 ou superior.

```bash
# Windows
iniciar.bat

# Linux / macOS
./iniciar.sh
```

Ou manualmente:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt   # no Windows: .venv\Scripts\pip
python -m app.main
```

Abra <http://127.0.0.1:8000>. A documentação interativa da API fica em `/docs`.

**Usuários do Exo** (senha `demo123`):

| Login | Papel | Enxerga |
|---|---|---|
| `admin` | Administrador | Tudo, incluindo monitoramento e auditoria |
| `gerente1` | Gestor | Gerente 1 e abaixo |
| `coordenador1` | Gestor | Coordenador 1 e abaixo |
| `supervisor1` | Gestor | Equipe do Supervisor 1 |

### Configuração

Por variáveis de ambiente, todas opcionais:

| Variável | Padrão | Uso |
|---|---|---|
| `ECOSSISTEMA_PORTA` | `8000` | Porta HTTP |
| `ECOSSISTEMA_HOST` | `127.0.0.1` | Interface de escuta |
| `ECOSSISTEMA_SEMENTE` | `42` | Semente dos dados sintéticos |
| `ECOSSISTEMA_INTERVALO_CARGAS` | `60` | Segundos entre rodadas das cargas automáticas |
| `ECOSSISTEMA_CARGAS_ATIVAS` | `1` | `0` desliga o ciclo em segundo plano |
| `ECOSSISTEMA_VAR` | `./var` | Pasta do SQLite e dos links do Hub |

Para recomeçar do zero, apague a pasta `var/`.

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```

Cobrem o gerador (determinismo, unicidade, coerência de datas), as regras de domínio (auditoria, dias úteis, SLA de abertura, jornada e interjornada, fechamento do quadro de vagas) e a API (filtros, autenticação, escopo e fluxo de tarefa). O GitHub Actions roda a suíte em Python 3.10 e 3.12.

## Estrutura

```
app/
  config.py            configuração por variáveis de ambiente
  main.py              aplicação FastAPI e ciclo de vida
  dados/               gerador sintético, base compartilhada e filtros
  dominio/             regras de negócio puras
  modulos/             rotas de cada aplicação (hub, exo, quadro, reposições, relatórios, cargas)
frontend/
  design-system/       tokens, componentes CSS e utilitários JS compartilhados
  hub/ exo/ quadro/ reposicoes/ relatorios/
tests/
docs/screenshots/      capturas das telas
```

## Autor

Projeto de portfólio. Contato pelo [LinkedIn](https://www.linkedin.com/in/jmartinsce).

## Licença

[MIT](LICENSE)
