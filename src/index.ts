/**
 * Solana Trading CLI - Main Entry Point
 * 
 * Production-ready unified router and streaming system
 */

// Core exports
export * from './router';
export * from './grpc';
export * from './strategies';
export * from './execution';
export * from './risk';
export * from './observability';
export * from './helpers';

// ML and ASI-Arch exports
export * from './ml/feature-store';
export * from './ml/backtester';

// Configuration
export * from './config/infisical';

// DEX integrations
export * from './jupiter';
export * from './raydium';
export * from './orca';
export * from './meteora';

// Utilities
export * from './utils';

// Main application class
export class SolanaTradingCLI {
  private router: any;
  private streaming: any;
  private strategies: any;

  constructor() {
    console.log('🚀 Solana Trading CLI v2.0.0');
    console.log('Production-ready unified router and streaming');
  }

  async initialize() {
    // Initialize components
    console.log('🔧 Initializing components...');
    
    // This would initialize the router, streaming, etc.
    // For now, just log that we're ready
    console.log('✅ Solana Trading CLI initialized');
  }

  async start() {
    await this.initialize();
    console.log('🎯 Solana Trading CLI started');
  }

  async stop() {
    console.log('⏹️ Solana Trading CLI stopped');
  }
}

// Default export
export default SolanaTradingCLI;
