# Production Runbook - Solana Trading CLI

This runbook provides step-by-step procedures for common operational scenarios and troubleshooting.

## 🚨 Emergency Procedures

### Kill Switch Activation

**When to use**: System is behaving unexpectedly, large losses detected, or security breach suspected.

```bash
# Immediate kill switch activation
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/emergency-stop \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"reason": "manual_emergency_stop"}}'

# Or via direct API if available
curl -X POST http://localhost:3000/api/kill-switch \
  -H "Content-Type: application/json" \
  -d '{"reason": "emergency", "message": "Manual activation"}'
```

**Verification**:
```bash
# Check kill switch status
curl http://localhost:3000/api/status | jq '.risk.killSwitchActive'
```

### System Health Check

```bash
# Quick health check
curl http://localhost:3000/health

# Detailed system status
curl http://localhost:3000/api/status | jq '.'

# Check specific components
curl http://localhost:3000/api/status | jq '.health.checks'
```

## 📊 Monitoring & Alerts

### Key Metrics to Monitor

1. **Trading Performance**
   - Success rate: > 95%
   - P95 latency: < 2000ms
   - Slippage: < 2%

2. **System Health**
   - Memory usage: < 80%
   - Event loop lag: < 100ms
   - RPC response time: < 1000ms

3. **Risk Metrics**
   - Daily PnL vs limits
   - Position concentration
   - Drawdown percentage

### Alert Thresholds

```yaml
Critical Alerts:
  - Kill switch activated
  - RPC connection down > 30s
  - Memory usage > 90%
  - Trade success rate < 90%

Warning Alerts:
  - High slippage > 3%
  - Circuit breaker opened
  - Queue size > 100
  - Event loop lag > 50ms
```

## 🔧 Common Issues & Solutions

### "Blockhash not found" Error

**Symptoms**: Transactions failing with blockhash errors
**Cause**: Using stale blockhashes or network congestion

**Solution**:
```bash
# Check current slot vs transaction slot
curl -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}'

# Restart with fresh blockhash
npm run restart:trading
```

### "Simulation failed" Error

**Symptoms**: Pre-flight simulation failures
**Cause**: Insufficient balance, invalid routes, or slippage

**Solution**:
```bash
# Check account balances
npm run check:balances

# Validate token routes
npm run validate:token -- 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr

# Increase slippage tolerance temporarily
curl -X POST http://localhost:8080/api/v1/executions/solana.trading/solana-trading-flow \
  -d '{"inputs": {"slippage": 3.0}}'
```

### "Account in use" Error

**Symptoms**: Concurrent transaction conflicts
**Cause**: Multiple transactions using same account simultaneously

**Solution**:
```bash
# Check queue status
curl http://localhost:3000/api/queue/status

# Clear stuck transactions
curl -X POST http://localhost:3000/api/queue/clear

# Restart account manager
npm run restart:accounts
```

### High Memory Usage

**Symptoms**: Memory usage > 80%, slow performance
**Cause**: Memory leaks, large data buffers, or insufficient cleanup

**Solution**:
```bash
# Force garbage collection
kill -USR2 $(pgrep -f "node.*trading")

# Check memory breakdown
npm run debug:memory

# Restart if necessary
npm run restart:graceful
```

### Circuit Breaker Opened

**Symptoms**: "Circuit breaker is OPEN" errors
**Cause**: High failure rate for external services

**Solution**:
```bash
# Check circuit breaker status
curl http://localhost:3000/api/circuit-breakers

# Force close if service recovered
curl -X POST http://localhost:3000/api/circuit-breakers/jupiter/close

# Wait for automatic recovery (default: 30s)
```

## 🔄 Operational Procedures

### Daily Startup Checklist

1. **Pre-startup Checks**
   ```bash
   # Check system resources
   free -h
   df -h
   
   # Verify network connectivity
   ping -c 3 api.mainnet-beta.solana.com
   
   # Check Redis connection
   redis-cli ping
   ```

