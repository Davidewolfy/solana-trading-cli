#!/bin/bash

# Solana Trading CLI - Monitoring Setup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[MONITOR]${NC} $1"
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

# Setup Grafana dashboards
setup_grafana_dashboards() {
    print_status "Setting up Grafana dashboards..."
    
    mkdir -p monitoring/grafana/dashboards
    
    # Solana Trading CLI Dashboard
    cat > monitoring/grafana/dashboards/solana-trading-dashboard.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Solana Trading CLI",
    "tags": ["solana", "trading", "defi"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Trade Success Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(kestra_execution_success_total[5m])",
            "legendFormat": "Success Rate"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "min": 0,
            "max": 100
          }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Quote Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(quote_duration_seconds_bucket[5m]))",
            "legendFormat": "P95 Latency"
          }
        ],
        "yAxes": [
          {
            "unit": "s",
            "min": 0
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      },
      {
        "id": 3,
        "title": "DEX Quote Distribution",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum by (dex) (rate(quotes_total[5m]))",
            "legendFormat": "{{dex}}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
      },
      {
        "id": 4,
        "title": "Streaming Events",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(streaming_events_total[1m])",
            "legendFormat": "Events/sec"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
EOF

    # System Metrics Dashboard
    cat > monitoring/grafana/dashboards/system-metrics.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "System Metrics",
    "tags": ["system", "infrastructure"],
    "panels": [
      {
        "id": 1,
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "100 - (avg by (instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "CPU Usage %"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
            "legendFormat": "Memory Usage %"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      },
      {
        "id": 3,
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends",
            "legendFormat": "Active Connections"
          }
        ],
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 8}
      }
    ]
  }
}
EOF

    print_success "Grafana dashboards created"
}

