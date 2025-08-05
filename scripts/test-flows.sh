#!/bin/bash

# Solana Trading CLI - Flow Testing Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test E2E Integration Flow
test_e2e_integration() {
    print_status "Testing E2E Integration Flow..."
    
    local execution_id=$(curl -s -X POST http://localhost:8080/api/v1/executions/solana.testing/e2e-integration \
        -H "Content-Type: application/json" \
        -d '{
            "inputs": {
                "duration": "PT2M",
                "dryRun": true,
                "testTokenInput": "So11111111111111111111111111111111111111112",
                "testTokenOutput": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            }
        }' | jq -r '.id')
    
    if [ "$execution_id" = "null" ] || [ -z "$execution_id" ]; then
        print_error "Failed to start E2E integration test"
        return 1
    fi
    
    print_status "E2E Integration started with ID: $execution_id"
    
    # Wait for completion (max 5 minutes)
    for i in {1..30}; do
        local status=$(curl -s http://localhost:8080/api/v1/executions/$execution_id | jq -r '.state.current')
        
        case $status in
            "SUCCESS")
                print_success "E2E Integration test completed successfully"
                return 0
                ;;
            "FAILED"|"KILLED")
                print_error "E2E Integration test failed with status: $status"
                return 1
                ;;
            "RUNNING"|"CREATED")
                print_status "E2E Integration test running... ($i/30)"
                sleep 10
                ;;
            *)
                print_warning "Unknown status: $status"
                sleep 10
                ;;
        esac
    done
    
    print_error "E2E Integration test timed out"
    return 1
}

# Test Production Trade Flow (Dry Run)
test_production_trade() {
    print_status "Testing Production Trade Flow (Dry Run)..."
    
    local execution_id=$(curl -s -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
        -H "Content-Type: application/json" \
        -d '{
            "inputs": {
                "inputMint": "So11111111111111111111111111111111111111112",
                "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                "amount": "1000000",
                "slippageBps": 50,
                "executionMode": "simple",
                "dryRun": true,
                "enableParallelQuotes": true
            }
        }' | jq -r '.id')
    
    if [ "$execution_id" = "null" ] || [ -z "$execution_id" ]; then
        print_error "Failed to start production trade test"
        return 1
    fi
    
    print_status "Production trade started with ID: $execution_id"
    
    # Wait for completion (max 3 minutes)
    for i in {1..18}; do
        local status=$(curl -s http://localhost:8080/api/v1/executions/$execution_id | jq -r '.state.current')
        
        case $status in
            "SUCCESS")
                print_success "Production trade test completed successfully"
                
                # Get execution details
                local execution_details=$(curl -s http://localhost:8080/api/v1/executions/$execution_id)
                local quotes_count=$(echo "$execution_details" | jq -r '.taskRunList[] | select(.taskId == "get-multi-dex-quotes") | .outputs.quotes_count // "N/A"')
                local best_dex=$(echo "$execution_details" | jq -r '.taskRunList[] | select(.taskId == "get-multi-dex-quotes") | .outputs.best_dex // "N/A"')
                
                print_status "Trade details: $quotes_count quotes received, best DEX: $best_dex"
                return 0
                ;;
            "FAILED"|"KILLED")
                print_error "Production trade test failed with status: $status"
                return 1
                ;;
            "RUNNING"|"CREATED")
                print_status "Production trade test running... ($i/18)"
                sleep 10
                ;;
            *)
                print_warning "Unknown status: $status"
                sleep 10
                ;;
        esac
    done
    
    print_error "Production trade test timed out"
    return 1
}

# Test Production Stream Flow
test_production_stream() {
    print_status "Testing Production Stream Flow..."
    
    local execution_id=$(curl -s -X POST http://localhost:8080/api/v1/executions/solana.streaming/production-stream \
        -H "Content-Type: application/json" \
        -d '{
            "inputs": {
                "duration": "PT2M",
                "programs": ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
                "enableAccountFiltering": true,
                "enableTransactionFiltering": true,
                "minLiquidityThreshold": 1000000
            }
        }' | jq -r '.id')
    
    if [ "$execution_id" = "null" ] || [ -z "$execution_id" ]; then
        print_error "Failed to start production stream test"
        return 1
    fi
    
    print_status "Production stream started with ID: $execution_id"
    
    # Wait for completion (max 4 minutes)
    for i in {1..24}; do
        local status=$(curl -s http://localhost:8080/api/v1/executions/$execution_id | jq -r '.state.current')
        
        case $status in
            "SUCCESS")
                print_success "Production stream test completed successfully"
                return 0
                ;;
            "FAILED"|"KILLED")
                print_error "Production stream test failed with status: $status"
                return 1
                ;;
            "RUNNING"|"CREATED")
                print_status "Production stream test running... ($i/24)"
                sleep 10
                ;;
            *)
                print_warning "Unknown status: $status"
                sleep 10
                ;;
        esac
    done
    
    print_error "Production stream test timed out"
    return 1
}

