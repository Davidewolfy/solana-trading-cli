import { Keypair, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Key Management System with segregation and rotation
 */

export interface KeyConfig {
  id: string;
  purpose: 'trading' | 'master' | 'backup' | 'strategy';
  environment: 'development' | 'staging' | 'production';
  permissions: string[];
  maxDailyVolume?: number;
  expiresAt?: number;
  rotationInterval?: number; // in milliseconds
}

export interface ManagedKey {
  config: KeyConfig;
  keypair: Keypair;
  publicKey: PublicKey;
  createdAt: number;
  lastUsed?: number;
  usageCount: number;
  encrypted: boolean;
}

export interface KeyRotationEvent {
  keyId: string;
  oldPublicKey: string;
  newPublicKey: string;
  reason: string;
  timestamp: number;
}

export class KeyManager extends EventEmitter {
  private keys: Map<string, ManagedKey> = new Map();
  private encryptionKey: Buffer;
  private keyStorePath: string;
  private rotationInterval?: NodeJS.Timeout;

  constructor(encryptionPassword: string, keyStorePath: string) {
    super();
    this.encryptionKey = crypto.scryptSync(encryptionPassword, 'salt', 32);
    this.keyStorePath = keyStorePath;
    this.ensureKeyStoreDirectory();
    this.loadKeys();
    this.startRotationMonitoring();
  }

  /**
   * Create a new managed key
   */
  async createKey(config: KeyConfig): Promise<string> {
    if (this.keys.has(config.id)) {
      throw new Error(`Key with ID ${config.id} already exists`);
    }

    const keypair = Keypair.generate();
    const managedKey: ManagedKey = {
      config,
      keypair,
      publicKey: keypair.publicKey,
      createdAt: Date.now(),
      usageCount: 0,
      encrypted: true
    };

    this.keys.set(config.id, managedKey);
    await this.saveKey(managedKey);

    console.log(`🔑 Created new key: ${config.id} (${keypair.publicKey.toBase58()})`);
    this.emit('keyCreated', { keyId: config.id, publicKey: keypair.publicKey.toBase58() });

    return config.id;
  }

  /**
   * Get key for use
   */
  getKey(keyId: string, requiredPermission?: string): Keypair | null {
    const managedKey = this.keys.get(keyId);
    if (!managedKey) {
      console.warn(`⚠️ Key not found: ${keyId}`);
      return null;
    }

    // Check permissions
    if (requiredPermission && !managedKey.config.permissions.includes(requiredPermission)) {
      console.warn(`⚠️ Key ${keyId} lacks permission: ${requiredPermission}`);
      return null;
    }

    // Check expiration
    if (managedKey.config.expiresAt && Date.now() > managedKey.config.expiresAt) {
      console.warn(`⚠️ Key ${keyId} has expired`);
      return null;
    }

    // Update usage tracking
    managedKey.lastUsed = Date.now();
    managedKey.usageCount++;

    this.emit('keyUsed', { 
      keyId, 
      publicKey: managedKey.publicKey.toBase58(),
      permission: requiredPermission 
    });

    return managedKey.keypair;
  }

  /**
   * Rotate key
   */
  async rotateKey(keyId: string, reason = 'manual'): Promise<boolean> {
    const managedKey = this.keys.get(keyId);
    if (!managedKey) {
      console.warn(`⚠️ Cannot rotate - key not found: ${keyId}`);
      return false;
    }

    const oldPublicKey = managedKey.publicKey.toBase58();
    const newKeypair = Keypair.generate();
    
    // Update the managed key
    managedKey.keypair = newKeypair;
    managedKey.publicKey = newKeypair.publicKey;
    managedKey.createdAt = Date.now();
    managedKey.lastUsed = undefined;
    managedKey.usageCount = 0;

    // Save updated key
    await this.saveKey(managedKey);

    const rotationEvent: KeyRotationEvent = {
      keyId,
      oldPublicKey,
      newPublicKey: newKeypair.publicKey.toBase58(),
      reason,
      timestamp: Date.now()
    };

    console.log(`🔄 Rotated key: ${keyId} (${oldPublicKey} → ${rotationEvent.newPublicKey})`);
    this.emit('keyRotated', rotationEvent);

    return true;
  }

  /**
   * Revoke key
   */
  async revokeKey(keyId: string, reason = 'manual'): Promise<boolean> {
    const managedKey = this.keys.get(keyId);
    if (!managedKey) {
      return false;
    }

    // Remove from memory
    this.keys.delete(keyId);

    // Remove from storage
    const keyFilePath = path.join(this.keyStorePath, `${keyId}.key`);
    try {
      if (fs.existsSync(keyFilePath)) {
        fs.unlinkSync(keyFilePath);
      }
    } catch (error) {
      console.error(`Failed to delete key file for ${keyId}:`, error);
    }

    console.log(`🗑️ Revoked key: ${keyId} - ${reason}`);
    this.emit('keyRevoked', { 
      keyId, 
      publicKey: managedKey.publicKey.toBase58(), 
      reason,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * List all keys
   */
  listKeys(): Array<{
    id: string;
    publicKey: string;
    purpose: string;
    environment: string;
    permissions: string[];
    createdAt: number;
    lastUsed?: number;
    usageCount: number;
    expired: boolean;
  }> {
    return Array.from(this.keys.values()).map(key => ({
      id: key.config.id,
      publicKey: key.publicKey.toBase58(),
      purpose: key.config.purpose,
      environment: key.config.environment,
      permissions: key.config.permissions,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      usageCount: key.usageCount,
      expired: !!(key.config.expiresAt && Date.now() > key.config.expiresAt)
    }));
  }

  /**
   * Get key statistics
   */
  getKeyStats(): {
    totalKeys: number;
    keysByPurpose: Record<string, number>;
    keysByEnvironment: Record<string, number>;
    expiredKeys: number;
    recentlyUsed: number;
  } {
    const keys = Array.from(this.keys.values());
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    const keysByPurpose: Record<string, number> = {};
    const keysByEnvironment: Record<string, number> = {};
    let expiredKeys = 0;
    let recentlyUsed = 0;

    keys.forEach(key => {
      // Count by purpose
      keysByPurpose[key.config.purpose] = (keysByPurpose[key.config.purpose] || 0) + 1;
      
      // Count by environment
      keysByEnvironment[key.config.environment] = (keysByEnvironment[key.config.environment] || 0) + 1;
      
      // Count expired
      if (key.config.expiresAt && now > key.config.expiresAt) {
        expiredKeys++;
      }
      
      // Count recently used
      if (key.lastUsed && now - key.lastUsed < dayInMs) {
        recentlyUsed++;
      }
    });

    return {
      totalKeys: keys.length,
      keysByPurpose,
      keysByEnvironment,
      expiredKeys,
      recentlyUsed
    };
  }

  private async saveKey(managedKey: ManagedKey): Promise<void> {
    const keyData = {
      config: managedKey.config,
      secretKey: Array.from(managedKey.keypair.secretKey),
      createdAt: managedKey.createdAt,
      lastUsed: managedKey.lastUsed,
      usageCount: managedKey.usageCount
    };

    // Encrypt the key data
    const encrypted = this.encrypt(JSON.stringify(keyData));
    
    const keyFilePath = path.join(this.keyStorePath, `${managedKey.config.id}.key`);
    fs.writeFileSync(keyFilePath, encrypted);
  }

  private loadKeys(): void {
    if (!fs.existsSync(this.keyStorePath)) {
      return;
    }

    const keyFiles = fs.readdirSync(this.keyStorePath).filter(file => file.endsWith('.key'));
    
    for (const keyFile of keyFiles) {
      try {
        const keyFilePath = path.join(this.keyStorePath, keyFile);
        const encryptedData = fs.readFileSync(keyFilePath);
        const decryptedData = this.decrypt(encryptedData);
        const keyData = JSON.parse(decryptedData);

        const keypair = Keypair.fromSecretKey(new Uint8Array(keyData.secretKey));
        const managedKey: ManagedKey = {
          config: keyData.config,
          keypair,
          publicKey: keypair.publicKey,
          createdAt: keyData.createdAt,
          lastUsed: keyData.lastUsed,
          usageCount: keyData.usageCount || 0,
          encrypted: true
        };

        this.keys.set(managedKey.config.id, managedKey);
        console.log(`📂 Loaded key: ${managedKey.config.id}`);

      } catch (error) {
        console.error(`Failed to load key file ${keyFile}:`, error);
      }
    }
  }

  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
  }

  private decrypt(encryptedData: Buffer): string {
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private ensureKeyStoreDirectory(): void {
    if (!fs.existsSync(this.keyStorePath)) {
      fs.mkdirSync(this.keyStorePath, { recursive: true });
    }
  }

  private startRotationMonitoring(): void {
    this.rotationInterval = setInterval(() => {
      this.checkForRotationNeeds();
    }, 60000); // Check every minute
  }

  private checkForRotationNeeds(): void {
    const now = Date.now();
    
    for (const [keyId, managedKey] of this.keys) {
      if (managedKey.config.rotationInterval) {
        const timeSinceCreation = now - managedKey.createdAt;
        
        if (timeSinceCreation >= managedKey.config.rotationInterval) {
          console.log(`⏰ Auto-rotating key due to interval: ${keyId}`);
          this.rotateKey(keyId, 'automatic_interval');
        }
      }
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
  }
}

/**
 * Default key configurations
 */
export const DEFAULT_KEY_CONFIGS = {
  trading: {
    permissions: ['trade', 'quote'],
    maxDailyVolume: 50000,
    rotationInterval: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  
  master: {
    permissions: ['trade', 'quote', 'admin', 'transfer'],
    rotationInterval: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  
  strategy: {
    permissions: ['trade', 'quote'],
    maxDailyVolume: 10000,
    rotationInterval: 3 * 24 * 60 * 60 * 1000 // 3 days
  }
};
