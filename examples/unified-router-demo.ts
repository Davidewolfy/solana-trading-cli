import { 
  createRouter, 
  DEXType, 
  TradeSide, 
  DEFAULT_ROUTER_CONFIG,
  ExecutionMethod 
} from '../src/router';
import { 
  createJupiterAdapter, 
  createRaydiumAdapter, 
  createOrcaAdapter, 
  createMeteoraAdapter 
} from '../src/router/adapters';
import { wallet } from '../src/helpers/config';

/**
 * Unified Router Demo
 * 
 * This example demonstrates how to use the unified router to:
 * 1. Trade across multiple DEXs with a single interface
 * 2. Compare prices from all DEXs
 * 3. Automatically select the best DEX for trades
 * 4. Handle different execution methods
 */

async function main() {
  console.log('🚀 Unified Router Demo Starting...\n');

  // Example token address (POPCAT)
  const tokenAddress = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

  // Create router with configuration
  const router = createRouter({
    ...DEFAULT_ROUTER_CONFIG,
    wallet,
    defaultDEX: DEXType.JUPITER,
    defaultSlippage: 1,
    autoSelectBestDEX: false, // We'll demonstrate manual and auto selection
    maxSlippage: 5
  });

  // Register all DEX adapters
  console.log('📝 Registering DEX adapters...');
  router.registerAdapter(createJupiterAdapter());
  router.registerAdapter(createRaydiumAdapter());
  router.registerAdapter(createOrcaAdapter());
  router.registerAdapter(createMeteoraAdapter());
  console.log('✅ All adapters registered\n');

  // Demo 1: Get price quotes from all DEXs
  console.log('📊 Demo 1: Getting price quotes from all DEXs');
  console.log('=' .repeat(50));
  
  try {
    const quotes = await router.getAllQuotes({
      tokenAddress,
      side: TradeSide.BUY,
      amount: 0.1 // 0.1 SOL
    });

    console.log('Price quotes for buying with 0.1 SOL:');
    quotes.forEach(quote => {
      console.log(`${quote.dex.toUpperCase()}: ${quote.outputAmount.toFixed(6)} tokens (${quote.isValid ? '✅' : '❌'})`);
    });

    const bestQuote = quotes.find(q => q.isValid);
    if (bestQuote) {
      console.log(`\n🎯 Best quote: ${bestQuote.dex.toUpperCase()} with ${bestQuote.outputAmount.toFixed(6)} tokens`);
    }
  } catch (error) {
    console.error('❌ Error getting quotes:', error);
  }

  console.log('\n');

  // Demo 2: Manual DEX selection for buy trade
  console.log('💰 Demo 2: Manual DEX selection (Jupiter buy)');
  console.log('=' .repeat(50));

  try {
    const buyResult = await router.trade({
      tokenAddress,
      side: TradeSide.BUY,
      solAmount: 0.01, // Small amount for demo
      slippage: 1,
      dex: DEXType.JUPITER,
      executionMethod: ExecutionMethod.SIMPLE
    });

    if (buyResult.success) {
      console.log('✅ Buy trade executed successfully!');
      console.log(`📝 Signature: ${buyResult.signature}`);
      console.log(`🏪 DEX used: ${buyResult.dexUsed}`);
      console.log(`⚡ Execution method: ${buyResult.executionMethodUsed}`);
      console.log(`📊 Slippage: ${buyResult.slippageUsed}%`);
    } else {
      console.log('❌ Buy trade failed:', buyResult.error);
    }
  } catch (error) {
    console.error('❌ Error executing buy trade:', error);
  }

  console.log('\n');

  // Demo 3: Auto DEX selection for sell trade
  console.log('💸 Demo 3: Auto DEX selection (sell 25%)');
  console.log('=' .repeat(50));

  // Enable auto selection for this trade
  const autoRouter = createRouter({
    ...DEFAULT_ROUTER_CONFIG,
    wallet,
    defaultDEX: DEXType.JUPITER,
    defaultSlippage: 1,
    autoSelectBestDEX: true,
    maxSlippage: 5
  });

  // Register adapters for auto router
  autoRouter.registerAdapter(createJupiterAdapter());
  autoRouter.registerAdapter(createRaydiumAdapter());
  autoRouter.registerAdapter(createOrcaAdapter());
  autoRouter.registerAdapter(createMeteoraAdapter());

  try {
    const sellResult = await autoRouter.trade({
      tokenAddress,
      side: TradeSide.SELL,
      sellPercentage: 25, // Sell 25% of holdings
      slippage: 1,
      executionMethod: ExecutionMethod.JITO
    });

    if (sellResult.success) {
      console.log('✅ Sell trade executed successfully!');
      console.log(`📝 Signature: ${sellResult.signature}`);
      console.log(`🏪 DEX used: ${sellResult.dexUsed} (auto-selected)`);
      console.log(`⚡ Execution method: ${sellResult.executionMethodUsed}`);
      console.log(`📊 Slippage: ${sellResult.slippageUsed}%`);
    } else {
      console.log('❌ Sell trade failed:', sellResult.error);
    }
  } catch (error) {
    console.error('❌ Error executing sell trade:', error);
  }

  console.log('\n');

  // Demo 4: Compare execution methods
  console.log('⚡ Demo 4: Different execution methods');
  console.log('=' .repeat(50));

  const executionMethods = [
    ExecutionMethod.SIMPLE,
    ExecutionMethod.JITO,
    ExecutionMethod.BLOXROUTE
  ];

  for (const method of executionMethods) {
    console.log(`\nTesting ${method} execution method:`);
    
    try {
      const result = await router.trade({
        tokenAddress,
        side: TradeSide.BUY,
        solAmount: 0.005, // Very small amount for demo
        slippage: 2,
        dex: DEXType.JUPITER,
        executionMethod: method
      });

      if (result.success) {
        console.log(`✅ ${method}: Success - ${result.signature}`);
      } else {
        console.log(`❌ ${method}: Failed - ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ ${method}: Error - ${error}`);
    }
  }

  console.log('\n');

  // Demo 5: Error handling and validation
  console.log('🛡️ Demo 5: Error handling and validation');
  console.log('=' .repeat(50));

  // Test invalid parameters
  const invalidTests = [
    {
      name: 'Missing token address',
      params: { tokenAddress: '', side: TradeSide.BUY, solAmount: 0.1 }
    },
    {
      name: 'Invalid slippage',
      params: { tokenAddress, side: TradeSide.BUY, solAmount: 0.1, slippage: 150 }
    },
    {
      name: 'Missing sell parameters',
      params: { tokenAddress, side: TradeSide.SELL }
    }
  ];

  for (const test of invalidTests) {
    console.log(`\nTesting: ${test.name}`);
    try {
      const result = await router.trade(test.params as any);
      console.log(`❌ Expected error but got: ${result.success ? 'success' : result.error}`);
    } catch (error) {
      console.log(`✅ Correctly caught error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\n🎉 Unified Router Demo Completed!');
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

export { main as runUnifiedRouterDemo };
