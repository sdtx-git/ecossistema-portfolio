from datetime import date, timedelta


def dias_uteis(inicio: date, fim: date) -> int:
    if fim <= inicio:
        return 0
    dias = 0
    dia = inicio
    while dia < fim:
        dia += timedelta(days=1)
        if dia.weekday() < 5:
            dias += 1
    return dias


def inicio_da_semana(dia: date) -> date:
    return dia - timedelta(days=dia.weekday())