# Test Health Endpoints
test_health_endpoints() {
    print_status "Testing health endpoints..."
    
    # Test Kestra health
    if curl -f http://localhost:8080/health &> /dev/null; then
        print_success "Kestra health endpoint OK"
    else
        print_error "Kestra health endpoint failed"
        return 1
    fi
    
    # Test executor health
    source .env
    if ./exec-rs/target/release/exec-rs ping --rpc-url "${RPC_URL:-https://api.mainnet-beta.solana.com}" --timeout 10 &> /dev/null; then
        print_success "Executor health check OK"
    else
        print_error "Executor health check failed"
        return 1
    fi
    
    # Test database connectivity
    if docker-compose -f docker-compose.kestra.yml exec -T postgres pg_isready -U kestra &> /dev/null; then
        print_success "Database connectivity OK"
    else
        print_error "Database connectivity failed"
        return 1
    fi
}

# Test API Endpoints
test_api_endpoints() {
    print_status "Testing API endpoints..."
    
    # Test flows endpoint
    local flows_count=$(curl -s http://localhost:8080/api/v1/flows | jq -r '.total')
    if [ "$flows_count" -gt 0 ]; then
        print_success "Flows API OK ($flows_count flows found)"
    else
        print_error "Flows API failed or no flows found"
        return 1
    fi
    
    # Test executions endpoint
    if curl -f http://localhost:8080/api/v1/executions &> /dev/null; then
        print_success "Executions API OK"
    else
        print_error "Executions API failed"
        return 1
    fi
}

# Performance Test
performance_test() {
    print_status "Running performance test..."
    
    # Test multiple concurrent quote requests
    local start_time=$(date +%s)
    
    for i in {1..3}; do
        curl -s -X POST http://localhost:8080/api/v1/executions/solana.trading/production-trade \
            -H "Content-Type: application/json" \
            -d '{
                "inputs": {
                    "inputMint": "So11111111111111111111111111111111111111112",
                    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    "amount": "1000000",
                    "dryRun": true
                }
            }' &
    done
    
    wait
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_success "Performance test completed in ${duration}s"
}

# Main test function
main() {
    echo "🧪 Solana Trading CLI - Flow Testing"
    echo "===================================="
    
    # Check if Kestra is running
    if ! curl -f http://localhost:8080/health &> /dev/null; then
        print_error "Kestra is not running. Please run ./scripts/deploy.sh first"
        exit 1
    fi
    
    local tests_passed=0
    local tests_total=0
    
    # Run tests
    echo ""
    print_status "Starting comprehensive flow tests..."
    echo ""
    
    # Health tests
    ((tests_total++))
    if test_health_endpoints; then
        ((tests_passed++))
    fi
    
    # API tests
    ((tests_total++))
    if test_api_endpoints; then
        ((tests_passed++))
    fi
    
    # Flow tests
    ((tests_total++))
    if test_production_trade; then
        ((tests_passed++))
    fi
    
    ((tests_total++))
    if test_production_stream; then
        ((tests_passed++))
    fi
    
    ((tests_total++))
    if test_e2e_integration; then
        ((tests_passed++))
    fi
    
    # Performance test
    ((tests_total++))
    if performance_test; then
        ((tests_passed++))
    fi
    
    # Results
    echo ""
    echo "📊 Test Results:"
    echo "================"
    echo "   Passed: $tests_passed/$tests_total"
    
    if [ $tests_passed -eq $tests_total ]; then
        print_success "All tests passed! 🎉"
        echo ""
        echo "✅ Your Solana Trading CLI is ready for production!"
        echo ""
        echo "🔧 Next steps:"
        echo "   1. Configure monitoring: ./scripts/setup-monitoring.sh"
        echo "   2. Set up alerts and dashboards"
        echo "   3. Run with real trades (remove dryRun: true)"
        echo ""
        exit 0
    else
        print_error "Some tests failed. Please check the logs and fix issues."
        echo ""
        echo "🔍 Debugging tips:"
        echo "   - Check Kestra logs: docker-compose -f docker-compose.kestra.yml logs -f kestra"
        echo "   - Check executor: ./exec-rs/target/release/exec-rs ping --rpc-url \$RPC_URL"
        echo "   - Verify .env configuration"
        echo ""
        exit 1
    fi
}

# Run main function
main "$@"
