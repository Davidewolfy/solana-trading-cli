use crate::ExecutorResult;
use anyhow::Result;
use log::{info, error};
use solana_client::rpc_client::RpcClient;
use std::time::{Duration, Instant};

pub struct PingCommand {
    rpc_url: String,
    timeout: u64,
}

impl PingCommand {
    pub fn new(rpc_url: String, timeout: u64) -> Self {
        Self { rpc_url, timeout }
    }
    
    pub async fn execute(&self) -> Result<ExecutorResult> {
        info!("Executing ping command to {}", self.rpc_url);
        
        let start_time = Instant::now();
        
        // Create RPC client with timeout
        let client = RpcClient::new_with_timeout(
            self.rpc_url.clone(),
            Duration::from_secs(self.timeout),
        );
        
        match self.ping_rpc(&client).await {
            Ok(slot) => {
                let duration = start_time.elapsed();
                info!("Ping successful - Current slot: {}, Duration: {:?}", slot, duration);
                
                Ok(ExecutorResult {
                    success: true,
                    signature: None,
                    received_amount: None,
                    slot: Some(slot),
                    error: None,
                    logs: Some(vec![
                        format!("RPC endpoint: {}", self.rpc_url),
                        format!("Current slot: {}", slot),
                        format!("Response time: {:?}", duration),
                    ]),
                    expected_out: None,
                    compute_units_used: None,
                    idempotency_key: None,
                })
            }
            Err(e) => {
                error!("Ping failed: {}", e);
                
                Ok(ExecutorResult {
                    success: false,
                    signature: None,
                    received_amount: None,
                    slot: None,
                    error: Some(format!("Ping failed: {}", e)),
                    logs: Some(vec![
                        format!("RPC endpoint: {}", self.rpc_url),
                        format!("Error: {}", e),
                    ]),
                    expected_out: None,
                    compute_units_used: None,
                    idempotency_key: None,
                })
            }
        }
    }
    
    async fn ping_rpc(&self, client: &RpcClient) -> Result<u64> {
        // Get current slot as a simple health check
        let slot = client.get_slot()?;

        // Additional health checks with timeout
        let _block_height = client.get_block_height()?;
        let _epoch_info = client.get_epoch_info()?;

        // Test transaction simulation capability
        let recent_blockhash = client.get_latest_blockhash()?;
        info!("Recent blockhash: {}", recent_blockhash);

        // Test account lookup
        let system_program = solana_sdk::system_program::id();
        let _account = client.get_account(&system_program)?;

        Ok(slot)
    }
}
