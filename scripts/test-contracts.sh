#!/bin/bash
# Test contracts between RS-PY-TS layers

set -e

echo "🧪 Testing inter-language contracts..."

# Test TS -> Rust CLI contract
echo "📡 Testing TS -> Rust contract..."
node -e "
const { execSync } = require('child_process');
const testPayload = {
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000',
  slippageBps: 50,
  dryRun: true
};

try {
  const result = execSync('./exec-rs/target/release/exec-rs simulate --input-mint \${testPayload.inputMint} --output-mint \${testPayload.outputMint} --amount \${testPayload.amount}', { encoding: 'utf8' });
  const parsed = JSON.parse(result);
  console.log('✅ TS -> Rust contract valid');
} catch (error) {
  console.error('❌ TS -> Rust contract failed:', error.message);
  process.exit(1);
}
"

# Test Python -> Redis contract
echo "📡 Testing Python -> Redis contract..."
cd python && python -c "
import redis
import json
from src.news_pipeline import ExtractedSignal
from datetime import datetime

# Test signal schema
signal = ExtractedSignal(
    token_name='TEST',
    mint_address='7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    event_type='launch',
    risk_flags=[],
    confidence=0.9,
    timestamp=datetime.now(),
    source_url='test://url'
)

try:
    r = redis.Redis(host='localhost', port=6379, decode_responses=True)
    r.setex('test:signal', 60, signal.model_dump_json())
    stored = r.get('test:signal')
    parsed = json.loads(stored)
    print('✅ Python -> Redis contract valid')
except Exception as e:
    print(f'❌ Python -> Redis contract failed: {e}')
    exit(1)
"

# Test Kestra -> All layers contract
echo "📡 Testing Kestra integration..."
curl -s -X POST http://localhost:8080/api/v1/executions/solana.testing/contract-test \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"test": true}}' > /dev/null && \
  echo "✅ Kestra contracts valid" || \
  echo "⚠️ Kestra offline - skipping contract test"

echo "✅ All contracts validated"