.PHONY: dev up down logs restart clean

# Порт бэкенда на хосте (только для `make dev`). Если занят: make dev BACKEND_PORT=9001
BACKEND_PORT ?= 8001
export BACKEND_PORT

DEV = docker compose -f docker-compose.yml -f docker-compose.dev.yml

# Разработка: БД и бэкенд в Docker, фронтенд через Vite с горячей перезагрузкой → http://localhost:5173
dev:
	$(DEV) up -d --build --wait db backend
	cd frontend && { [ -d node_modules ] || npm install; } && npm run dev

# Всё в Docker, как для пользователя (фронтенд собран и отдаётся nginx) → http://localhost:8080
up:
	docker compose up -d --build
	@echo "InfraSim: http://localhost:8080"

# Остановить все контейнеры (Vite останавливается по Ctrl+C)
down:
	$(DEV) down

logs:
	$(DEV) logs -f

restart:
	$(DEV) restart

# Остановить и удалить данные базы (прогресс и рейтинг)
clean:
	$(DEV) down -v
