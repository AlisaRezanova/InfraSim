"""Определения уровней кампании. Клиент получает их через GET /api/levels."""

# Компоненты открываются по ходу кампании.
BASIC = ["lb", "app", "db"]
CACHING = BASIC + ["cache", "redis", "replica"]
ASYNC = CACHING + ["queue", "worker", "kafka", "nosql"]
ALL = ["lb", "cdn", "app", "lambda", "cache", "redis", "db", "replica", "nosql", "queue", "kafka", "worker"]

LEVELS = [
    dict(name="Первый сервер", story="Стартап запустился. Подключите пользователей к серверу.",
         dur=30, rps=150, ratio=0.8, stateful=False, allowed=["app"],
         goal=dict(err=0.01, lat=60, cost=20), events=[]),
    dict(name="Толпа", story="Пришла толпа. Один сервер не справится, а вход у пользователей только один — нужен балансировщик.",
         dur=40, rps=1800, ratio=0.8, stateful=False, allowed=["lb", "app"],
         goal=dict(err=0.01, lat=60, cost=100), events=[]),
    dict(name="Данные", story="Теперь нужно хранить данные. Сервер без БД не может обслужить запрос. Запись в БД тяжелее чтения.",
         dur=40, rps=1000, ratio=0.8, stateful=True, allowed=BASIC,
         goal=dict(err=0.01, lat=70, cost=260), events=[]),
    dict(name="Кэш", story="90% запросов — чтения одних и тех же данных. Пользователям нужны ответы быстрее 35 мс. Попробуйте кэш или Redis, а для чтений — реплики БД.",
         dur=45, rps=4000, ratio=0.9, stateful=True, allowed=CACHING,
         goal=dict(err=0.01, lat=35, cost=420), events=[]),
    dict(name="Очередь", story="Иногда прилетает шквал записей. БД такого не выдержит — принимайте записи в очередь и разбирайте воркерами.",
         dur=50, rps=1500, ratio=0.8, stateful=True, allowed=ASYNC,
         goal=dict(err=0.02, lat=40, cost=380),
         events=[{"type": "writes", "from": 15, "to": 27, "ratio": 0.3}]),
    dict(name="Отказ", story="Железо ломается. Сервер и база упадут посреди работы. Не держите всё на одной машине.",
         dur=60, rps=3000, ratio=0.85, stateful=True, allowed=ASYNC,
         goal=dict(err=0.03, lat=40, cost=450),
         events=[{"type": "crash", "target": "app", "from": 15, "to": 30},
                 {"type": "crash", "target": "db", "from": 38, "to": 50}]),
    dict(name="Весь мир", story="Аудитория выросла в десять раз, и почти всё — статика и чтения. Дешевле всего разгрузить серверы CDN-ом.",
         dur=45, rps=8000, ratio=0.95, stateful=True, allowed=ALL,
         goal=dict(err=0.02, lat=30, cost=380), events=[]),
    dict(name="Чёрная пятница", story="Трафик утроится на 15 секунд. Платите за мощность, только когда она нужна — схему можно менять на ходу.",
         dur=60, rps=2000, ratio=0.9, stateful=True, allowed=ALL,
         goal=dict(err=0.03, lat=40, cost=540),
         events=[{"type": "spike", "from": 15, "to": 32, "mult": 3}]),
    dict(name="Полный набор", story="Всё сразу: пик, шквал записей и два отказа.",
         dur=75, rps=5000, ratio=0.85, stateful=True, allowed=ALL,
         goal=dict(err=0.03, lat=40, cost=750),
         events=[{"type": "spike", "from": 12, "to": 24, "mult": 2},
                 {"type": "crash", "target": "app", "from": 30, "to": 42},
                 {"type": "writes", "from": 45, "to": 57, "ratio": 0.4},
                 {"type": "crash", "target": "db", "from": 62, "to": 72}]),
]
