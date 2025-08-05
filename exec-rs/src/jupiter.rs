use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct QuoteResponse {
    #[serde(rename = "inputMint")]
    pub input_mint: String,
    #[serde(rename = "inAmount")]
    pub in_amount: String,
    #[serde(rename = "outputMint")]
    pub output_mint: String,
    #[serde(rename = "outAmount")]
    pub out_amount: String,
    #[serde(rename = "otherAmountThreshold")]
    pub other_amount_threshold: String,
    #[serde(rename = "swapMode")]
    pub swap_mode: String,
    #[serde(rename = "slippageBps")]
    pub slippage_bps: u16,
    #[serde(rename = "platformFee")]
    pub platform_fee: Option<Value>,
    #[serde(rename = "priceImpactPct")]
    pub price_impact_pct: String,
    #[serde(rename = "routePlan")]
    pub route_plan: Vec<Value>,
    #[serde(rename = "contextSlot")]
    pub context_slot: u64,
    #[serde(rename = "timeTaken")]
    pub time_taken: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SwapRequest {
    #[serde(rename = "quoteResponse")]
    pub quote_response: Value,
    #[serde(rename = "userPublicKey")]
    pub user_public_key: String,
    #[serde(rename = "wrapAndUnwrapSol")]
    pub wrap_and_unwrap_sol: bool,
    #[serde(rename = "useSharedAccounts")]
    pub use_shared_accounts: bool,
    #[serde(rename = "feeAccount")]
    pub fee_account: Option<String>,
    #[serde(rename = "trackingAccount")]
    pub tracking_account: Option<String>,
    #[serde(rename = "computeUnitPriceMicroLamports")]
    pub compute_unit_price_micro_lamports: Option<u64>,
    #[serde(rename = "prioritizationFeeLamports")]
    pub prioritization_fee_lamports: Option<u64>,
    #[serde(rename = "asLegacyTransaction")]
    pub as_legacy_transaction: bool,
    #[serde(rename = "useTokenLedger")]
    pub use_token_ledger: bool,
    #[serde(rename = "destinationTokenAccount")]
    pub destination_token_account: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SwapResponse {
    #[serde(rename = "swapTransaction")]
    pub swap_transaction: String,
    #[serde(rename = "lastValidBlockHeight")]
    pub last_valid_block_height: u64,
    #[serde(rename = "prioritizationFeeLamports")]
    pub prioritization_fee_lamports: Option<u64>,
    #[serde(rename = "computeUnitLimit")]
    pub compute_unit_limit: Option<u32>,
    #[serde(rename = "prioritizationType")]
    pub prioritization_type: Option<Value>,
    #[serde(rename = "dynamicSlippageReport")]
    pub dynamic_slippage_report: Option<Value>,
    #[serde(rename = "simulationError")]
    pub simulation_error: Option<Value>,
}

pub struct JupiterClient {
    client: Client,
    base_url: String,
}

impl JupiterClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://quote-api.jup.ag/v6".to_string(),
        }
    }
    
    pub fn with_base_url(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }
    
    pub async fn get_quote(
        &self,
        input_mint: &str,
        output_mint: &str,
        amount: &str,
        slippage_bps: u16,
    ) -> Result<Value> {
        let url = format!("{}/quote", self.base_url);
        
        let mut params = HashMap::new();
        params.insert("inputMint", input_mint);
        params.insert("outputMint", output_mint);
        params.insert("amount", amount);
        params.insert("slippageBps", &slippage_bps.to_string());
        params.insert("onlyDirectRoutes", "false");
        params.insert("asLegacyTransaction", "false");
        
        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Jupiter quote failed: {}", error_text));
        }
        
        let quote: Value = response.json().await?;
        Ok(quote)
    }
    
    pub async fn get_swap_transaction(&self, quote_response: &Value) -> Result<SwapResponse> {
        let url = format!("{}/swap", self.base_url);
        
        // Extract user public key from quote response or use a placeholder
        // In a real implementation, this would be passed from the caller
        let user_public_key = "11111111111111111111111111111112"; // Placeholder
        
        let swap_request = SwapRequest {
            quote_response: quote_response.clone(),
            user_public_key: user_public_key.to_string(),
            wrap_and_unwrap_sol: true,
            use_shared_accounts: true,
            fee_account: None,
            tracking_account: None,
            compute_unit_price_micro_lamports: None,
            prioritization_fee_lamports: None,
            as_legacy_transaction: false,
            use_token_ledger: false,
            destination_token_account: None,
        };
        
        let response = self.client
            .post(&url)
            .json(&swap_request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Jupiter swap failed: {}", error_text));
        }
        
        let swap_response: SwapResponse = response.json().await?;
        Ok(swap_response)
    }
    
    pub async fn get_swap_transaction_with_user(
        &self, 
        quote_response: &Value, 
        user_public_key: &str
    ) -> Result<SwapResponse> {
        let url = format!("{}/swap", self.base_url);
        
        let swap_request = SwapRequest {
            quote_response: quote_response.clone(),
            user_public_key: user_public_key.to_string(),
            wrap_and_unwrap_sol: true,
            use_shared_accounts: true,
            fee_account: None,
            tracking_account: None,
            compute_unit_price_micro_lamports: None,
            prioritization_fee_lamports: None,
            as_legacy_transaction: false,
            use_token_ledger: false,
            destination_token_account: None,
        };
        
        let response = self.client
            .post(&url)
            .json(&swap_request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Jupiter swap failed: {}", error_text));
        }
        
        let swap_response: SwapResponse = response.json().await?;
        Ok(swap_response)
    }
    
    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await?;
        
        Ok(response.status().is_success())
    }
}