2. **Start Services**
   ```bash
   # Start in order
   docker-compose up -d redis
   docker-compose up -d kestra
   npm run start:trading
   ```

3. **Post-startup Verification**
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Test trade (dry run)
   npm run test:trade -- --dry-run
   ```

### Daily Shutdown Checklist

1. **Pre-shutdown**
   ```bash
   # Check for pending trades
   curl http://localhost:3000/api/queue/status
   
   # Activate kill switch
   curl -X POST http://localhost:3000/api/kill-switch
   ```

2. **Graceful Shutdown**
   ```bash
   # Stop trading
   npm run stop:trading
   
   # Stop supporting services
   docker-compose down
   ```

3. **Backup & Cleanup**
   ```bash
   # Backup logs
   tar -czf logs-$(date +%Y%m%d).tar.gz logs/
   
   # Cleanup old files
   find logs/ -name "*.log" -mtime +7 -delete
   ```

### Key Rotation Procedure

**Frequency**: Weekly for trading keys, monthly for master keys

```bash
# List current keys
npm run keys:list

# Rotate trading key
npm run keys:rotate -- trading-key-1

# Verify new key
npm run keys:verify -- trading-key-1

# Update configuration
npm run config:update-keys
```

### Performance Tuning

**When**: P95 latency > 2000ms or success rate < 95%

1. **Identify Bottlenecks**
   ```bash
   # Check metrics
   curl http://localhost:3000/api/metrics | jq '.trading'
   
   # Profile performance
   npm run profile:trading
   ```

2. **Optimization Steps**
   ```bash
   # Increase concurrency
   export MAX_CONCURRENT_TRADES=5
   
   # Tune RPC endpoints
   export RPC_POOL_SIZE=10
   
   # Optimize slippage
   export DEFAULT_SLIPPAGE=1.5
   ```

## 📋 Maintenance Tasks

### Weekly Tasks

- [ ] Review trading performance metrics
- [ ] Rotate trading keys
- [ ] Update token denylist
- [ ] Check disk space and cleanup logs
- [ ] Verify backup integrity

### Monthly Tasks

- [ ] Rotate master keys
- [ ] Update dependencies
- [ ] Review and update risk limits
- [ ] Performance optimization review
- [ ] Security audit

### Quarterly Tasks

- [ ] Full system backup
- [ ] Disaster recovery test
- [ ] Security penetration test
- [ ] Performance benchmark
- [ ] Documentation update

## 🔍 Debugging Commands

### Log Analysis

```bash
# Real-time logs
tail -f logs/trading.log | jq '.'

# Error analysis
grep -i error logs/trading.log | jq '.timestamp, .message, .error'

# Performance analysis
grep "trade_execution" logs/trading.log | jq '.duration' | sort -n
```

### Database Queries

```bash
# Redis debugging
redis-cli monitor

# Check cached data
redis-cli keys "aggregator:*" | head -10
redis-cli get "aggregator:price:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"
```

### Network Debugging

```bash
# Check RPC latency
curl -w "@curl-format.txt" -s -o /dev/null https://api.mainnet-beta.solana.com

# Test gRPC connection
grpcurl -plaintext grpc.triton.one:443 list

# Check DEX APIs
curl -w "%{time_total}" https://quote-api.jup.ag/v6/health
```

## 📞 Escalation Procedures

### Level 1: Automated Recovery
- Circuit breakers
- Automatic retries
- Health check failures

### Level 2: Manual Intervention
- Kill switch activation
- Service restarts
- Configuration changes

### Level 3: Emergency Response
- System-wide failures
- Security incidents
- Data corruption

### Contact Information

```
Primary On-Call: [Your contact]
Secondary On-Call: [Backup contact]
Security Team: [Security contact]
Infrastructure Team: [Infra contact]
```

## 📚 Additional Resources

- [System Architecture](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Configuration Guide](./CONFIG.md)
- [Security Guidelines](./SECURITY.md)
- [Performance Tuning](./PERFORMANCE.md)
