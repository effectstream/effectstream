//! Effectstream Solana <-> Midnight bridge program (POC).
//!
//! Custodies one SPL mint (classic Token program) in a PDA-owned vault.
//!
//! Accounts (all PDAs of this program):
//! - `config`    = PDA `["config"]`            — `Config` below (operator, mint, lock_nonce, bumps).
//! - `authority` = PDA `["authority"]`         — no data; SPL owner of the vault, signs releases.
//! - `vault`     = PDA `["vault", mint]`       — SPL token account (165 bytes, Token-program owned).
//! - `receipt`   = PDA `["release", id_le8]`   — one per released withdrawal id; its existence is
//!                                               the replay guard.
//!
//! Instructions (first byte = discriminant, integers little-endian):
//! - `0 Initialize { operator: [u8;32] }`                          (33 bytes)
//! - `1 Lock { amount: u64, midnight_recipient: [u8;64] }`         (73 bytes)
//! - `2 Release { withdrawal_id: u64, amount: u64 }`               (17 bytes)
//! - `3 LockToContract { amount: u64, contract: [u8;32] }`         (41 bytes)
//!
//! `LockToContract` names a Midnight CONTRACT as the recipient (its 32-byte
//! address, not all-zero). Its accounts, checks, transfer and lock-nonce counter
//! are `Lock`'s (one shared counter, so `s2m:<nonce>` stays unique across both);
//! only the recipient and the log line differ. The program cannot see Midnight:
//! the bridge node decides whether it can deliver to that contract. A program
//! built before tag 3 refuses it (`InvalidInstruction`), so nothing is locked.
//!
//! Log lines (consumed by the Effectstream `SOLANA:ProgramLog` primitive; `msg!`
//! prefixes them with `Program log: ` on the wire):
//! - `EFFECTSTREAM_BRIDGE|INIT|<operator>|<mint>|<vault>`
//! - `EFFECTSTREAM_BRIDGE|LOCK|<nonce>|<depositor>|<mint>|<amount>|<recipientHex128>`
//! - `EFFECTSTREAM_BRIDGE|LOCKC|<nonce>|<depositor>|<mint>|<amount>|<contractHex64>`
//! - `EFFECTSTREAM_BRIDGE|RELEASE|<withdrawal_id>|<recipient_owner>|<amount>`
//!
//! Pubkeys are base58, integers decimal (raw token units), the Midnight
//! recipient is 128 lowercase hex chars (coin public key ‖ encryption public key),
//! a contract recipient 64 lowercase hex chars.
//!
//! No Anchor: plain `solana-program` 1.18.26 + `spl-token` 4.0.3, so it builds with
//! the vendored `cargo-build-sbf` (Agave 3.0.14, platform-tools v1.52).

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};
use spl_token::state::{Account as TokenAccount, Mint};

// Program id of keypair/bridge-program.json (local-only dev keypair, preloaded by
// the local validator). Only `id()` uses it; every handler checks PDAs against the
// `program_id` the runtime passes in, so the same .so also works when deployed
// under another address (deploy-devnet.ts).
solana_program::declare_id!("2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf");

pub const CONFIG_SEED: &[u8] = b"config";
pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const VAULT_SEED: &[u8] = b"vault";
pub const RELEASE_SEED: &[u8] = b"release";

pub const IX_INITIALIZE: u8 = 0;
pub const IX_LOCK: u8 = 1;
pub const IX_RELEASE: u8 = 2;
pub const IX_LOCK_TO_CONTRACT: u8 = 3;

pub const LOG_PREFIX: &str = "EFFECTSTREAM_BRIDGE";

/// Config account layout (76 bytes):
/// `version u8 | config_bump u8 | authority_bump u8 | vault_bump u8 |
///  operator [32] | mint [32] | lock_nonce u64`
pub const CONFIG_VERSION: u8 = 1;
pub const CONFIG_LEN: usize = 4 + 32 + 32 + 8;

/// Receipt account layout (49 bytes):
/// `version u8 | withdrawal_id u64 | recipient_owner [32] | amount u64`
pub const RECEIPT_VERSION: u8 = 1;
pub const RECEIPT_LEN: usize = 1 + 8 + 32 + 8;

/// Custom error codes (`custom program error: 0x<n>` in the logs).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum BridgeError {
    InvalidInstruction = 1,
    AlreadyInitialized = 2,
    NotInitialized = 3,
    InvalidAccount = 4,
    Unauthorized = 5,
    AlreadyReleased = 6,
    ZeroAmount = 7,
    MintMismatch = 8,
    NonceOverflow = 9,
    /// `LockToContract` with an all-zero contract address.
    InvalidRecipient = 10,
}

