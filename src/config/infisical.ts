import { InfisicalSDK } from '@infisical/sdk';
import * as dotenv from 'dotenv';

/**
 * Infisical Secret Management Integration
 * 
 * Securely manages trading secrets and configuration
 */

export interface TradingSecrets {
  // RPC Configuration
  RPC_URL: string;
  DEVNET_RPC_URL: string;
  
  // Yellowstone gRPC
  YELLOWSTONE_ENDPOINT: string;
  YELLOWSTONE_TOKEN?: string;
  
  // Wallet Configuration
  WALLET_PRIVATE_KEY: string;
  DEVNET_WALLET_PRIVATE_KEY?: string;
  
  // API Keys
  JUPITER_API_KEY?: string;
  HELIUS_API_KEY?: string;
  QUICKNODE_API_KEY?: string;
  
  // Monitoring & Alerts
  SLACK_WEBHOOK?: string;
  DISCORD_WEBHOOK?: string;
  TELEGRAM_BOT_TOKEN?: string;
  
  // Database
  DATABASE_URL?: string;
  REDIS_URL?: string;
  
  // Trading Configuration
  MAX_TRADE_AMOUNT: string;
  MAX_SLIPPAGE_BPS: string;
  REQUIRE_DRY_RUN: string;
}

export class InfisicalSecretManager {
  private client: InfisicalSDK;
  private projectId: string;
  private environment: string;
  private secrets: TradingSecrets | null = null;

  constructor(
    clientId: string,
    clientSecret: string,
    projectId: string,
    environment: 'dev' | 'staging' | 'prod' = 'dev'
  ) {
    this.client = new InfisicalSDK({
      clientId,
      clientSecret,
    });
    
    this.projectId = projectId;
    this.environment = environment;
  }

  /**
   * Initialize and fetch all secrets
   */
  async initialize(): Promise<void> {
    try {
      console.log(`🔐 Initializing Infisical for environment: ${this.environment}`);
      
      const secrets = await this.client.listSecrets({
        projectId: this.projectId,
        environment: this.environment,
      });

      this.secrets = this.parseSecrets(secrets);
      
      console.log(`✅ Loaded ${Object.keys(this.secrets).length} secrets from Infisical`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Infisical:', error);
      throw error;
    }
  }

  /**
   * Get specific secret
   */
  async getSecret(key: keyof TradingSecrets): Promise<string | undefined> {
    if (!this.secrets) {
      await this.initialize();
    }
    
    return this.secrets?.[key];
  }

  /**
   * Get all secrets
   */
  getSecrets(): TradingSecrets | null {
    return this.secrets;
  }

  /**
   * Update a secret
   */
  async updateSecret(key: string, value: string): Promise<void> {
    try {
      await this.client.updateSecret({
        projectId: this.projectId,
        environment: this.environment,
        secretName: key,
        secretValue: value,
      });
      
      console.log(`✅ Updated secret: ${key}`);
      
      // Refresh local cache
      await this.initialize();
      
    } catch (error) {
      console.error(`❌ Failed to update secret ${key}:`, error);
      throw error;
    }
  }

  /**
   * Create a new secret
   */
  async createSecret(key: string, value: string, comment?: string): Promise<void> {
    try {
      await this.client.createSecret({
        projectId: this.projectId,
        environment: this.environment,
        secretName: key,
        secretValue: value,
        secretComment: comment,
      });
      
      console.log(`✅ Created secret: ${key}`);
      
      // Refresh local cache
      await this.initialize();
      
    } catch (error) {
      console.error(`❌ Failed to create secret ${key}:`, error);
      throw error;
    }
  }

  /**
   * Export secrets to environment variables
   */
  exportToEnv(): void {
    if (!this.secrets) {
      throw new Error('Secrets not loaded. Call initialize() first.');
    }

    Object.entries(this.secrets).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });

    console.log('✅ Exported secrets to environment variables');
  }

  /**
   * Validate required secrets
   */
  validateSecrets(): boolean {
    const required = [
      'RPC_URL',
      'YELLOWSTONE_ENDPOINT',
      'WALLET_PRIVATE_KEY',
      'MAX_TRADE_AMOUNT',
      'MAX_SLIPPAGE_BPS'
    ];

    const missing = required.filter(key => !this.secrets?.[key as keyof TradingSecrets]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required secrets:', missing);
      return false;
    }

    console.log('✅ All required secrets are present');
    return true;
  }

  private parseSecrets(secretsResponse: any): TradingSecrets {
    const secrets: Partial<TradingSecrets> = {};
    
    if (secretsResponse.secrets) {
      secretsResponse.secrets.forEach((secret: any) => {
        secrets[secret.secretKey as keyof TradingSecrets] = secret.secretValue;
      });
    }

    return secrets as TradingSecrets;
  }
}

/**
 * Factory function to create Infisical manager from environment
 */
export function createInfisicalManager(): InfisicalSecretManager {
  // Load local .env first for Infisical credentials
  dotenv.config();

  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId = process.env.INFISICAL_PROJECT_ID || '1232ea01-7ff9-4eac-be5a-c66a6cb34c88';
  const environment = (process.env.INFISICAL_ENVIRONMENT || 'dev') as 'dev' | 'staging' | 'prod';

  if (!clientId || !clientSecret) {
    throw new Error('INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET must be set in .env');
  }

  return new InfisicalSecretManager(clientId, clientSecret, projectId, environment);
}

/**
 * Initialize secrets and export to environment
 */
export async function initializeSecrets(): Promise<TradingSecrets> {
  const manager = createInfisicalManager();
  await manager.initialize();
  
  if (!manager.validateSecrets()) {
    throw new Error('Required secrets validation failed');
  }
  
  manager.exportToEnv();
  return manager.getSecrets()!;
}
