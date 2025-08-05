/**
 * gRPC Streaming Types
 * Types for Yellowstone gRPC streaming
 */

export interface StreamConfig {
  endpoint: string;
  token?: string;
  programs?: string[];
  accounts?: string[];
  pingIntervalMs?: number;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export interface SubscribeRequest {
  accounts?: Record<string, AccountsFilter>;
  slots?: Record<string, SlotsFilter>;
  transactions?: Record<string, TransactionsFilter>;
  transactionsStatus?: Record<string, TransactionsStatusFilter>;
  blocks?: Record<string, BlocksFilter>;
  blocksMeta?: Record<string, BlocksMetaFilter>;
  entry?: Record<string, EntryFilter>;
  commitment?: CommitmentLevel;
  accountsDataSlice?: AccountsDataSlice[];
  ping?: PingFilter;
}

export interface AccountsFilter {
  account?: string[];
  owner?: string[];
  filters?: AccountsFilterMemcmp[];
}

export interface AccountsFilterMemcmp {
  offset: number;
  bytes?: string;
  dataSize?: number;
}

export interface SlotsFilter {
  filterByCommitment?: boolean;
}

export interface TransactionsFilter {
  vote?: boolean;
  failed?: boolean;
  signature?: string;
  accountInclude?: string[];
  accountExclude?: string[];
  accountRequired?: string[];
}

export interface TransactionsStatusFilter {
  vote?: boolean;
  failed?: boolean;
  signature?: string;
  accountInclude?: string[];
  accountExclude?: string[];
  accountRequired?: string[];
}

export interface BlocksFilter {
  accountInclude?: string[];
  includeTransactions?: boolean;
  includeAccounts?: boolean;
  includeEntries?: boolean;
}

export interface BlocksMetaFilter {
  // Empty for now
}

export interface EntryFilter {
  // Empty for now
}

export interface AccountsDataSlice {
  offset: number;
  length: number;
}

export interface PingFilter {
  id: number;
}

export enum CommitmentLevel {
  PROCESSED = 0,
  CONFIRMED = 1,
  FINALIZED = 2
}

export interface SubscribeUpdate {
  account?: SubscribeUpdateAccount;
  slot?: SubscribeUpdateSlot;
  transaction?: SubscribeUpdateTransaction;
  transactionStatus?: SubscribeUpdateTransactionStatus;
  block?: SubscribeUpdateBlock;
  blockMeta?: SubscribeUpdateBlockMeta;
  entry?: SubscribeUpdateEntry;
  ping?: SubscribeUpdatePing;
}

export interface SubscribeUpdateAccount {
  account?: AccountInfo;
  slot: number;
  writeVersion: number;
}

export interface AccountInfo {
  pubkey: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data: Uint8Array;
  writeVersion: number;
  txnSignature?: string;
}

export interface SubscribeUpdateSlot {
  slot: number;
  parent?: number;
  status: SlotStatus;
}

export enum SlotStatus {
  PROCESSED = 0,
  CONFIRMED = 1,
  FINALIZED = 2
}

export interface SubscribeUpdateTransaction {
  transaction?: TransactionInfo;
  slot: number;
}

export interface TransactionInfo {
  signature: string;
  isVote: boolean;
  transaction: any; // Parsed transaction
  meta: any; // Transaction meta
}

export interface SubscribeUpdateTransactionStatus {
  slot: number;
  signature: string;
  err?: any;
  index: number;
}

export interface SubscribeUpdateBlock {
  slot: number;
  blockhash: string;
  rewards?: any[];
  blockTime?: number;
  blockHeight?: number;
  parentSlot: number;
  parentBlockhash: string;
  executedTransactionCount: number;
  transactions?: any[];
  accounts?: any[];
  entries?: any[];
}

export interface SubscribeUpdateBlockMeta {
  slot: number;
  blockhash: string;
  rewards?: any[];
  blockTime?: number;
  blockHeight?: number;
  parentSlot: number;
  parentBlockhash: string;
  executedTransactionCount: number;
}

export interface SubscribeUpdateEntry {
  slot: number;
  index: number;
  numHashes: number;
  hash: string;
  executedTransactionCount: number;
}

export interface SubscribeUpdatePing {
  id: number;
}

export interface StreamEvent {
  type: 'account' | 'slot' | 'transaction' | 'block' | 'ping' | 'error';
  data: any;
  timestamp: number;
}

export interface ConnectionStats {
  connected: boolean;
  reconnectAttempts: number;
  lastConnected?: number;
  lastDisconnected?: number;
  totalMessages: number;
  totalErrors: number;
  uptime: number;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  endpoint: 'grpc.triton.one:443',
  pingIntervalMs: 30000, // 30 seconds
  reconnectIntervalMs: 5000, // 5 seconds
  maxReconnectAttempts: 10,
  programs: [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpools
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // Meteora
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'   // Pump.fun
  ]
};
