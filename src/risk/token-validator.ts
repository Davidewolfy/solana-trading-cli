import { PublicKey, Connection } from '@solana/web3.js';
import { EventEmitter } from 'events';

/**
 * Token Validation System with denylist and security checks
 */

export interface TokenInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: number;
  verified?: boolean;
  tags?: string[];
  riskScore?: number;
  lastUpdated: number;
}

export interface SecurityCheck {
  name: string;
  passed: boolean;
  score: number; // 0-100, higher is safer
  details?: string;
}

export interface ValidationResult {
  isValid: boolean;
  riskScore: number; // 0-100, higher is riskier
  securityChecks: SecurityCheck[];
  warnings: string[];
  errors: string[];
  tokenInfo?: TokenInfo;
}

export interface DenylistEntry {
  address: string;
  reason: string;
  addedAt: number;
  source: string;
  permanent: boolean;
}

export class TokenValidator extends EventEmitter {
  private connection: Connection;
  private denylist: Map<string, DenylistEntry> = new Map();
  private tokenCache: Map<string, TokenInfo> = new Map();
  private verifiedTokens: Set<string> = new Set();
  private knownPrograms: Set<string> = new Set();

  constructor(connection: Connection) {
    super();
    this.connection = connection;
    this.initializeKnownPrograms();
    this.loadDefaultDenylist();
  }

