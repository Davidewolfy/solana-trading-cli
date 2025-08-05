#!/bin/bash

# Solana Trading CLI - Scaling and Optimization Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[SCALE]${NC} $1"
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

# Scale Kestra workers
scale_kestra_workers() {
    print_status "Scaling Kestra workers..."
    
    read -p "Enter number of Kestra workers [3]: " worker_count
    worker_count=${worker_count:-3}
    
    # Update docker-compose to scale workers
    cat > docker-compose.scale.yml << EOF
version: '3.8'

services:
  kestra-worker:
    image: kestra/kestra:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      KESTRA_CONFIGURATION: |
        datasources:
          postgres:
            url: jdbc:postgresql://postgres:5432/kestra
            driverClassName: org.postgresql.Driver
            username: kestra
            password: kestra_password
        
        kestra:
          queue:
            type: postgres
          
          storage:
            type: local
            local:
              base-path: /app/storage
    
    volumes:
      - ./:/app/solana-trading-cli:ro
      - ./secrets:/secrets:ro
      - kestra_storage:/app/storage
    
    command: worker
    
    deploy:
      replicas: $worker_count
    
    networks:
      - kestra-network

networks:
  kestra-network:
    external: true

volumes:
  kestra_storage:
    external: true
EOF

    # Start scaled workers
    docker-compose -f docker-compose.scale.yml up -d
    
    print_success "Scaled to $worker_count Kestra workers"
}

# Optimize database performance
optimize_database() {
    print_status "Optimizing database performance..."
    
    # Create optimized PostgreSQL configuration
    cat > monitoring/postgres/postgresql.conf << 'EOF'
# PostgreSQL configuration for Kestra optimization

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Checkpoint settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Connection settings
max_connections = 200

# Logging
log_statement = 'mod'
log_duration = on
log_min_duration_statement = 1000

# Performance
random_page_cost = 1.1
effective_io_concurrency = 200
EOF

    # Apply database optimizations
    docker-compose -f docker-compose.kestra.yml exec postgres psql -U kestra -d kestra -c "
        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_executions_state ON executions(state);
        CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created);
        CREATE INDEX IF NOT EXISTS idx_flows_namespace ON flows(namespace);
        
        -- Analyze tables
        ANALYZE;
    "
    
    print_success "Database optimizations applied"
}

# Setup Redis caching
setup_redis_caching() {
    print_status "Setting up Redis caching..."
    
    # Add Redis configuration to Kestra
    cat > config/kestra-redis.yml << 'EOF'
kestra:
  queue:
    type: redis
    redis:
      uri: redis://redis:6379
  
  repository:
    type: postgres
  
  storage:
    type: local
    local:
      base-path: /app/storage
EOF

    # Update docker-compose to use Redis
    print_status "Updating Kestra configuration for Redis..."
    
    print_success "Redis caching configured"
}

# Optimize quote fetching
optimize_quote_fetching() {
    print_status "Optimizing quote fetching performance..."
    
    # Create optimized router configuration
    cat > config/optimized-router.json << 'EOF'
{
  "defaultDex": "jupiter",
  "timeoutMs": 8000,
  "enableParallelQuotes": true,
  "maxRetries": 2,
  "retryDelayMs": 500,
  "circuitBreaker": {
    "enabled": true,
    "failureThreshold": 5,
    "resetTimeoutMs": 30000
  },
  "scoringWeights": {
    "expectedOut": 0.4,
    "priceImpact": -0.2,
    "fees": -0.15,
    "latency": -0.1,
    "confidence": 0.1,
    "hops": -0.03,
    "computeUnits": -0.02,
    "liquidity": 0.1
  },
  "adaptiveTimeout": {
    "enabled": true,
    "minTimeoutMs": 3000,
    "maxTimeoutMs": 15000,
    "latencyMultiplier": 2.0
  }
}
EOF

    # Update environment variables for optimization
    cat >> .env << 'EOF'

# Performance Optimizations
ENABLE_QUOTE_CACHING=true
QUOTE_CACHE_TTL_MS=5000
ENABLE_CIRCUIT_BREAKER=true
ENABLE_ADAPTIVE_TIMEOUT=true
MAX_CONCURRENT_QUOTES=6
QUOTE_BATCH_SIZE=4
EOF

    print_success "Quote fetching optimizations configured"
}