impl From<BridgeError> for ProgramError {
    fn from(e: BridgeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

pub struct Config {
    pub config_bump: u8,
    pub authority_bump: u8,
    pub vault_bump: u8,
    pub operator: Pubkey,
    pub mint: Pubkey,
    pub lock_nonce: u64,
}

impl Config {
    fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < CONFIG_LEN || data[0] != CONFIG_VERSION {
            return Err(BridgeError::NotInitialized.into());
        }
        Ok(Self {
            config_bump: data[1],
            authority_bump: data[2],
            vault_bump: data[3],
            operator: Pubkey::new_from_array(data[4..36].try_into().unwrap()),
            mint: Pubkey::new_from_array(data[36..68].try_into().unwrap()),
            lock_nonce: u64::from_le_bytes(data[68..76].try_into().unwrap()),
        })
    }

    fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < CONFIG_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        data[0] = CONFIG_VERSION;
        data[1] = self.config_bump;
        data[2] = self.authority_bump;
        data[3] = self.vault_bump;
        data[4..36].copy_from_slice(self.operator.as_ref());
        data[36..68].copy_from_slice(self.mint.as_ref());
        data[68..76].copy_from_slice(&self.lock_nonce.to_le_bytes());
        Ok(())
    }
}

pub fn find_config_address(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED], program_id)
}
pub fn find_authority_address(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[AUTHORITY_SEED], program_id)
}
pub fn find_vault_address(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], program_id)
}
pub fn find_receipt_address(program_id: &Pubkey, withdrawal_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[RELEASE_SEED, &withdrawal_id.to_le_bytes()], program_id)
}

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    data: &[u8],
) -> ProgramResult {
    let (tag, rest) = data
        .split_first()
        .ok_or(BridgeError::InvalidInstruction)?;
    match *tag {
        IX_INITIALIZE => {
            let operator: [u8; 32] = rest
                .get(0..32)
                .and_then(|b| b.try_into().ok())
                .ok_or(BridgeError::InvalidInstruction)?;
            if rest.len() != 32 {
                return Err(BridgeError::InvalidInstruction.into());
            }
            initialize(program_id, accounts, Pubkey::new_from_array(operator))
        }
        IX_LOCK => {
            if rest.len() != 8 + 64 {
                return Err(BridgeError::InvalidInstruction.into());
            }
            let amount = u64::from_le_bytes(rest[0..8].try_into().unwrap());
            let recipient: [u8; 64] = rest[8..72].try_into().unwrap();
            lock(program_id, accounts, amount, &recipient)
        }
        IX_RELEASE => {
            if rest.len() != 16 {
                return Err(BridgeError::InvalidInstruction.into());
            }
            let withdrawal_id = u64::from_le_bytes(rest[0..8].try_into().unwrap());
            let amount = u64::from_le_bytes(rest[8..16].try_into().unwrap());
            release(program_id, accounts, withdrawal_id, amount)
        }
        IX_LOCK_TO_CONTRACT => {
            if rest.len() != 8 + 32 {
                return Err(BridgeError::InvalidInstruction.into());
            }
            let amount = u64::from_le_bytes(rest[0..8].try_into().unwrap());
            let contract: [u8; 32] = rest[8..40].try_into().unwrap();
            lock_to_contract(program_id, accounts, amount, &contract)
        }
        _ => Err(BridgeError::InvalidInstruction.into()),
    }
}

/// Accounts: 0 payer (signer, writable) · 1 config (writable) · 2 authority ·
/// 3 vault (writable) · 4 mint · 5 token program · 6 system program.
///
/// POC: the first caller initializes (and names the operator). A deploy script
/// must initialize right after deploying and verify the stored operator.
fn initialize<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    operator: Pubkey,
) -> ProgramResult {
    let it = &mut accounts.iter();
    let payer = next_account_info(it)?;
    let config_info = next_account_info(it)?;
    let authority_info = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let mint_info = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let system_program_info = next_account_info(it)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    check_token_program(token_program)?;
    check_system_program(system_program_info)?;

    let (config_key, config_bump) = find_config_address(program_id);
    if *config_info.key != config_key {
        return Err(BridgeError::InvalidAccount.into());
    }
    if config_info.owner == program_id {
        return Err(BridgeError::AlreadyInitialized.into());
    }
    let (authority_key, authority_bump) = find_authority_address(program_id);
    if *authority_info.key != authority_key {
        return Err(BridgeError::InvalidAccount.into());
    }
    if *mint_info.owner != spl_token::id() {
        return Err(BridgeError::MintMismatch.into());
    }
    Mint::unpack(&mint_info.data.borrow())?; // must be an initialized classic SPL mint
    let (vault_key, vault_bump) = find_vault_address(program_id, mint_info.key);
    if *vault_info.key != vault_key {
        return Err(BridgeError::InvalidAccount.into());
    }

    create_pda_account(
        payer,
        config_info,
        system_program_info,
        CONFIG_LEN,
        program_id,
        &[CONFIG_SEED, &[config_bump]],
    )?;
    create_pda_account(
        payer,
        vault_info,
        system_program_info,
        TokenAccount::LEN,
        &spl_token::id(),
        &[VAULT_SEED, mint_info.key.as_ref(), &[vault_bump]],
    )?;
    invoke(
        &spl_token::instruction::initialize_account3(
            &spl_token::id(),
            vault_info.key,
            mint_info.key,
            authority_info.key,
        )?,
        &[vault_info.clone(), mint_info.clone(), token_program.clone()],
    )?;

    Config {
        config_bump,
        authority_bump,
        vault_bump,
        operator,
        mint: *mint_info.key,
        lock_nonce: 0,
    }
    .pack(&mut config_info.data.borrow_mut())?;

    msg!(
        "{}|INIT|{}|{}|{}",
        LOG_PREFIX,
        operator,
        mint_info.key,
        vault_info.key
    );
    Ok(())
}

