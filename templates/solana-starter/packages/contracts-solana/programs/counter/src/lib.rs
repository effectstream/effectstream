//! Minimal Solana counter program. See the template README for how it fits
//! into the sync node / batcher round-trip.
//!
//! Stores a `u64` counter in a PDA seeded by the user's pubkey, with two
//! instructions ( `Increment(amount)`, `Reset` ), and emits a log line on
//! every call: `EFFECTSTREAM_COUNTER|<authority>|<value>|<slot>`.
//!
//! Feeless for the user: the PDA's rent is funded by a dedicated `payer`
//! account ( the batcher's fee-payer ), not the authority. The authority only
//! has to *sign* ( free ) to authorize a change to its own counter, so a user
//! never needs to hold SOL.
//!
//! No Anchor — plain `solana-program` so it builds with the vendored
//! `cargo-build-sbf` (Solana 1.18.x) without the Anchor CLI.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::Sysvar,
};

solana_program::declare_id!("8veT8XVnBxG6kmq27CrCgznCtVHLJsBAqGHZrodKaRJ6");

/// Discriminant byte for each instruction.
pub const DISCRIMINANT_INCREMENT: u8 = 0;
pub const DISCRIMINANT_RESET: u8 = 1;

/// Number of bytes the on-chain counter account stores: just a little-endian u64.
pub const COUNTER_LEN: usize = 8;

/// Seed used for the counter PDA: `[b"counter", authority]`.
pub const COUNTER_SEED: &[u8] = b"counter";

/// Convenience helper for deriving the counter PDA on the client side.
pub fn find_counter_address(program_id: &Pubkey, authority: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[COUNTER_SEED, authority.as_ref()], program_id)
}

// Account order (both instructions): authority (signer), counter (PDA),
// payer (signer, funds rent), system_program. Keep in sync with instructions.ts.
fn counter_accounts(authority: &Pubkey, counter: &Pubkey, payer: &Pubkey) -> Vec<AccountMeta> {
    vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*counter, false),
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(solana_program::system_program::ID, false),
    ]
}

pub fn increment(
    program_id: &Pubkey,
    authority: &Pubkey,
    counter: &Pubkey,
    payer: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(DISCRIMINANT_INCREMENT);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: *program_id,
        accounts: counter_accounts(authority, counter, payer),
        data,
    }
}

pub fn reset(
    program_id: &Pubkey,
    authority: &Pubkey,
    counter: &Pubkey,
    payer: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: counter_accounts(authority, counter, payer),
        data: vec![DISCRIMINANT_RESET],
    }
}

entrypoint!(process_instruction);

pub fn process_instruction<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    let counter_info = next_account_info(account_info_iter)?;
    let payer_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    // Only the authority may change its own counter. The signature is free, so
    // this stays feeless for the user.
    if !authority_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the expected PDA.
    let (expected_pda, bump) = find_counter_address(program_id, authority_info.key);
    if counter_info.key != &expected_pda {
        return Err(ProgramError::InvalidArgument);
    }

    // Discriminant byte.
    let discriminant = instruction_data
        .first()
        .copied()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match discriminant {
        DISCRIMINANT_INCREMENT => {
            // Lazily create the counter account if it doesn't exist yet.
            if counter_info.data_len() == 0 {
                create_counter_account(
                    payer_info,
                    counter_info,
                    system_program_info,
                    authority_info.key,
                    bump,
                )?;
            }

            let amount = instruction_data
                .get(1..9)
                .and_then(|b| b.try_into().ok())
                .map(u64::from_le_bytes)
                .ok_or(ProgramError::InvalidInstructionData)?;

            let mut current = read_u64(counter_info)?;
            current = current.saturating_add(amount);
            write_u64(counter_info, current)?;
        }
        DISCRIMINANT_RESET => {
            if counter_info.data_len() == 0 {
                create_counter_account(
                    payer_info,
                    counter_info,
                    system_program_info,
                    authority_info.key,
                    bump,
                )?;
            }
            write_u64(counter_info, 0)?;
        }
        _ => return Err(ProgramError::InvalidInstructionData),
    }

    let slot = Clock::get()?.slot;
    let value = read_u64(counter_info)?;
    // Stable wire format consumed by the effectstream sync node's state machine.
    msg!(
        "EFFECTSTREAM_COUNTER|{}|{}|{}",
        authority_info.key,
        value,
        slot
    );

    Ok(())
}

fn read_u64(counter_info: &AccountInfo) -> Result<u64, ProgramError> {
    let data = counter_info.data.borrow();
    let bytes: [u8; 8] = data
        .get(0..COUNTER_LEN)
        .and_then(|s| s.try_into().ok())
        .ok_or(ProgramError::AccountDataTooSmall)?;
    Ok(u64::from_le_bytes(bytes))
}

fn write_u64(counter_info: &AccountInfo, value: u64) -> ProgramResult {
    let mut data = counter_info.data.borrow_mut();
    if data.len() < COUNTER_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    data[0..COUNTER_LEN].copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn create_counter_account<'a>(
    payer: &'a AccountInfo<'a>,
    counter: &'a AccountInfo<'a>,
    system_program: &'a AccountInfo<'a>,
    authority_key: &Pubkey,
    bump: u8,
) -> ProgramResult {
    // Rent is funded by the payer ( the batcher ), not the authority. The PDA
    // signs for its own creation via its seeds.
    //
    // Deliberately NOT `system_instruction::create_account`: that fails with
    // AccountAlreadyInUse the moment the target holds any lamports, so anyone
    // could permanently brick a user's counter by sending 1 lamport to
    // find_counter_address(program, victim) before their first increment. The
    // transfer + allocate + assign sequence below is the standard, griefing-
    // resistant way to initialise a PDA: it tops the balance up to rent-exempt
    // rather than assuming the account is empty.
    let rent = solana_program::rent::Rent::get()?;
    let required = rent.minimum_balance(COUNTER_LEN);
    let current = counter.lamports();
    let signer_seeds: &[&[u8]] = &[COUNTER_SEED, authority_key.as_ref(), &[bump]];

    if current < required {
        invoke(
            &system_instruction::transfer(payer.key, counter.key, required - current),
            &[payer.clone(), counter.clone(), system_program.clone()],
        )?;
    }

    invoke_signed(
        &system_instruction::allocate(counter.key, COUNTER_LEN as u64),
        &[counter.clone(), system_program.clone()],
        &[signer_seeds],
    )?;

    invoke_signed(
        &system_instruction::assign(counter.key, &crate::ID),
        &[counter.clone(), system_program.clone()],
        &[signer_seeds],
    )?;

    // Initialize to zero.
    write_u64(counter, 0)?;
    Ok(())
}