# Setup Prometheus alerts
setup_prometheus_alerts() {
    print_status "Setting up Prometheus alerts..."
    
    mkdir -p monitoring/prometheus/rules
    
    cat > monitoring/prometheus/rules/trading-alerts.yml << 'EOF'
groups:
  - name: solana-trading-alerts
    rules:
      - alert: HighTradeFailureRate
        expr: rate(kestra_execution_failed_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High trade failure rate detected"
          description: "Trade failure rate is {{ $value }} per second"
      
      - alert: HighQuoteLatency
        expr: histogram_quantile(0.95, rate(quote_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High quote latency detected"
          description: "P95 quote latency is {{ $value }} seconds"
      
      - alert: StreamingDisconnected
        expr: streaming_connected == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Streaming service disconnected"
          description: "Yellowstone gRPC streaming is disconnected"
      
      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database is down"
          description: "PostgreSQL database is not responding"
      
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} per second"
EOF

    print_success "Prometheus alerts configured"
}

# Setup Alertmanager
setup_alertmanager() {
    print_status "Setting up Alertmanager..."
    
    mkdir -p monitoring/alertmanager
    
    # Load environment variables
    source .env 2>/dev/null || true
    
    cat > monitoring/alertmanager/alertmanager.yml << EOF
global:
  smtp_smarthost: '${SMTP_HOST:-localhost:587}'
  smtp_from: '${SMTP_USER:-alerts@localhost}'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:5001/'
EOF

    # Add Slack configuration if webhook is provided
    if [ ! -z "$SLACK_WEBHOOK" ]; then
        cat >> monitoring/alertmanager/alertmanager.yml << EOF
  
  - name: 'slack'
    slack_configs:
      - api_url: '$SLACK_WEBHOOK'
        channel: '#trading-alerts'
        title: 'Solana Trading Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
EOF
    fi
    
    # Add Discord configuration if webhook is provided
    if [ ! -z "$DISCORD_WEBHOOK" ]; then
        cat >> monitoring/alertmanager/alertmanager.yml << EOF
  
  - name: 'discord'
    webhook_configs:
      - url: '$DISCORD_WEBHOOK'
        title: 'Solana Trading Alert'
        send_resolved: true
EOF
    fi
    
    print_success "Alertmanager configured"
}

# Create monitoring docker-compose
create_monitoring_compose() {
    print_status "Creating monitoring docker-compose..."
    
    cat > docker-compose.monitoring.yml << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: solana-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/prometheus/rules:/etc/prometheus/rules:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    networks:
      - kestra-network

  grafana:
    image: grafana/grafana:latest
    container_name: solana-grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - kestra-network

  alertmanager:
    image: prom/alertmanager:latest
    container_name: solana-alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=http://localhost:9093'
    networks:
      - kestra-network

  node-exporter:
    image: prom/node-exporter:latest
    container_name: solana-node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - kestra-network

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:

networks:
  kestra-network:
    external: true
EOF

    print_success "Monitoring docker-compose created"
}

# Setup log aggregation
setup_log_aggregation() {
    print_status "Setting up log aggregation..."
    
    mkdir -p monitoring/loki
    
    cat > monitoring/loki/loki.yml << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF

    print_success "Log aggregation configured"
}

# Create monitoring scripts
create_monitoring_scripts() {
    print_status "Creating monitoring scripts..."
    
    mkdir -p scripts/monitoring
    
    # Health check script
    cat > scripts/monitoring/health-check.sh << 'EOF'
#!/bin/bash

# Health check script for Solana Trading CLI
source .env

echo "🏥 Solana Trading CLI Health Check"
echo "================================="

# Check Kestra
if curl -f http://localhost:8080/health &> /dev/null; then
    echo "✅ Kestra: Healthy"
else
    echo "❌ Kestra: Unhealthy"
fi

# Check Database
if docker-compose -f docker-compose.kestra.yml exec -T postgres pg_isready -U kestra &> /dev/null; then
    echo "✅ Database: Healthy"
else
    echo "❌ Database: Unhealthy"
fi

# Check Executor
if ./exec-rs/target/release/exec-rs ping --rpc-url "$RPC_URL" --timeout 5 &> /dev/null; then
    echo "✅ Executor: Healthy"
else
    echo "❌ Executor: Unhealthy"
fi

# Check Prometheus (if running)
if curl -f http://localhost:9090/-/healthy &> /dev/null; then
    echo "✅ Prometheus: Healthy"
else
    echo "⚠️  Prometheus: Not running or unhealthy"
fi

# Check Grafana (if running)
if curl -f http://localhost:3000/api/health &> /dev/null; then
    echo "✅ Grafana: Healthy"
else
    echo "⚠️  Grafana: Not running or unhealthy"
fi
EOF

    chmod +x scripts/monitoring/health-check.sh
    
    # Alert test script
    cat > scripts/monitoring/test-alerts.sh << 'EOF'
#!/bin/bash

# Test alert script
echo "🚨 Testing alerts..."

# Send test alert to Alertmanager
curl -XPOST http://localhost:9093/api/v1/alerts -H "Content-Type: application/json" -d '[
  {
    "labels": {
      "alertname": "TestAlert",
      "severity": "warning"
    },
    "annotations": {
      "summary": "This is a test alert",
      "description": "Testing alert system"
    },
    "generatorURL": "http://localhost:9090/graph"
  }
]'

echo "Test alert sent to Alertmanager"
EOF

    chmod +x scripts/monitoring/test-alerts.sh
    
    print_success "Monitoring scripts created"
}

# Start monitoring services
start_monitoring() {
    print_status "Starting monitoring services..."
    
    # Start monitoring stack
    docker-compose -f docker-compose.monitoring.yml up -d
    
    # Wait for services to start
    sleep 30
    
    # Check if services are running
    if curl -f http://localhost:9090/-/healthy &> /dev/null; then
        print_success "Prometheus started successfully"
    else
        print_error "Prometheus failed to start"
    fi
    
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        print_success "Grafana started successfully"
    else
        print_error "Grafana failed to start"
    fi
    
    print_success "Monitoring services started"
}

# Main monitoring setup function
main() {
    echo "📊 Solana Trading CLI - Monitoring Setup"
    echo "========================================"
    
    setup_grafana_dashboards
    setup_prometheus_alerts
    setup_alertmanager
    create_monitoring_compose
    setup_log_aggregation
    create_monitoring_scripts
    
    echo ""
    read -p "Do you want to start monitoring services now? [y/N]: " start_now
    
    if [[ $start_now =~ ^[Yy]$ ]]; then
        start_monitoring
    fi
    
    echo ""
    echo "✅ Monitoring setup completed!"
    echo ""
    echo "📊 Access Points:"
    echo "   Prometheus: http://localhost:9090"
    echo "   Grafana: http://localhost:3000 (admin/admin)"
    echo "   Alertmanager: http://localhost:9093"
    echo ""
    echo "🔧 Next steps:"
    echo "   1. Import dashboards in Grafana"
    echo "   2. Configure notification channels"
    echo "   3. Test alerts: ./scripts/monitoring/test-alerts.sh"
    echo "   4. Run health checks: ./scripts/monitoring/health-check.sh"
    echo ""
    echo "📚 Documentation:"
    echo "   - Grafana: http://localhost:3000/dashboards"
    echo "   - Prometheus: http://localhost:9090/targets"
    echo "   - Alerts: http://localhost:9093/#/alerts"
}

# Run main function
main "$@"
EOF
