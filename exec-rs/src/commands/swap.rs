use crate::{ExecutorResult, jupiter::JupiterClient, utils};
use anyhow::Result;
use log::{info, error, warn};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    compute_budget::ComputeBudgetInstruction,
    message::Message,
    pubkey::Pubkey,
    signature::{Keypair, Signature},
    signer::Signer,
    transaction::Transaction,
};
use std::str::FromStr;
use std::time::{Duration, Instant};

pub struct SwapCommand {
    input_mint: String,
    output_mint: String,
    amount: String,
    slippage_bps: u16,
    wallet: String,
    rpc_url: String,
    mode: String,
    idempotency_key: Option<String>,
    route_info: Option<String>,
    priority_fee: Option<u64>,
    compute_unit_limit: Option<u32>,
}

impl SwapCommand {
    pub fn new(
        input_mint: String,
        output_mint: String,
        amount: String,
        slippage_bps: u16,
        wallet: String,
        rpc_url: String,
        mode: String,
        idempotency_key: Option<String>,
        route_info: Option<String>,
        priority_fee: Option<u64>,
        compute_unit_limit: Option<u32>,
    ) -> Self {
        Self {
            input_mint,
            output_mint,
            amount,
            slippage_bps,
            wallet,
            rpc_url,
            mode,
            idempotency_key,
            route_info,
            priority_fee,
            compute_unit_limit,
        }
    }
    
    pub async fn execute(&self) -> Result<ExecutorResult> {
        info!("Executing swap command");
        info!("Input mint: {}", self.input_mint);
        info!("Output mint: {}", self.output_mint);
        info!("Amount: {}", self.amount);
        info!("Slippage: {} bps", self.slippage_bps);
        info!("Mode: {}", self.mode);
        
        if let Some(ref key) = self.idempotency_key {
            info!("Idempotency key: {}", key);
        }
        
        let client = RpcClient::new_with_commitment(
            self.rpc_url.clone(),
            CommitmentConfig::confirmed(),
        );
        
        match self.execute_swap(&client).await {
            Ok((signature, received_amount, slot)) => {
                info!("Swap successful - Signature: {}", signature);
                
                Ok(ExecutorResult {
                    success: true,
                    signature: Some(signature),
                    received_amount: Some(received_amount),
                    slot: Some(slot),
                    error: None,
                    logs: Some(vec![
                        format!("Transaction signature: {}", signature),
                        format!("Received amount: {}", received_amount),
                        format!("Confirmed at slot: {}", slot),
                    ]),
                    expected_out: None,
                    compute_units_used: None,
                    idempotency_key: self.idempotency_key.clone(),
                })
            }
            Err(e) => {
                error!("Swap failed: {}", e);
                
                Ok(ExecutorResult {
                    success: false,
                    signature: None,
                    received_amount: None,
                    slot: None,
                    error: Some(format!("Swap failed: {}", e)),
                    logs: Some(vec![format!("Error: {}", e)]),
                    expected_out: None,
                    compute_units_used: None,
                    idempotency_key: self.idempotency_key.clone(),
                })
            }
        }
    }
    
    async fn execute_swap(&self, client: &RpcClient) -> Result<(String, String, u64)> {
        // Load wallet
        let wallet_keypair = utils::load_wallet(&self.wallet)?;
        info!("Loaded wallet: {}", wallet_keypair.pubkey());
        
        // Create Jupiter client
        let jupiter = JupiterClient::new();
        
        // Get quote if route info not provided
        let route_info = if let Some(ref info) = self.route_info {
            serde_json::from_str(info)?
        } else {
            jupiter.get_quote(
                &self.input_mint,
                &self.output_mint,
                &self.amount,
                self.slippage_bps,
            ).await?
        };
        
        // Get swap transaction
        let swap_response = jupiter.get_swap_transaction(&route_info).await?;
        
        // Parse and prepare transaction
        let mut transaction = self.prepare_transaction(&swap_response.swap_transaction, &wallet_keypair)?;
        
        // Add compute budget instructions if specified
        if self.priority_fee.is_some() || self.compute_unit_limit.is_some() {
            transaction = self.add_compute_budget_instructions(transaction, &wallet_keypair)?;
        }
        
        // Execute based on mode
        match self.mode.as_str() {
            "simple" => self.execute_simple_swap(client, transaction).await,
            "jito" => self.execute_jito_swap(client, transaction).await,
            "bloxroute" => self.execute_bloxroute_swap(client, transaction).await,
            _ => {
                warn!("Unknown execution mode: {}, falling back to simple", self.mode);
                self.execute_simple_swap(client, transaction).await
            }
        }
    }
    
    fn prepare_transaction(&self, swap_transaction: &str, wallet: &Keypair) -> Result<Transaction> {
        // Decode base64 transaction
        let transaction_bytes = base64::engine::general_purpose::STANDARD.decode(swap_transaction)?;
        let mut transaction: Transaction = bincode::deserialize(&transaction_bytes)?;
        
        // Get recent blockhash
        let recent_blockhash = transaction.message.recent_blockhash;
        
        // Sign the transaction
        transaction.sign(&[wallet], recent_blockhash);
        
        Ok(transaction)
    }
    
