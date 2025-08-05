use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod commands;
mod jupiter;
mod utils;

use commands::{ping::PingCommand, simulate::SimulateCommand, swap::SwapCommand};

#[derive(Parser)]
#[command(name = "exec-rs")]
#[command(about = "Solana Trading Executor")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Ping command for health checks
    Ping {
        /// RPC endpoint to ping
        #[arg(long, default_value = "https://api.mainnet-beta.solana.com")]
        rpc_url: String,
        
        /// Timeout in seconds
        #[arg(long, default_value = "5")]
        timeout: u64,
    },
    
    /// Simulate a swap without execution
    Simulate {
        /// Input mint address
        #[arg(long)]
        input_mint: String,
        
        /// Output mint address
        #[arg(long)]
        output_mint: String,
        
        /// Amount to swap
        #[arg(long)]
        amount: String,
        
        /// Slippage in basis points
        #[arg(long)]
        slippage_bps: u16,
        
        /// RPC endpoint
        #[arg(long, default_value = "https://api.mainnet-beta.solana.com")]
        rpc_url: String,
        
        /// Route info from Jupiter (JSON)
        #[arg(long)]
        route_info: Option<String>,
    },
    
    /// Execute a swap
    Swap {
        /// Input mint address
        #[arg(long)]
        input_mint: String,
        
        /// Output mint address
        #[arg(long)]
        output_mint: String,
        
        /// Amount to swap
        #[arg(long)]
        amount: String,
        
        /// Slippage in basis points
        #[arg(long)]
        slippage_bps: u16,
        
        /// Wallet file path
        #[arg(long)]
        wallet: String,
        
        /// RPC endpoint
        #[arg(long, default_value = "https://api.mainnet-beta.solana.com")]
        rpc_url: String,
        
        /// Execution mode
        #[arg(long, default_value = "simple")]
        mode: String,
        
        /// Idempotency key
        #[arg(long)]
        idempotency_key: Option<String>,
        
        /// Route info from Jupiter (JSON)
        #[arg(long)]
        route_info: Option<String>,
        
        /// Priority fee in microlamports
        #[arg(long)]
        priority_fee: Option<u64>,
        
        /// Compute unit limit
        #[arg(long)]
        compute_unit_limit: Option<u32>,
    },
}

#[derive(Serialize, Deserialize)]
struct ExecutorResult {
    success: bool,
    signature: Option<String>,
    received_amount: Option<String>,
    slot: Option<u64>,
    error: Option<String>,
    logs: Option<Vec<String>>,
    expected_out: Option<String>,
    compute_units_used: Option<u32>,
    idempotency_key: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    
    let cli = Cli::parse();
    
    let result = match cli.command {
        Commands::Ping { rpc_url, timeout } => {
            let ping_cmd = PingCommand::new(rpc_url, timeout);
            ping_cmd.execute().await
        }
        
        Commands::Simulate {
            input_mint,
            output_mint,
            amount,
            slippage_bps,
            rpc_url,
            route_info,
        } => {
            let simulate_cmd = SimulateCommand::new(
                input_mint,
                output_mint,
                amount,
                slippage_bps,
                rpc_url,
                route_info,
            );
            simulate_cmd.execute().await
        }
        
        Commands::Swap {
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
        } => {
            let swap_cmd = SwapCommand::new(
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
            );
            swap_cmd.execute().await
        }
    };
    
    // Output result as JSON
    let json_output = serde_json::to_string_pretty(&result)?;
    println!("{}", json_output);
    
    if !result.success {
        std::process::exit(1);
    }
    
    Ok(())
}