/// Accounts: 0 depositor (signer) · 1 depositor token account (writable) ·
/// 2 config (writable) · 3 vault (writable) · 4 token program.
fn lock<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    amount: u64,
    midnight_recipient: &[u8; 64],
) -> ProgramResult {
    let locked = lock_into_vault(program_id, accounts, amount, true)?;
    msg!(
        "{}|LOCK|{}|{}|{}|{}|{}",
        LOG_PREFIX,
        locked.nonce,
        locked.depositor,
        locked.mint,
        amount,
        hex_lower(midnight_recipient)
    );
    Ok(())
}

/// `LockToContract`: `Lock`'s accounts, checks, transfer and nonce, for a
/// Midnight contract recipient. Accounts as `lock`.
fn lock_to_contract<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    amount: u64,
    contract: &[u8; 32],
) -> ProgramResult {
    let locked = lock_into_vault(program_id, accounts, amount, contract.iter().any(|b| *b != 0))?;
    msg!(
        "{}|LOCKC|{}|{}|{}|{}|{}",
        LOG_PREFIX,
        locked.nonce,
        locked.depositor,
        locked.mint,
        amount,
        hex_lower(contract)
    );
    Ok(())
}

/// What a lock leaves for its log line.
struct Locked {
    nonce: u64,
    depositor: Pubkey,
    mint: Pubkey,
}

/// The body both locks share, in this order: the depositor signs, the Token
/// program, the config, the vault, `amount > 0`, then the recipient
/// (`recipient_ok`, else `InvalidRecipient`), then the transfer into the vault
/// and the shared lock-nonce increment.
fn lock_into_vault<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    amount: u64,
    recipient_ok: bool,
) -> Result<Locked, ProgramError> {
    let it = &mut accounts.iter();
    let depositor = next_account_info(it)?;
    let source = next_account_info(it)?;
    let config_info = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let token_program = next_account_info(it)?;

    if !depositor.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    check_token_program(token_program)?;
    let mut config = load_config(program_id, config_info)?;
    check_vault(program_id, &config, vault_info)?;
    if amount == 0 {
        return Err(BridgeError::ZeroAmount.into());
    }
    if !recipient_ok {
        return Err(BridgeError::InvalidRecipient.into());
    }

    // The Token program rejects a source of another mint (vault mint = config.mint).
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::id(),
            source.key,
            vault_info.key,
            depositor.key,
            &[],
            amount,
        )?,
        &[
            source.clone(),
            vault_info.clone(),
            depositor.clone(),
            token_program.clone(),
        ],
    )?;

    let nonce = config.lock_nonce;
    config.lock_nonce = nonce
        .checked_add(1)
        .ok_or(BridgeError::NonceOverflow)?;
    config.pack(&mut config_info.data.borrow_mut())?;
    Ok(Locked {
        nonce,
        depositor: *depositor.key,
        mint: config.mint,
    })
}

