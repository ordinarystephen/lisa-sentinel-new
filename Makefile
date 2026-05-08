.PHONY: install build run dev test lint format clean check-env \
	frontend-install frontend-dev frontend-build frontend-lint frontend-test

# Combined targets — run install / build / test across both stacks.

install:
	pip install -r requirements.txt
	cd frontend && npm install

build:
	cd frontend && npm run build

run:
	@if [ ! -f frontend/dist/index.html ]; then \
		echo "Frontend build not found. Run 'make build' first to create frontend/dist/."; \
		echo "Continuing with the placeholder shell..."; \
	fi
	python run.py

dev:
	@echo "Two-terminal dev: 'make run' here for Flask on 5000;"
	@echo "in another terminal, 'make frontend-dev' for Vite on 5173."
	FLASK_DEBUG=1 FLASK_RUN_PORT=5000 python run.py

test:
	pytest tests/ -v

lint:
	ruff check app/ tests/

format:
	black app/ tests/
	ruff check --fix app/ tests/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf frontend/dist

check-env:
	python scripts/check_environment.py

# Frontend-specific targets.

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-lint:
	cd frontend && npm run lint

frontend-test:
	cd frontend && npm run test
