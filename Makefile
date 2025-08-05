# Solana Trading CLI - Production Makefile

.PHONY: help install build deploy test monitor scale clean status logs

# Default target
help: ## Show this help message
	@echo "🚀 Solana Trading CLI - Production Commands"
	@echo "==========================================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "📚 Quick Start:"
	@echo "   make install    # Install dependencies and build"
	@echo "   make configure  # Interactive configuration"
	@echo "   make deploy     # Deploy all services"
	@echo "   make test       # Run comprehensive tests"
	@echo "   make monitor    # Setup monitoring"
	@echo ""

# Installation and Setup
install: ## Install dependencies and build all components
	@echo "📦 Installing dependencies and building components..."
	npm ci
	npm run build
	cd exec-rs && cargo build --release
	chmod +x scripts/*.sh
	@echo "✅ Installation completed"

configure: ## Interactive configuration setup
	@echo "🔧 Starting configuration..."
	./scripts/configure.sh

build: ## Build TypeScript and Rust components
	@echo "🔨 Building components..."
	npm run build
	cd exec-rs && cargo build --release
	@echo "✅ Build completed"

# Deployment
deploy: ## Deploy all services with Docker Compose
	@echo "🚀 Deploying services..."
	./scripts/deploy.sh

deploy-quick: ## Quick deployment without full checks
	@echo "⚡ Quick deployment..."
	docker-compose -f docker-compose.kestra.yml up -d
	@echo "✅ Quick deployment completed"

# Testing
test: ## Run comprehensive flow tests
	@echo "🧪 Running tests..."
	./scripts/test-flows.sh

test-health: ## Run health checks only
	@echo "🏥 Running health checks..."
	./scripts/monitoring/health-check.sh

test-trade: ## Test production trade flow (dry run)
	@echo "💱 Testing trade flow..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"inputMint": "So11111111111111111111111111111111111111112", "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "1000000", "dryRun": true}}'

test-stream: ## Test production stream flow
	@echo "📡 Testing stream flow..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.streaming/production-stream \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"duration": "PT2M", "programs": ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"]}}'

test-strategies: ## Test trading strategies in shadow mode
	@echo "🎯 Testing trading strategies..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.strategies/strategy-shadow-mode \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"duration": "PT5M", "strategies": ["launch_momentum", "micro_breakout"]}}'

test-strategy-local: ## Test strategies locally with Node.js
	@echo "🧪 Running local strategy test..."
	npm run build
	node -e "require('./dist/examples/strategy-testing').runStrategyTest()"

test-secrets: ## Test Infisical secret loading
	@echo "🔐 Testing Infisical secrets..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.config/infisical-secrets \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"environment": "dev", "validateOnly": true}}'

secrets-reload: ## Reload secrets from Infisical
	@echo "🔄 Reloading secrets from Infisical..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.config/infisical-secrets \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"environment": "prod", "validateOnly": false}}'

# ML and ASI-Arch Commands
model-search: ## Run ASI-Arch model search
	@echo "🤖 Starting ASI-Arch model search..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.ml/model-search \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"symbol": "SOL-PERP", "lookback_days": 30, "search_budget_hours": 2.0}}'

model-search-extended: ## Extended model search with more architectures
	@echo "🔬 Starting extended model search..."
	curl -X POST http://localhost:8080/api/v1/executions/solana.ml/model-search \
		-H "Content-Type: application/json" \
		-d '{"inputs": {"symbol": "SOL-PERP", "lookback_days": 60, "search_budget_hours": 4.0, "architectures": ["linear_attention", "s4_like", "transformer_small", "lstm_baseline", "random_forest"]}}'

test-ml-local: ## Test ML components locally
	@echo "🧪 Testing ML components locally..."
	npm run build
	node -e "const { createFeatureStore } = require('./dist/ml/feature-store'); const fs = createFeatureStore(); console.log('✅ Feature store created');"

# GitHub Repository Management
setup-github: ## Setup GitHub repository with CI/CD
	@echo "🐙 Setting up GitHub repository..."
	chmod +x scripts/setup-github.sh
	./scripts/setup-github.sh

create-release: ## Create a new release (usage: make create-release VERSION=v1.0.0)
	@echo "🚀 Creating release $(VERSION)..."
	@if [ -z "$(VERSION)" ]; then echo "❌ VERSION is required. Usage: make create-release VERSION=v1.0.0"; exit 1; fi
	git tag -a $(VERSION) -m "Release $(VERSION)"
	git push origin $(VERSION)
	@echo "✅ Release $(VERSION) created and pushed"

# Monitoring
monitor: ## Setup monitoring and alerting
	@echo "📊 Setting up monitoring..."
	./scripts/setup-monitoring.sh

monitor-start: ## Start monitoring services
	@echo "📈 Starting monitoring services..."
	docker-compose -f docker-compose.monitoring.yml up -d

monitor-stop: ## Stop monitoring services
	@echo "📉 Stopping monitoring services..."
	docker-compose -f docker-compose.monitoring.yml down

# Scaling
scale: ## Apply scaling optimizations
	@echo "🚀 Applying scaling optimizations..."
	./scripts/scale.sh

scale-workers: ## Scale Kestra workers
	@echo "👥 Scaling workers..."
	@read -p "Enter number of workers [3]: " workers; \
	workers=$${workers:-3}; \
	docker-compose -f docker-compose.scale.yml up -d --scale kestra-worker=$$workers

# Management
start: ## Start all services
	@echo "▶️  Starting all services..."
	docker-compose -f docker-compose.kestra.yml up -d
	@if [ -f docker-compose.monitoring.yml ]; then \
		docker-compose -f docker-compose.monitoring.yml up -d; \
	fi

stop: ## Stop all services
	@echo "⏹️  Stopping all services..."
	docker-compose -f docker-compose.kestra.yml down
	@if [ -f docker-compose.monitoring.yml ]; then \
		docker-compose -f docker-compose.monitoring.yml down; \
	fi

restart: ## Restart all services
	@echo "🔄 Restarting all services..."
	$(MAKE) stop
	sleep 5
	$(MAKE) start

status: ## Show status of all services
	@echo "📊 Service Status:"
	@echo "=================="
	@docker-compose -f docker-compose.kestra.yml ps
	@echo ""
	@if [ -f docker-compose.monitoring.yml ]; then \
		echo "📈 Monitoring Services:"; \
		echo "======================"; \
		docker-compose -f docker-compose.monitoring.yml ps; \
		echo ""; \
	fi
	@echo "🔗 Access Points:"
	@echo "   Kestra UI: http://localhost:8080"
	@echo "   Grafana: http://localhost:3000"
	@echo "   Prometheus: http://localhost:9090"

# Logs
logs: ## Show logs from all services
	@echo "📋 Showing logs..."
	docker-compose -f docker-compose.kestra.yml logs -f

logs-kestra: ## Show Kestra logs only
	@echo "📋 Kestra logs..."
	docker-compose -f docker-compose.kestra.yml logs -f kestra

logs-postgres: ## Show PostgreSQL logs only
	@echo "📋 PostgreSQL logs..."
	docker-compose -f docker-compose.kestra.yml logs -f postgres

logs-monitoring: ## Show monitoring logs
	@echo "📋 Monitoring logs..."
	@if [ -f docker-compose.monitoring.yml ]; then \
		docker-compose -f docker-compose.monitoring.yml logs -f; \
	else \
		echo "Monitoring not deployed. Run 'make monitor' first."; \
	fi

# Maintenance
clean: ## Clean up containers, volumes, and images
	@echo "🧹 Cleaning up..."
	@read -p "This will remove all containers, volumes, and images. Continue? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker-compose -f docker-compose.kestra.yml down -v --remove-orphans; \
		if [ -f docker-compose.monitoring.yml ]; then \
			docker-compose -f docker-compose.monitoring.yml down -v --remove-orphans; \
		fi; \
		if [ -f docker-compose.scale.yml ]; then \
			docker-compose -f docker-compose.scale.yml down -v --remove-orphans; \
		fi; \
		docker system prune -f; \
		echo "✅ Cleanup completed"; \
	else \
		echo "Cleanup cancelled"; \
	fi

backup: ## Backup configuration and data
	@echo "💾 Creating backup..."
	@mkdir -p backups
	@timestamp=$$(date +%Y%m%d_%H%M%S); \
	backup_dir="backups/backup_$$timestamp"; \
	mkdir -p $$backup_dir; \
	cp -r .env secrets kestra monitoring $$backup_dir/ 2>/dev/null || true; \
	docker-compose -f docker-compose.kestra.yml exec postgres pg_dump -U kestra kestra > $$backup_dir/database.sql 2>/dev/null || true; \
	tar -czf $$backup_dir.tar.gz $$backup_dir; \
	rm -rf $$backup_dir; \
	echo "✅ Backup created: $$backup_dir.tar.gz"

restore: ## Restore from backup
	@echo "📥 Restoring from backup..."
	@ls -la backups/*.tar.gz 2>/dev/null || (echo "No backups found" && exit 1)
	@read -p "Enter backup file name: " backup_file; \
	if [ -f "$$backup_file" ]; then \
		tar -xzf $$backup_file; \
		backup_dir=$$(basename $$backup_file .tar.gz); \
		cp -r $$backup_dir/* .; \
		rm -rf $$backup_dir; \
		echo "✅ Restore completed"; \
	else \
		echo "Backup file not found"; \
	fi

# Development
dev: ## Start development environment
	@echo "🔧 Starting development environment..."
	npm run dev &
	$(MAKE) start

dev-stop: ## Stop development environment
	@echo "🛑 Stopping development environment..."
	pkill -f "npm run dev" || true
	$(MAKE) stop

# Complete workflows
all: ## Complete deployment workflow (configure -> deploy -> test -> monitor)
	@echo "🎯 Running complete deployment workflow..."
	./scripts/run-all.sh

quick-start: ## Quick start for development (install -> configure -> deploy)
	@echo "⚡ Quick start..."
	$(MAKE) install
	$(MAKE) configure
	$(MAKE) deploy

production: ## Production deployment (install -> deploy -> test -> monitor -> scale)
	@echo "🏭 Production deployment..."
	$(MAKE) install
	$(MAKE) deploy
	$(MAKE) test
	$(MAKE) monitor
	$(MAKE) scale

# Information
info: ## Show system information
	@echo "ℹ️  System Information:"
	@echo "======================"
	@echo "Docker version: $$(docker --version)"
	@echo "Docker Compose version: $$(docker-compose --version)"
	@echo "Node.js version: $$(node --version)"
	@echo "Rust version: $$(rustc --version)"
	@echo ""
	@echo "📁 Project structure:"
	@find . -maxdepth 2 -type d -name ".*" -prune -o -type d -print | head -20

version: ## Show version information
	@echo "📦 Solana Trading CLI v2.0.0"
	@echo "Production-ready unified router and streaming"
	@echo ""
	@echo "Components:"
	@echo "  - Unified Router (TypeScript)"
	@echo "  - gRPC Streaming (TypeScript)"
	@echo "  - Rust Executor"
	@echo "  - Kestra Orchestration"
	@echo "  - Monitoring Stack"

# Default target when no arguments provided
.DEFAULT_GOAL := help
