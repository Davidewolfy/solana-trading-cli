#!/bin/bash

# Solana Trading CLI - Production Deployment Script
set -e

echo "🚀 Starting Solana Trading CLI deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check Rust/Cargo
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo is not installed"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Setup environment
setup_environment() {
    print_status "Setting up environment..."
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        print_warning ".env file not found, copying from .env.example"
        cp .env.example .env
        print_warning "Please edit .env file with your configuration before continuing"
        read -p "Press Enter after editing .env file..."
    fi
    
    # Create secrets directory
    mkdir -p secrets
    mkdir -p logs
    
    # Check wallet file
    if [ ! -f secrets/wallet.json ]; then
        print_error "Wallet file not found at secrets/wallet.json"
        print_warning "Please add your wallet keypair to secrets/wallet.json"
        print_warning "IMPORTANT: Use a dedicated trading wallet with limited funds"
        exit 1
    fi
    
    # Set proper permissions
    chmod 600 secrets/wallet.json
    chmod 755 secrets
    
    print_success "Environment setup completed"
}

# Build components
build_components() {
    print_status "Building components..."
    
    # Install Node.js dependencies
    print_status "Installing Node.js dependencies..."
    npm ci
    
    # Build TypeScript
    print_status "Building TypeScript..."
    npm run build
    
    # Build Rust executor
    print_status "Building Rust executor..."
    cd exec-rs
    cargo build --release
    cd ..
    
    # Verify executor
    if [ ! -f exec-rs/target/release/exec-rs ]; then
        print_error "Rust executor build failed"
        exit 1
    fi
    
    print_success "All components built successfully"
}

# Test executor
test_executor() {
    print_status "Testing Rust executor..."
    
    # Load environment variables
    source .env
    
    # Test ping command
    print_status "Testing executor ping..."
    if ./exec-rs/target/release/exec-rs ping --rpc-url "${RPC_URL:-https://api.mainnet-beta.solana.com}" --timeout 10; then
        print_success "Executor ping test passed"
    else
        print_error "Executor ping test failed"
        exit 1
    fi
}

# Start services
start_services() {
    print_status "Starting Docker services..."
    
    # Stop any existing services
    docker-compose -f docker-compose.kestra.yml down
    
    # Start services
    docker-compose -f docker-compose.kestra.yml up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 30
    
    # Check service health
    print_status "Checking service health..."
    
    # Check PostgreSQL
    if docker-compose -f docker-compose.kestra.yml exec postgres pg_isready -U kestra; then
        print_success "PostgreSQL is ready"
    else
        print_error "PostgreSQL is not ready"
        exit 1
    fi
    
    # Check Kestra
    for i in {1..30}; do
        if curl -f http://localhost:8080/health &> /dev/null; then
            print_success "Kestra is ready"
            break
        fi
        
        if [ $i -eq 30 ]; then
            print_error "Kestra failed to start"
            exit 1
        fi
        
        print_status "Waiting for Kestra... ($i/30)"
        sleep 10
    done
}

# Deploy flows
deploy_flows() {
    print_status "Deploying Kestra flows..."
    
    # Wait a bit more for Kestra to be fully ready
    sleep 10
    
    # Deploy production trade flow
    if curl -X POST http://localhost:8080/api/v1/flows \
        -H "Content-Type: application/yaml" \
        --data-binary @kestra/flows/production-trade.yml; then
        print_success "Production trade flow deployed"
    else
        print_warning "Failed to deploy production trade flow (may already exist)"
    fi
    
    # Deploy production stream flow
    if curl -X POST http://localhost:8080/api/v1/flows \
        -H "Content-Type: application/yaml" \
        --data-binary @kestra/flows/production-stream.yml; then
        print_success "Production stream flow deployed"
    else
        print_warning "Failed to deploy production stream flow (may already exist)"
    fi
    
    # Deploy E2E integration flow
    if curl -X POST http://localhost:8080/api/v1/flows \
        -H "Content-Type: application/yaml" \
        --data-binary @kestra/flows/e2e-integration.yml; then
        print_success "E2E integration flow deployed"
    else
        print_warning "Failed to deploy E2E integration flow (may already exist)"
    fi
}

# Run health checks
run_health_checks() {
    print_status "Running comprehensive health checks..."
    
    # Test executor again
    print_status "Testing executor connectivity..."
    source .env
    ./exec-rs/target/release/exec-rs ping --rpc-url "${RPC_URL:-https://api.mainnet-beta.solana.com}" --timeout 10
    
    # Test Node.js components
    print_status "Testing Node.js components..."
    node -e "
        const { createUnifiedRouter } = require('./dist/router');
        const router = createUnifiedRouter();
        console.log('✅ Unified router created successfully');
    "
    
    # Test Kestra API
    print_status "Testing Kestra API..."
    curl -f http://localhost:8080/api/v1/flows | jq '.total' > /dev/null
    
    print_success "All health checks passed"
}

# Main deployment function
main() {
    echo "🎯 Solana Trading CLI - Production Deployment"
    echo "=============================================="
    
    check_prerequisites
    setup_environment
    build_components
    test_executor
    start_services
    deploy_flows
    run_health_checks
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📊 Access points:"
    echo "   Kestra UI: http://localhost:8080"
    echo "   PostgreSQL: localhost:5432"
    echo "   Redis: localhost:6379"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Open Kestra UI and verify flows are loaded"
    echo "   2. Run test execution: ./scripts/test-flows.sh"
    echo "   3. Monitor logs: docker-compose -f docker-compose.kestra.yml logs -f"
    echo ""
    echo "⚠️  Remember to:"
    echo "   - Use dry-run mode for initial testing"
    echo "   - Monitor all executions carefully"
    echo "   - Keep wallet funds minimal for testing"
}

# Run main function
main "$@"
