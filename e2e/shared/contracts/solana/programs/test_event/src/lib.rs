//! Minimal Solana program for effectstream e2e tests.
//!
//! Emits one structured log line per invocation:
//!
//! ```text
//! E2E_SOLANA_EVENT|<authority>|<value>
//! ```
//!
//! It holds no state and creates no accounts — the point is purely to give the
//! `SOLANA:ProgramLog` primitive a *real, custom* program to attribute logs to,
//! rather than piggybacking on the System or SPL Memo programs. In particular it
//! lets the e2e suite prove the primitive keys off genuine invocation: another
//! program can emit this exact marker string, and no event must be recorded
//! against this program id.
//!
//! Instruction data: `[discriminant: u8, value: u64 (LE)]`.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

solana_program::declare_id!("7v54NWdBtkjuAFJrLGsS2SXnuk8nKam81mZJeeYxVFi9");

/// The only instruction: emit an event carrying `value`.
pub const DISCRIMINANT_EMIT: u8 = 0;

/// Prefix the e2e state machine parses. Keep in sync with `e2e/solana/grammar.ts`.
pub const EVENT_PREFIX: &str = "E2E_SOLANA_EVENT";

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    // The authority must sign. Signing is free, so this stays feeless for the
    // user even when a batcher sponsor pays the fee.
    if !authority_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let discriminant = instruction_data
        .first()
        .copied()
        .ok_or(ProgramError::InvalidInstructionData)?;
    if discriminant != DISCRIMINANT_EMIT {
        return Err(ProgramError::InvalidInstructionData);
    }

    let value = instruction_data
        .get(1..9)
        .and_then(|b| b.try_into().ok())
        .map(u64::from_le_bytes)
        .ok_or(ProgramError::InvalidInstructionData)?;

    msg!("{}|{}|{}", EVENT_PREFIX, authority_info.key, value);

    Ok(())
}