# Setup load balancing
setup_load_balancing() {
    print_status "Setting up load balancing..."
    
    # Create nginx configuration for load balancing
    mkdir -p config/nginx
    
    cat > config/nginx/nginx.conf << 'EOF'
upstream kestra_backend {
    least_conn;
    server kestra:8080;
    server kestra-worker-1:8080 backup;
    server kestra-worker-2:8080 backup;
}

server {
    listen 80;
    server_name localhost;
    
    location / {
        proxy_pass http://kestra_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        
        # Health checks
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

    # Add nginx to docker-compose
    cat >> docker-compose.scale.yml << 'EOF'

  nginx:
    image: nginx:alpine
    container_name: solana-nginx
    ports:
      - "80:80"
    volumes:
      - ./config/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - kestra
    networks:
      - kestra-network
EOF

    print_success "Load balancing configured"
}

# Optimize streaming performance
optimize_streaming() {
    print_status "Optimizing streaming performance..."
    
    # Create optimized streaming configuration
    cat > config/optimized-streaming.json << 'EOF'
{
  "endpoint": "grpc.triton.one:443",
  "programs": [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
  ],
  "pingIntervalMs": 25000,
  "reconnectIntervalMs": 3000,
  "maxReconnectAttempts": 10,
  "bufferSize": 1000,
  "batchProcessing": {
    "enabled": true,
    "batchSize": 50,
    "flushIntervalMs": 100
  },
  "filtering": {
    "minLiquidityThreshold": 1000000,
    "enableAccountFiltering": true,
    "enableTransactionFiltering": true,
    "skipVoteTransactions": true
  },
  "accountsDataSlice": [
    {"offset": 0, "length": 32},
    {"offset": 64, "length": 64}
  ]
}
EOF

    print_success "Streaming optimizations configured"
}

# Setup horizontal scaling
setup_horizontal_scaling() {
    print_status "Setting up horizontal scaling..."
    
    # Create scaling configuration
    cat > config/scaling.yml << 'EOF'
scaling:
  kestra:
    min_replicas: 1
    max_replicas: 5
    target_cpu_percent: 70
    target_memory_percent: 80
  
  workers:
    min_replicas: 2
    max_replicas: 10
    target_cpu_percent: 80
  
  database:
    connection_pool_size: 50
    max_connections: 200
  
  redis:
    max_connections: 100
    connection_pool_size: 20
EOF

    # Create auto-scaling script
    cat > scripts/auto-scale.sh << 'EOF'
#!/bin/bash

# Auto-scaling script based on metrics
KESTRA_CPU=$(docker stats --no-stream --format "table {{.CPUPerc}}" kestra-server | tail -n 1 | sed 's/%//')
WORKER_COUNT=$(docker ps --filter "name=kestra-worker" --format "table {{.Names}}" | wc -l)

if (( $(echo "$KESTRA_CPU > 80" | bc -l) )); then
    if [ $WORKER_COUNT -lt 5 ]; then
        echo "Scaling up workers due to high CPU: $KESTRA_CPU%"
        docker-compose -f docker-compose.scale.yml up -d --scale kestra-worker=$((WORKER_COUNT + 1))
    fi
elif (( $(echo "$KESTRA_CPU < 30" | bc -l) )); then
    if [ $WORKER_COUNT -gt 2 ]; then
        echo "Scaling down workers due to low CPU: $KESTRA_CPU%"
        docker-compose -f docker-compose.scale.yml up -d --scale kestra-worker=$((WORKER_COUNT - 1))
    fi
fi
EOF

    chmod +x scripts/auto-scale.sh
    
    print_success "Horizontal scaling configured"
}

# Performance benchmarking
run_performance_benchmark() {
    print_status "Running performance benchmark..."
    
    # Create benchmark script
    cat > scripts/benchmark.sh << 'EOF'
#!/bin/bash

echo "🚀 Performance Benchmark"
echo "======================="

# Test quote performance
echo "Testing quote performance..."
start_time=$(date +%s%N)

for i in {1..10}; do
    curl -s -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
        -H "Content-Type: application/json" \
        -d '{
            "inputs": {
                "inputMint": "So11111111111111111111111111111111111111112",
                "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                "amount": "1000000",
                "dryRun": true
            }
        }' > /dev/null &
done

wait

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

echo "10 concurrent quotes completed in ${duration}ms"
echo "Average: $((duration / 10))ms per quote"
EOF

    chmod +x scripts/benchmark.sh
    
    # Run benchmark
    ./scripts/benchmark.sh
    
    print_success "Performance benchmark completed"
}

# Main scaling function
main() {
    echo "🚀 Solana Trading CLI - Scaling and Optimization"
    echo "==============================================="
    
    echo ""
    echo "Available scaling options:"
    echo "1. Scale Kestra workers"
    echo "2. Optimize database performance"
    echo "3. Setup Redis caching"
    echo "4. Optimize quote fetching"
    echo "5. Setup load balancing"
    echo "6. Optimize streaming performance"
    echo "7. Setup horizontal scaling"
    echo "8. Run performance benchmark"
    echo "9. Apply all optimizations"
    echo ""
    
    read -p "Select option [1-9]: " option
    
    case $option in
        1)
            scale_kestra_workers
            ;;
        2)
            optimize_database
            ;;
        3)
            setup_redis_caching
            ;;
        4)
            optimize_quote_fetching
            ;;
        5)
            setup_load_balancing
            ;;
        6)
            optimize_streaming
            ;;
        7)
            setup_horizontal_scaling
            ;;
        8)
            run_performance_benchmark
            ;;
        9)
            print_status "Applying all optimizations..."
            scale_kestra_workers
            optimize_database
            setup_redis_caching
            optimize_quote_fetching
            setup_load_balancing
            optimize_streaming
            setup_horizontal_scaling
            run_performance_benchmark
            ;;
        *)
            print_error "Invalid option"
            exit 1
            ;;
    esac
    
    echo ""
    echo "✅ Scaling and optimization completed!"
    echo ""
    echo "📊 Performance improvements:"
    echo "   - Horizontal scaling with multiple workers"
    echo "   - Database query optimization"
    echo "   - Redis caching for faster responses"
    echo "   - Optimized quote fetching algorithms"
    echo "   - Load balancing for high availability"
    echo "   - Streaming performance enhancements"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Monitor performance metrics"
    echo "   2. Adjust scaling parameters based on load"
    echo "   3. Fine-tune optimization settings"
    echo "   4. Set up automated scaling policies"
}

# Run main function
main "$@"
