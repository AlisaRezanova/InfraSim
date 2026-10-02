"""Пресеты нагрузки для песочницы. Клиент получает их через GET /api/workloads."""

WORKLOADS = [
    dict(id="static", name="Статический сайт", story="Почти всё — кэшируемая статика. Основную работу делает CDN.",
         rps=900, ratio=0.98, stateful=False, region="один регион", events=[]),
    dict(id="rest", name="REST API", story="Обычный JSON API с преобладанием чтений и реляционной БД за ним.",
         rps=1200, ratio=0.9, stateful=True, region="один регион", events=[]),
    dict(id="feed", name="Социальная лента", story="Чтений очень много, рабочий набор данных большой, а вовлечённость идёт всплесками.",
         rps=2600, ratio=0.97, stateful=True, region="весь континент",
         events=[{"type": "spike", "from": 20, "to": 32, "mult": 2.5},
                 {"type": "spike", "from": 70, "to": 80, "mult": 3}]),
    dict(id="upload", name="Загрузка файлов", story="Много записей и фоновая обработка после каждой загрузки.",
         rps=420, ratio=0.4, stateful=True, region="один регион",
         events=[{"type": "writes", "from": 30, "to": 45, "ratio": 0.15}]),
    dict(id="shop", name="Интернет-магазин", story="Каталог читают часто, а оформление заказов — это записи, которые нельзя терять.",
         rps=1100, ratio=0.7, stateful=True, region="один регион",
         events=[{"type": "spike", "from": 25, "to": 40, "mult": 2}]),
]
