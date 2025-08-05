#!/bin/bash

# Solana Trading CLI - Complete Deployment and Testing Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

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

# Make all scripts executable
make_scripts_executable() {
    print_status "Making scripts executable..."
    chmod +x scripts/*.sh
    chmod +x scripts/monitoring/*.sh 2>/dev/null || true
    print_success "Scripts are now executable"
}

# Main deployment workflow
main() {
    clear
    print_header "🚀 Solana Trading CLI - Complete Production Deployment"
    print_header "======================================================"
    echo ""
    
    print_status "This script will guide you through the complete deployment process:"
    echo "   1. 🔧 Configure environment and settings"
    echo "   2. 🚀 Deploy all services with Docker Compose"
    echo "   3. 🧪 Test all flows and components"
    echo "   4. 📊 Setup monitoring and alerting"
    echo "   5. 🚀 Apply scaling optimizations"
    echo ""
    
    read -p "Do you want to proceed with the complete deployment? [y/N]: " proceed
    
    if [[ ! $proceed =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
    
    make_scripts_executable
    
    echo ""
    print_header "🔧 Step 1: Configuration"
    print_header "========================"
    
    if [ ! -f .env ]; then
        print_status "Starting interactive configuration..."
        ./scripts/configure.sh
    else
        print_warning ".env file already exists"
        read -p "Do you want to reconfigure? [y/N]: " reconfig
        if [[ $reconfig =~ ^[Yy]$ ]]; then
            ./scripts/configure.sh
        fi
    fi
    
    echo ""
    print_header "🚀 Step 2: Deployment"
    print_header "====================="
    
    print_status "Starting deployment process..."
    ./scripts/deploy.sh
    
    echo ""
    print_header "🧪 Step 3: Testing"
    print_header "=================="
    
    print_status "Running comprehensive tests..."
    if ./scripts/test-flows.sh; then
        print_success "All tests passed!"
    else
        print_error "Some tests failed. Please check the logs."
        read -p "Do you want to continue anyway? [y/N]: " continue_anyway
        if [[ ! $continue_anyway =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    echo ""
    print_header "📊 Step 4: Monitoring Setup"
    print_header "==========================="
    
    read -p "Do you want to setup monitoring and alerting? [Y/n]: " setup_monitoring
    if [[ ! $setup_monitoring =~ ^[Nn]$ ]]; then
        ./scripts/setup-monitoring.sh
    fi
    
    echo ""
    print_header "🚀 Step 5: Scaling and Optimization"
    print_header "==================================="
    
    read -p "Do you want to apply scaling optimizations? [Y/n]: " apply_scaling
    if [[ ! $apply_scaling =~ ^[Nn]$ ]]; then
        ./scripts/scale.sh
    fi
    
    echo ""
    print_header "🎉 Deployment Complete!"
    print_header "======================="
    
    echo ""
    print_success "Your Solana Trading CLI is now fully deployed and ready for production!"
    echo ""
    
    print_status "📊 Access Points:"
    echo "   🎛️  Kestra UI: http://localhost:8080"
    echo "   📈 Grafana: http://localhost:3000 (admin/admin)"
    echo "   🔍 Prometheus: http://localhost:9090"
    echo "   🚨 Alertmanager: http://localhost:9093"
    echo ""
    
    print_status "🔧 Quick Commands:"
    echo "   Health Check: ./scripts/monitoring/health-check.sh"
    echo "   Test Flows: ./scripts/test-flows.sh"
    echo "   View Logs: docker-compose -f docker-compose.kestra.yml logs -f"
    echo "   Scale System: ./scripts/scale.sh"
    echo ""
    
    print_status "💡 Example Trade Execution:"
    echo '   curl -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \'
    echo '     -H "Content-Type: application/json" \'
    echo '     -d '"'"'{'
    echo '       "inputs": {'
    echo '         "inputMint": "So11111111111111111111111111111111111111112",'
    echo '         "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",'
    echo '         "amount": "1000000",'
    echo '         "dryRun": true'
    echo '       }'
    echo '     }'"'"
    echo ""
    
    print_warning "⚠️  Important Security Reminders:"
    echo "   - Always use dry-run mode for initial testing"
    echo "   - Keep wallet funds minimal for testing"
    echo "   - Monitor all transactions carefully"
    echo "   - Set up proper alerts and notifications"
    echo "   - Regularly backup your configuration"
    echo ""
    
    print_status "📚 Documentation:"
    echo "   - Architecture: docs/UNIFIED-ARCHITECTURE.md"
    echo "   - Production Guide: README-PRODUCTION.md"
    echo "   - API Reference: Available in Kestra UI"
    echo ""
    
    print_success "Happy trading! 🎯"
}

# Run main function
main "$@"