    fn add_compute_budget_instructions(&self, mut transaction: Transaction, wallet: &Keypair) -> Result<Transaction> {
        let mut instructions = Vec::new();

        // Add compute unit limit if specified, otherwise use dynamic limit
        let compute_limit = self.compute_unit_limit.unwrap_or_else(|| {
            // Dynamic compute limit based on transaction complexity
            let base_limit = 200_000u32;
            let instruction_count = transaction.message.instructions.len() as u32;
            let dynamic_limit = base_limit + (instruction_count * 50_000);
            std::cmp::min(dynamic_limit, 1_400_000) // Cap at 1.4M CU
        });

        instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(compute_limit));

        // Add priority fee if specified, otherwise use dynamic fee
        let priority_fee = self.priority_fee.unwrap_or_else(|| {
            // Dynamic priority fee based on network congestion
            // This is simplified - in production you'd query recent fees
            1000u64 // 1000 microlamports default
        });

        instructions.push(ComputeBudgetInstruction::set_compute_unit_price(priority_fee));

        // Add original instructions
        instructions.extend(transaction.message.instructions.clone());

        // Create new message
        let message = Message::new(&instructions, Some(&wallet.pubkey()));
        let new_transaction = Transaction::new(&[wallet], message, transaction.message.recent_blockhash);

        info!("Added compute budget: {} CU limit, {} microlamports priority fee",
               compute_limit, priority_fee);

        Ok(new_transaction)
    }
    
    async fn execute_simple_swap(&self, client: &RpcClient, transaction: Transaction) -> Result<(String, String, u64)> {
        info!("Executing simple swap");

        // Get current block height for timeout calculation
        let current_block_height = client.get_block_height()?;
        let last_valid_block_height = current_block_height + 150; // ~1 minute timeout

        info!("Current block height: {}, last valid: {}",
               current_block_height, last_valid_block_height);

        // Send transaction with timeout awareness
        let signature = client.send_transaction(&transaction)?;
        info!("Transaction sent: {}", signature);

        // Confirm transaction with block height timeout
        let mut attempts = 0;
        let max_attempts = 60; // 60 seconds max

        loop {
            attempts += 1;

            // Check if we've exceeded the valid block height
            let current_height = client.get_block_height()?;
            if current_height > last_valid_block_height {
                return Err(anyhow::anyhow!(
                    "Transaction expired: current height {} > last valid {}",
                    current_height, last_valid_block_height
                ));
            }

            // Check transaction status
            match client.get_signature_status(&signature)? {
                Some(Ok(())) => {
                    info!("Transaction confirmed at block height: {}", current_height);
                    break;
                }
                Some(Err(err)) => {
                    return Err(anyhow::anyhow!("Transaction failed: {:?}", err));
                }
                None => {
                    if attempts >= max_attempts {
                        return Err(anyhow::anyhow!("Transaction confirmation timeout"));
                    }
                    // Wait 1 second before next check
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            }
        }

        // Get transaction details
        let confirmed_tx = client.get_transaction_with_config(
            &signature,
            solana_client::rpc_config::RpcTransactionConfig {
                encoding: Some(solana_transaction_status::UiTransactionEncoding::Json),
                commitment: Some(CommitmentConfig::confirmed()),
                max_supported_transaction_version: Some(0),
            },
        )?;

        let slot = confirmed_tx.slot;

        // Extract received amount from transaction logs or meta
        let received_amount = self.extract_received_amount(&confirmed_tx)?;

        Ok((signature.to_string(), received_amount, slot))
    }
    
    async fn execute_jito_swap(&self, _client: &RpcClient, _transaction: Transaction) -> Result<(String, String, u64)> {
        // TODO: Implement Jito bundle execution
        warn!("Jito execution not yet implemented, falling back to simple");
        Err(anyhow::anyhow!("Jito execution not implemented"))
    }
    
    async fn execute_bloxroute_swap(&self, _client: &RpcClient, _transaction: Transaction) -> Result<(String, String, u64)> {
        // TODO: Implement bloXroute execution
        warn!("bloXroute execution not yet implemented, falling back to simple");
        Err(anyhow::anyhow!("bloXroute execution not implemented"))
    }
    
    fn extract_received_amount(&self, confirmed_tx: &solana_client::rpc_response::RpcConfirmedTransaction) -> Result<String> {
        // This is simplified - in reality you'd parse the transaction logs
        // to extract the actual received amount
        if let Some(ref meta) = confirmed_tx.transaction.meta {
            if let Some(ref post_balances) = meta.post_token_balances {
                // Find the output token balance change
                for balance in post_balances {
                    if balance.mint == self.output_mint {
                        return Ok(balance.ui_token_amount.amount.clone());
                    }
                }
            }
        }
        
        // Fallback to "0" if we can't extract the amount
        Ok("0".to_string())
    }
}