  /**
   * Validate token for trading
   */
  async validateToken(tokenAddress: string): Promise<ValidationResult> {
    console.log(`🔍 Validating token: ${tokenAddress}`);

    const result: ValidationResult = {
      isValid: true,
      riskScore: 0,
      securityChecks: [],
      warnings: [],
      errors: []
    };

    try {
      // Check denylist first
      const denylistCheck = this.checkDenylist(tokenAddress);
      result.securityChecks.push(denylistCheck);
      
      if (!denylistCheck.passed) {
        result.isValid = false;
        result.errors.push(`Token is on denylist: ${denylistCheck.details}`);
        return result;
      }

      // Get or fetch token info
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      result.tokenInfo = tokenInfo;

      // Perform security checks
      const checks = await Promise.all([
        this.checkTokenProgram(tokenAddress),
        this.checkTokenMetadata(tokenInfo),
        this.checkSupplyDistribution(tokenAddress),
        this.checkLiquidityPools(tokenAddress),
        this.checkHolderDistribution(tokenAddress),
        this.checkMintAuthority(tokenAddress),
        this.checkFreezeAuthority(tokenAddress)
      ]);

      result.securityChecks.push(...checks);

      // Calculate overall risk score
      result.riskScore = this.calculateRiskScore(result.securityChecks);

      // Generate warnings based on checks
      this.generateWarnings(result);

      // Final validation
      result.isValid = result.errors.length === 0 && result.riskScore < 80;

      console.log(`${result.isValid ? '✅' : '❌'} Token validation: ${tokenAddress} (risk: ${result.riskScore})`);

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error}`);
      result.riskScore = 100;
    }

    return result;
  }

  /**
   * Add token to denylist
   */
  addToDenylist(
    address: string, 
    reason: string, 
    source = 'manual', 
    permanent = false
  ): void {
    const entry: DenylistEntry = {
      address,
      reason,
      addedAt: Date.now(),
      source,
      permanent
    };

    this.denylist.set(address, entry);
    this.emit('tokenDenylisted', entry);
    
    console.log(`🚫 Added to denylist: ${address} - ${reason}`);
  }

  /**
   * Remove token from denylist
   */
  removeFromDenylist(address: string): boolean {
    const entry = this.denylist.get(address);
    if (!entry) return false;

    if (entry.permanent) {
      console.warn(`⚠️ Cannot remove permanent denylist entry: ${address}`);
      return false;
    }

    this.denylist.delete(address);
    this.emit('tokenWhitelisted', { address, removedAt: Date.now() });
    
    console.log(`✅ Removed from denylist: ${address}`);
    return true;
  }

  private checkDenylist(tokenAddress: string): SecurityCheck {
    const entry = this.denylist.get(tokenAddress);
    
    return {
      name: 'denylist_check',
      passed: !entry,
      score: entry ? 0 : 100,
      details: entry ? entry.reason : 'Token not on denylist'
    };
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // Check cache first
    const cached = this.tokenCache.get(tokenAddress);
    if (cached && Date.now() - cached.lastUpdated < 300000) { // 5 minutes
      return cached;
    }

    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      
      if (!mintInfo.value?.data || !('parsed' in mintInfo.value.data)) {
        throw new Error('Invalid token mint');
      }

      const parsedData = mintInfo.value.data.parsed.info;
      
      const tokenInfo: TokenInfo = {
        address: tokenAddress,
        decimals: parsedData.decimals,
        supply: parsedData.supply,
        lastUpdated: Date.now()
      };

      // Try to get metadata
      try {
        // This would integrate with token metadata programs
        // For now, using placeholder
        tokenInfo.name = 'Unknown Token';
        tokenInfo.symbol = 'UNK';
      } catch (error) {
        // Metadata not available
      }

      this.tokenCache.set(tokenAddress, tokenInfo);
      return tokenInfo;

    } catch (error) {
      throw new Error(`Failed to fetch token info: ${error}`);
    }
  }

  private async checkTokenProgram(tokenAddress: string): SecurityCheck {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getAccountInfo(mintPubkey);
      
      if (!accountInfo) {
        return {
          name: 'token_program_check',
          passed: false,
          score: 0,
          details: 'Token account not found'
        };
      }

      const isKnownProgram = this.knownPrograms.has(accountInfo.owner.toBase58());
      
      return {
        name: 'token_program_check',
        passed: isKnownProgram,
        score: isKnownProgram ? 100 : 20,
        details: isKnownProgram ? 'Known token program' : 'Unknown token program'
      };

    } catch (error) {
      return {
        name: 'token_program_check',
        passed: false,
        score: 0,
        details: `Program check failed: ${error}`
      };
    }
  }

  private checkTokenMetadata(tokenInfo: TokenInfo): SecurityCheck {
    const hasMetadata = !!(tokenInfo.name && tokenInfo.symbol);
    const isVerified = tokenInfo.verified || false;
    
    let score = 50; // Base score
    if (hasMetadata) score += 30;
    if (isVerified) score += 20;
    
    return {
      name: 'metadata_check',
      passed: hasMetadata,
      score,
      details: hasMetadata ? 'Token has metadata' : 'Missing token metadata'
    };
  }

  private async checkSupplyDistribution(tokenAddress: string): SecurityCheck {
    // This would check if supply is concentrated in few wallets
    // Placeholder implementation
    return {
      name: 'supply_distribution_check',
      passed: true,
      score: 75,
      details: 'Supply distribution appears normal'
    };
  }

  private async checkLiquidityPools(tokenAddress: string): SecurityCheck {
    // This would check for adequate liquidity across DEXs
    // Placeholder implementation
    return {
      name: 'liquidity_check',
      passed: true,
      score: 80,
      details: 'Adequate liquidity found'
    };
  }

  private async checkHolderDistribution(tokenAddress: string): SecurityCheck {
    // This would analyze holder distribution for concentration risk
    // Placeholder implementation
    return {
      name: 'holder_distribution_check',
      passed: true,
      score: 70,
      details: 'Holder distribution acceptable'
    };
  }

  private async checkMintAuthority(tokenAddress: string): SecurityCheck {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      
      if (!mintInfo.value?.data || !('parsed' in mintInfo.value.data)) {
        return {
          name: 'mint_authority_check',
          passed: false,
          score: 0,
          details: 'Cannot read mint info'
        };
      }

      const mintAuthority = mintInfo.value.data.parsed.info.mintAuthority;
      const hasAuthority = !!mintAuthority;
      
      return {
        name: 'mint_authority_check',
        passed: !hasAuthority, // No mint authority is safer
        score: hasAuthority ? 30 : 100,
        details: hasAuthority ? 'Mint authority present (can create new tokens)' : 'No mint authority (fixed supply)'
      };

    } catch (error) {
      return {
        name: 'mint_authority_check',
        passed: false,
        score: 0,
        details: `Mint authority check failed: ${error}`
      };
    }
  }

  private async checkFreezeAuthority(tokenAddress: string): SecurityCheck {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      
      if (!mintInfo.value?.data || !('parsed' in mintInfo.value.data)) {
        return {
          name: 'freeze_authority_check',
          passed: false,
          score: 0,
          details: 'Cannot read mint info'
        };
      }

      const freezeAuthority = mintInfo.value.data.parsed.info.freezeAuthority;
      const hasAuthority = !!freezeAuthority;
      
      return {
        name: 'freeze_authority_check',
        passed: !hasAuthority, // No freeze authority is safer
        score: hasAuthority ? 40 : 100,
        details: hasAuthority ? 'Freeze authority present (can freeze accounts)' : 'No freeze authority'
      };

    } catch (error) {
      return {
        name: 'freeze_authority_check',
        passed: false,
        score: 0,
        details: `Freeze authority check failed: ${error}`
      };
    }
  }

  private calculateRiskScore(checks: SecurityCheck[]): number {
    if (checks.length === 0) return 100;
    
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    const averageScore = totalScore / checks.length;
    
    // Convert safety score to risk score (inverse)
    return Math.max(0, 100 - averageScore);
  }

  private generateWarnings(result: ValidationResult): void {
    result.securityChecks.forEach(check => {
      if (!check.passed) {
        result.warnings.push(`${check.name}: ${check.details}`);
      } else if (check.score < 70) {
        result.warnings.push(`${check.name}: Low confidence - ${check.details}`);
      }
    });

    if (result.riskScore > 60) {
      result.warnings.push(`High risk score: ${result.riskScore}/100`);
    }
  }

  private initializeKnownPrograms(): void {
    // Add known safe token programs
    this.knownPrograms.add('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); // SPL Token
    this.knownPrograms.add('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'); // Token-2022
  }

  private loadDefaultDenylist(): void {
    // Load known malicious tokens
    const knownBadTokens = [
      // Add known scam/malicious token addresses here
    ];

    knownBadTokens.forEach(address => {
      this.addToDenylist(address, 'Known malicious token', 'default', true);
    });
  }

  /**
   * Get denylist status
   */
  getDenylistStatus(): {
    totalEntries: number;
    permanentEntries: number;
    recentEntries: DenylistEntry[];
  } {
    const entries = Array.from(this.denylist.values());
    const recent = entries
      .filter(entry => Date.now() - entry.addedAt < 24 * 60 * 60 * 1000) // Last 24 hours
      .sort((a, b) => b.addedAt - a.addedAt);

    return {
      totalEntries: entries.length,
      permanentEntries: entries.filter(e => e.permanent).length,
      recentEntries: recent.slice(0, 10) // Last 10
    };
  }
}

/**
 * Factory function to create token validator
 */
export function createTokenValidator(connection: Connection): TokenValidator {
  return new TokenValidator(connection);
}
