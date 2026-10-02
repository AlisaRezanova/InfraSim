"""Ачивки, XP и уровни игрока. Условия проверяются по статистике прохождения, которую присылает клиент."""

from .levels import LEVELS

XP_FIRST_PASS = 100
XP_PER_STAR = 50
XP_ACHIEVEMENT = 100

ACHIEVEMENTS = [
    dict(code="first_win", title="Первый успех", desc="Пройдите любой уровень кампании."),
    dict(code="perfectionist", title="Перфекционист", desc="Получите три звезды на любом уровне."),
    dict(code="this_is_fine", title="Всё нормально", desc="Продержите компонент выше 90% загрузки целую минуту, не уронив сервис."),
    dict(code="overengineered", title="Переусложнил", desc="Тратьте от $300/ч, обслуживая меньше 200 запросов/с, хотя бы 20 секунд."),
    dict(code="finops_wizard", title="Волшебник FinOps", desc="Пройдите уровень, уложившись в 60% от лимита стоимости."),
    dict(code="crash_test", title="Краш-тест", desc="Пройдите уровень, где ломаются сервер или база."),
    dict(code="survivor", title="Выживший", desc="Продержитесь в режиме «Выживание» не меньше 2 минут."),
    dict(code="regular", title="Постоянство", desc="Играйте три дня подряд."),
]


def xp_to_reach(level: int) -> int:
    """Суммарный XP, с которого начинается уровень level (1 -> 0, 2 -> 150, 3 -> 450 …)."""
    return 75 * level * (level - 1)


def level_for(xp: int) -> dict:
    level = 1
    while xp >= xp_to_reach(level + 1):
        level += 1
    base = xp_to_reach(level)
    return dict(level=level, level_xp=xp - base, level_need=xp_to_reach(level + 1) - base)


def earned(result: dict, streak: int) -> set[str]:
    """Коды ачивок, условия которых выполнены этим прохождением."""
    got = set()
    mode, passed = result["mode"], result["passed"]
    if mode == "level" and passed:
        got.add("first_win")
        if result["stars"] >= 3:
            got.add("perfectionist")
        goal = LEVELS[result["level_idx"]]["goal"]
        if result["avg_cost"] <= goal["cost"] * 0.6:
            got.add("finops_wizard")
        if any(e["type"] == "crash" for e in LEVELS[result["level_idx"]]["events"]):
            got.add("crash_test")
    if (passed or mode == "survival") and result["hot_best"] >= 60:
        got.add("this_is_fine")
    if result["over_best"] >= 20:
        got.add("overengineered")
    if mode == "survival" and result["secs"] >= 120:
        got.add("survivor")
    if streak >= 3:
        got.add("regular")
    return got
