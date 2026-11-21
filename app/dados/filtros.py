from datetime import date, timedelta

CAMPOS_HIERARQUIA = ("diretoria", "servico", "gerente", "coordenador", "supervisor", "cargo", "sede")


def lista_parametro(valor: str | None) -> list:
    return [v.strip() for v in (valor or "").split(",") if v.strip()]


def filtros_hierarquia(diretoria: str = "", servico: str = "", gerente: str = "", coordenador: str = "",
                       supervisor: str = "", cargo: str = "", sede: str = "") -> dict:
    return {
        "diretoria": lista_parametro(diretoria),
        "servico": lista_parametro(servico),
        "gerente": lista_parametro(gerente),
        "coordenador": lista_parametro(coordenador),
        "supervisor": lista_parametro(supervisor),
        "cargo": lista_parametro(cargo),
        "sede": lista_parametro(sede),
    }


def aplicar(linhas: list, filtros: dict) -> list:
    ativos = {campo: set(valores) for campo, valores in filtros.items() if valores}
    if not ativos:
        return list(linhas)
    return [l for l in linhas if all(l.get(campo) in valores for campo, valores in ativos.items())]


def periodo(de: date | None, ate: date | None, hoje: date, dias_padrao: int) -> tuple:
    fim = ate or hoje
    inicio = de or (fim - timedelta(days=dias_padrao))
    if inicio > fim:
        inicio, fim = fim, inicio
    return inicio, fim


def dentro(valor_iso: str | None, inicio: date, fim: date) -> bool:
    if not valor_iso:
        return False
    return inicio.isoformat() <= valor_iso[:10] <= fim.isoformat()
