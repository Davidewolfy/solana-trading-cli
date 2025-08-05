#!/bin/bash

# Solana Trading CLI - Configuration Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CONFIG]${NC} $1"
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

# Interactive configuration
configure_environment() {
    print_status "Starting interactive configuration..."
    
    # Create .env from template if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env from template"
    fi
    
    echo ""
    echo "🔧 Solana Trading CLI Configuration"
    echo "=================================="
    echo ""
    
    # RPC Configuration
    echo "📡 RPC Configuration:"
    read -p "Enter Solana RPC URL [https://api.mainnet-beta.solana.com]: " rpc_url
    rpc_url=${rpc_url:-https://api.mainnet-beta.solana.com}
    sed -i "s|^RPC_URL=.*|RPC_URL=$rpc_url|" .env
    
    # Yellowstone gRPC
    echo ""
    echo "🌊 Yellowstone gRPC Configuration:"
    read -p "Enter Yellowstone gRPC endpoint [grpc.triton.one:443]: " yellowstone_endpoint
    yellowstone_endpoint=${yellowstone_endpoint:-grpc.triton.one:443}
    sed -i "s|^YELLOWSTONE_ENDPOINT=.*|YELLOWSTONE_ENDPOINT=$yellowstone_endpoint|" .env
    
    read -p "Enter Yellowstone token (optional): " yellowstone_token
    if [ ! -z "$yellowstone_token" ]; then
        sed -i "s|^# YELLOWSTONE_TOKEN=.*|YELLOWSTONE_TOKEN=$yellowstone_token|" .env
    fi
    
    # Performance Settings
    echo ""
    echo "⚡ Performance Configuration:"
    read -p "Max parallel quotes [4]: " max_parallel
    max_parallel=${max_parallel:-4}
    sed -i "s|^MAX_PARALLEL_QUOTES=.*|MAX_PARALLEL_QUOTES=$max_parallel|" .env
    
    read -p "Quote timeout (ms) [10000]: " quote_timeout
    quote_timeout=${quote_timeout:-10000}
    sed -i "s|^QUOTE_TIMEOUT_MS=.*|QUOTE_TIMEOUT_MS=$quote_timeout|" .env
    
    # Safety Settings
    echo ""
    echo "🛡️ Safety Configuration:"
    read -p "Max trade amount (lamports) [1000000000]: " max_trade
    max_trade=${max_trade:-1000000000}
    sed -i "s|^MAX_TRADE_AMOUNT=.*|MAX_TRADE_AMOUNT=$max_trade|" .env
    
    read -p "Max slippage (bps) [1000]: " max_slippage
    max_slippage=${max_slippage:-1000}
    sed -i "s|^MAX_SLIPPAGE_BPS=.*|MAX_SLIPPAGE_BPS=$max_slippage|" .env
    
    read -p "Require dry run for all trades? [y/N]: " require_dry_run
    if [[ $require_dry_run =~ ^[Yy]$ ]]; then
        sed -i "s|^REQUIRE_DRY_RUN=.*|REQUIRE_DRY_RUN=true|" .env
    else
        sed -i "s|^REQUIRE_DRY_RUN=.*|REQUIRE_DRY_RUN=false|" .env
    fi
    
    # Monitoring
    echo ""
    echo "📊 Monitoring Configuration:"
    read -p "Slack webhook URL (optional): " slack_webhook
    if [ ! -z "$slack_webhook" ]; then
        sed -i "s|^# SLACK_WEBHOOK=.*|SLACK_WEBHOOK=$slack_webhook|" .env
    fi
    
    read -p "Discord webhook URL (optional): " discord_webhook
    if [ ! -z "$discord_webhook" ]; then
        sed -i "s|^# DISCORD_WEBHOOK=.*|DISCORD_WEBHOOK=$discord_webhook|" .env
    fi
    
    print_success "Environment configuration completed"
}

# Validate configuration
validate_configuration() {
    print_status "Validating configuration..."
    
    source .env
    
    # Test RPC connectivity
    print_status "Testing RPC connectivity..."
    if curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "ok"; then
        print_success "RPC connectivity OK"
    else
        print_error "RPC connectivity failed"
        return 1
    fi
    
    # Test Yellowstone connectivity (basic)
    print_status "Testing Yellowstone gRPC connectivity..."
    if timeout 5 bash -c "</dev/tcp/${YELLOWSTONE_ENDPOINT%:*}/${YELLOWSTONE_ENDPOINT#*:}" 2>/dev/null; then
        print_success "Yellowstone gRPC endpoint reachable"
    else
        print_warning "Yellowstone gRPC endpoint not reachable (may require authentication)"
    fi
    
    # Validate safety limits
    if [ "$MAX_TRADE_AMOUNT" -gt 10000000000 ]; then
        print_warning "Max trade amount is very high (>10 SOL). Consider lowering for safety."
    fi
    
    if [ "$MAX_SLIPPAGE_BPS" -gt 1000 ]; then
        print_warning "Max slippage is very high (>10%). Consider lowering for safety."
    fi
    
    print_success "Configuration validation completed"
}

# Setup wallet
setup_wallet() {
    print_status "Setting up wallet configuration..."
    
    mkdir -p secrets
    
    if [ ! -f secrets/wallet.json ]; then
        echo ""
        echo "💰 Wallet Setup:"
        echo "==============="
        echo ""
        echo "You need to provide a wallet keypair for trading."
        echo "IMPORTANT: Use a dedicated trading wallet with limited funds!"
        echo ""
        echo "Options:"
        echo "1. Copy existing wallet file to secrets/wallet.json"
        echo "2. Generate new wallet with Solana CLI"
        echo ""
        
        read -p "Do you want to generate a new wallet? [y/N]: " generate_wallet
        
        if [[ $generate_wallet =~ ^[Yy]$ ]]; then
            if command -v solana &> /dev/null; then
                solana-keygen new --outfile secrets/wallet.json --no-bip39-passphrase
                print_success "New wallet generated at secrets/wallet.json"
                
                # Show public key
                local pubkey=$(solana-keygen pubkey secrets/wallet.json)
                print_status "Wallet public key: $pubkey"
                print_warning "Please fund this wallet with a small amount for testing"
            else
                print_error "Solana CLI not found. Please install it or manually copy wallet file."
                return 1
            fi
        else
            print_warning "Please manually copy your wallet file to secrets/wallet.json"
            return 1
        fi
    else
        print_success "Wallet file already exists at secrets/wallet.json"
    fi
    
    # Set proper permissions
    chmod 600 secrets/wallet.json
    chmod 755 secrets
    
    print_success "Wallet setup completed"
}

# Generate monitoring configuration
setup_monitoring() {
    print_status "Setting up monitoring configuration..."
    
    mkdir -p monitoring/prometheus
    mkdir -p monitoring/grafana/dashboards
    mkdir -p monitoring/grafana/datasources
    
    # Prometheus configuration
    cat > monitoring/prometheus/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'kestra'
    static_configs:
      - targets: ['kestra:8080']
    metrics_path: '/prometheus'
    
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
EOF

    # Grafana datasource
    cat > monitoring/grafana/datasources/prometheus.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

    print_success "Monitoring configuration created"
}

# Create systemd service (optional)
create_systemd_service() {
    if [ "$EUID" -eq 0 ]; then
        print_status "Creating systemd service..."
        
        cat > /etc/systemd/system/solana-trading-cli.service << EOF
[Unit]
Description=Solana Trading CLI
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose -f docker-compose.kestra.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.kestra.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable solana-trading-cli.service
        
        print_success "Systemd service created and enabled"
    else
        print_warning "Run as root to create systemd service"
    fi
}

# Main configuration function
main() {
    echo "🔧 Solana Trading CLI - Configuration Setup"
    echo "==========================================="
    
    configure_environment
    validate_configuration
    setup_wallet
    setup_monitoring
    
    echo ""
    echo "✅ Configuration completed successfully!"
    echo ""
    echo "📋 Configuration Summary:"
    echo "========================"
    source .env
    echo "   RPC URL: $RPC_URL"
    echo "   Yellowstone: $YELLOWSTONE_ENDPOINT"
    echo "   Max Trade: $MAX_TRADE_AMOUNT lamports"
    echo "   Max Slippage: $MAX_SLIPPAGE_BPS bps"
    echo "   Require Dry Run: $REQUIRE_DRY_RUN"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Review .env file and adjust if needed"
    echo "   2. Fund your wallet: $(solana-keygen pubkey secrets/wallet.json 2>/dev/null || echo 'secrets/wallet.json')"
    echo "   3. Run deployment: ./scripts/deploy.sh"
    echo "   4. Test flows: ./scripts/test-flows.sh"
    echo ""
    
    read -p "Do you want to create a systemd service? [y/N]: " create_service
    if [[ $create_service =~ ^[Yy]$ ]]; then
        create_systemd_service
    fi
}

# Run main function
main "$@"
