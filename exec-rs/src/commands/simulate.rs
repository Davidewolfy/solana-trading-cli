use crate::{ExecutorResult, jupiter::JupiterClient};
use anyhow::Result;
use log::{info, error, warn};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    compute_budget::ComputeBudgetInstruction,
    message::Message,
    pubkey::Pubkey,
    signature::Signature,
    transaction::Transaction,
};
use std::str::FromStr;

pub struct SimulateCommand {
    input_mint: String,
    output_mint: String,
    amount: String,
    slippage_bps: u16,
    rpc_url: String,
    route_info: Option<String>,
}

impl SimulateCommand {
    pub fn new(
        input_mint: String,
        output_mint: String,
        amount: String,
        slippage_bps: u16,
        rpc_url: String,
        route_info: Option<String>,
    ) -> Self {
        Self {
            input_mint,
            output_mint,
            amount,
            slippage_bps,
            rpc_url,
            route_info,
        }
    }
    
    pub async fn execute(&self) -> Result<ExecutorResult> {
        info!("Executing simulate command");
        info!("Input mint: {}", self.input_mint);
        info!("Output mint: {}", self.output_mint);
        info!("Amount: {}", self.amount);
        info!("Slippage: {} bps", self.slippage_bps);
        
        let client = RpcClient::new_with_commitment(
            self.rpc_url.clone(),
            CommitmentConfig::confirmed(),
        );
        
        match self.simulate_swap(&client).await {
            Ok((expected_out, compute_units, logs)) => {
                info!("Simulation successful - Expected output: {}", expected_out);
                
                Ok(ExecutorResult {
                    success: true,
                    signature: None,
                    received_amount: None,
                    slot: None,
                    error: None,
                    logs: Some(logs),
                    expected_out: Some(expected_out),
                    compute_units_used: Some(compute_units),
                    idempotency_key: None,
                })
            }
            Err(e) => {
                error!("Simulation failed: {}", e);
                
                Ok(ExecutorResult {
                    success: false,
                    signature: None,
                    received_amount: None,
                    slot: None,
                    error: Some(format!("Simulation failed: {}", e)),
                    logs: Some(vec![format!("Error: {}", e)]),
                    expected_out: None,
                    compute_units_used: None,
                    idempotency_key: None,
                })
            }
        }
    }
    
    async fn simulate_swap(&self, client: &RpcClient) -> Result<(String, u32, Vec<String>)> {
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
        
        // Parse the transaction
        let transaction_bytes = base64::engine::general_purpose::STANDARD.decode(&swap_response.swap_transaction)?;
        let transaction: Transaction = bincode::deserialize(&transaction_bytes)?;
        
        // Add compute budget instructions for better simulation
        let mut instructions = transaction.message.instructions.clone();
        
        // Add compute unit limit instruction
        let compute_limit_ix = ComputeBudgetInstruction::set_compute_unit_limit(400_000);
        instructions.insert(0, compute_limit_ix);
        
        // Add priority fee instruction (for simulation only)
        let priority_fee_ix = ComputeBudgetInstruction::set_compute_unit_price(1000); // 1000 microlamports
        instructions.insert(1, priority_fee_ix);
        
        // Create new message with compute budget instructions
        let message = Message::new(&instructions, Some(&transaction.message.account_keys[0]));
        let simulation_tx = Transaction::new_unsigned(message);
        
        // Simulate the transaction
        let simulation_result = client.simulate_transaction_with_config(
            &simulation_tx,
            solana_client::rpc_config::RpcSimulateTransactionConfig {
                sig_verify: false,
                replace_recent_blockhash: true,
                commitment: Some(CommitmentConfig::confirmed()),
                encoding: None,
                accounts: None,
                min_context_slot: None,
                inner_instructions: false,
            },
        )?;
        
        let mut logs = Vec::new();
        let mut compute_units_used = 0;
        
        if let Some(ref sim_result) = simulation_result.value {
            if let Some(ref err) = sim_result.err {
                return Err(anyhow::anyhow!("Simulation error: {:?}", err));
            }
            
            if let Some(ref sim_logs) = sim_result.logs {
                logs.extend(sim_logs.clone());
                
                // Extract compute units used from logs
                for log in sim_logs {
                    if log.contains("consumed") && log.contains("compute units") {
                        if let Some(units_str) = log.split_whitespace()
                            .find(|s| s.parse::<u32>().is_ok()) {
                            if let Ok(units) = units_str.parse::<u32>() {
                                compute_units_used = units;
                            }
                        }
                    }
                }
            }
            
            if let Some(ref accounts) = sim_result.accounts {
                logs.push(format!("Accounts affected: {}", accounts.len()));
            }
        }
        
        // Extract expected output from route info
        let expected_out = if let Some(out_amount) = route_info.get("outAmount") {
            out_amount.as_str().unwrap_or("0").to_string()
        } else {
            "0".to_string()
        };
        
        logs.push(format!("Expected output: {}", expected_out));
        logs.push(format!("Compute units used: {}", compute_units_used));
        
        Ok((expected_out, compute_units_used, logs))
    }
}
