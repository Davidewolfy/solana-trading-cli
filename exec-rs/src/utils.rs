use anyhow::Result;
use solana_sdk::signature::Keypair;
use std::fs;

/// Load wallet keypair from file
pub fn load_wallet(wallet_path: &str) -> Result<Keypair> {
    let wallet_data = fs::read(wallet_path)?;
    
    // Try to parse as JSON array first (Solana CLI format)
    if let Ok(json_data) = serde_json::from_slice::<Vec<u8>>(&wallet_data) {
        if json_data.len() == 64 {
            let keypair = Keypair::from_bytes(&json_data)?;
            return Ok(keypair);
        }
    }
    
    // Try to parse as raw bytes
    if wallet_data.len() == 64 {
        let keypair = Keypair::from_bytes(&wallet_data)?;
        return Ok(keypair);
    }
    
    Err(anyhow::anyhow!("Invalid wallet file format"))
}

/// Format lamports as SOL
pub fn lamports_to_sol(lamports: u64) -> f64 {
    lamports as f64 / 1_000_000_000.0
}

/// Format SOL as lamports
pub fn sol_to_lamports(sol: f64) -> u64 {
    (sol * 1_000_000_000.0) as u64
}

/// Parse amount string (supports both lamports and SOL)
pub fn parse_amount(amount_str: &str) -> Result<u64> {
    if amount_str.contains('.') {
        // Assume SOL amount
        let sol_amount: f64 = amount_str.parse()?;
        Ok(sol_to_lamports(sol_amount))
    } else {
        // Assume lamports
        let lamports: u64 = amount_str.parse()?;
        Ok(lamports)
    }
}

/// Validate Solana public key format
pub fn validate_pubkey(pubkey_str: &str) -> Result<()> {
    use solana_sdk::pubkey::Pubkey;
    use std::str::FromStr;
    
    Pubkey::from_str(pubkey_str)?;
    Ok(())
}

/// Generate a random idempotency key
pub fn generate_idempotency_key() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Get current timestamp in milliseconds
pub fn current_timestamp_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Format duration in human readable format
pub fn format_duration(duration_ms: u64) -> String {
    if duration_ms < 1000 {
        format!("{}ms", duration_ms)
    } else if duration_ms < 60_000 {
        format!("{:.1}s", duration_ms as f64 / 1000.0)
    } else {
        format!("{:.1}m", duration_ms as f64 / 60_000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_lamports_conversion() {
        assert_eq!(lamports_to_sol(1_000_000_000), 1.0);
        assert_eq!(sol_to_lamports(1.0), 1_000_000_000);
    }
    
    #[test]
    fn test_parse_amount() {
        assert_eq!(parse_amount("1000000000").unwrap(), 1_000_000_000);
        assert_eq!(parse_amount("1.0").unwrap(), 1_000_000_000);
        assert_eq!(parse_amount("0.5").unwrap(), 500_000_000);
    }
    
    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(500), "500ms");
        assert_eq!(format_duration(1500), "1.5s");
        assert_eq!(format_duration(65000), "1.1m");
    }
}