/// Accounts: 0 operator (signer) · 1 payer (signer, writable; may equal the operator) ·
/// 2 config · 3 authority · 4 vault (writable) · 5 recipient token account (writable) ·
/// 6 receipt (writable) · 7 token program · 8 system program.
fn release<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    withdrawal_id: u64,
    amount: u64,
) -> ProgramResult {
    let it = &mut accounts.iter();
    let operator = next_account_info(it)?;
    let payer = next_account_info(it)?;
    let config_info = next_account_info(it)?;
    let authority_info = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let destination = next_account_info(it)?;
    let receipt_info = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let system_program_info = next_account_info(it)?;

    check_token_program(token_program)?;
    check_system_program(system_program_info)?;
    let config = load_config(program_id, config_info)?;
    if !operator.is_signer || *operator.key != config.operator {
        return Err(BridgeError::Unauthorized.into());
    }
    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if amount == 0 {
        return Err(BridgeError::ZeroAmount.into());
    }
    let authority_key =
        Pubkey::create_program_address(&[AUTHORITY_SEED, &[config.authority_bump]], program_id)
            .map_err(|_| BridgeError::InvalidAccount)?;
    if *authority_info.key != authority_key {
        return Err(BridgeError::InvalidAccount.into());
    }
    check_vault(program_id, &config, vault_info)?;

    let (receipt_key, receipt_bump) = find_receipt_address(program_id, withdrawal_id);
    if *receipt_info.key != receipt_key {
        return Err(BridgeError::InvalidAccount.into());
    }
    // Replay guard: once released, the receipt is owned by this program.
    if receipt_info.owner == program_id {
        return Err(BridgeError::AlreadyReleased.into());
    }

    if *destination.owner != spl_token::id() {
        return Err(BridgeError::InvalidAccount.into());
    }
    let dest = TokenAccount::unpack(&destination.data.borrow())?;
    if dest.mint != config.mint {
        return Err(BridgeError::MintMismatch.into());
    }
    let recipient_owner = dest.owner;

    let id_le = withdrawal_id.to_le_bytes();
    create_pda_account(
        payer,
        receipt_info,
        system_program_info,
        RECEIPT_LEN,
        program_id,
        &[RELEASE_SEED, &id_le, &[receipt_bump]],
    )?;
    {
        let mut r = receipt_info.data.borrow_mut();
        r[0] = RECEIPT_VERSION;
        r[1..9].copy_from_slice(&id_le);
        r[9..41].copy_from_slice(recipient_owner.as_ref());
        r[41..49].copy_from_slice(&amount.to_le_bytes());
    }

    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::id(),
            vault_info.key,
            destination.key,
            authority_info.key,
            &[],
            amount,
        )?,
        &[
            vault_info.clone(),
            destination.clone(),
            authority_info.clone(),
            token_program.clone(),
        ],
        &[&[AUTHORITY_SEED, &[config.authority_bump]]],
    )?;

    msg!(
        "{}|RELEASE|{}|{}|{}",
        LOG_PREFIX,
        withdrawal_id,
        recipient_owner,
        amount
    );
    Ok(())
}

fn load_config(program_id: &Pubkey, config_info: &AccountInfo) -> Result<Config, ProgramError> {
    if config_info.owner != program_id {
        return Err(BridgeError::NotInitialized.into());
    }
    let config = Config::unpack(&config_info.data.borrow())?;
    let expected = Pubkey::create_program_address(&[CONFIG_SEED, &[config.config_bump]], program_id)
        .map_err(|_| BridgeError::InvalidAccount)?;
    if *config_info.key != expected {
        return Err(BridgeError::InvalidAccount.into());
    }
    Ok(config)
}

fn check_vault(program_id: &Pubkey, config: &Config, vault_info: &AccountInfo) -> ProgramResult {
    let expected = Pubkey::create_program_address(
        &[VAULT_SEED, config.mint.as_ref(), &[config.vault_bump]],
        program_id,
    )
    .map_err(|_| BridgeError::InvalidAccount)?;
    if *vault_info.key != expected {
        return Err(BridgeError::InvalidAccount.into());
    }
    Ok(())
}

fn check_token_program(info: &AccountInfo) -> ProgramResult {
    if *info.key != spl_token::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

fn check_system_program(info: &AccountInfo) -> ProgramResult {
    if *info.key != system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

/// Creates a PDA account owned by `owner`, funded by `payer`.
///
/// Not `system_instruction::create_account`: that fails once the target holds any
/// lamports, so anyone could brick a PDA by pre-funding it. transfer (top-up) +
/// allocate + assign is the griefing-resistant sequence (same as solana-starter).
fn create_pda_account<'a>(
    payer: &AccountInfo<'a>,
    target: &AccountInfo<'a>,
    system_program_info: &AccountInfo<'a>,
    space: usize,
    owner: &Pubkey,
    seeds: &[&[u8]],
) -> ProgramResult {
    let required = Rent::get()?.minimum_balance(space);
    let current = target.lamports();
    if current < required {
        invoke(
            &system_instruction::transfer(payer.key, target.key, required - current),
            &[payer.clone(), target.clone(), system_program_info.clone()],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(target.key, space as u64),
        &[target.clone(), system_program_info.clone()],
        &[seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(target.key, owner),
        &[target.clone(), system_program_info.clone()],
        &[seeds],
    )?;
    Ok(())
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}
