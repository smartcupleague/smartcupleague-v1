
#![no_std]
#![allow(static_mut_refs)]

use sails_rs::{
    prelude::*,
    gstd::{msg, exec},
    collections::HashMap,
};
use sails_rs::collections::HashMap as SailsHashMap;

const FEE_BASIS_POINTS: u128 = 500;
const FINAL_PRIZE_BASIS_POINTS: u128 = 2000;
const BASIS_POINTS_DIV: u128 = 10_000;
const MAX_PAYOUT_CHUNK: u128 = 10_000 * 1_000_000_000_000; 

pub static mut BOLAO_STATE: Option<BolaoState> = None;

#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum Outcome {
    Home,
    Draw,
    Away,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ResultStatus {
    Unresolved,
    Proposed { outcome: Outcome, oracle: ActorId },
    Finalized { outcome: Outcome },
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MatchPhase {
    pub name: String,
    pub start_time: u64,
    pub end_time: u64,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MatchInfo {
    pub match_id: u64,
    pub phase: String,
    pub home: String,
    pub away: String,
    pub kick_off: u64,
    pub result: ResultStatus,
    pub pool_home: u128,
    pub pool_draw: u128,
    pub pool_away: u128,
    pub has_bets: bool,
    pub participants: Vec<ActorId>,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Bet {
    pub user: ActorId,
    pub match_id: u64,
    pub selected: Outcome,
    pub amount: u128,
    pub paid: bool,
}


#[derive(Debug, Clone, Default)]
pub struct BolaoState {
    pub owner: ActorId,
    pub kyc_contract: ActorId,
    pub final_prize_distributor: ActorId,
    pub fee_accum: u128,
    pub final_prize_accum: u128,
    pub matches: SailsHashMap<u64, MatchInfo>,
    pub phases: SailsHashMap<String, MatchPhase>,
    pub user_points: SailsHashMap<ActorId, u32>,
    pub bets: SailsHashMap<(ActorId, u64), Bet>,
    pub current_match: u64,
    pub payouts_queue: Vec<(u64, ActorId)>,
}

impl BolaoState {
    
    pub fn init(owner: ActorId, kyc_contract: ActorId, final_prize_distributor: ActorId) {
        unsafe {
            BOLAO_STATE = Some(Self {
                owner,
                kyc_contract,
                final_prize_distributor,
                ..Default::default()
            })
        }
    }

    /// Mutable reference to global state
    pub fn state_mut() -> &'static mut BolaoState {
        let s = unsafe { BOLAO_STATE.as_mut() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }
    /// Immutable reference to global state
    pub fn state_ref() -> &'static BolaoState {
        let s = unsafe { BOLAO_STATE.as_ref() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }
}

/// Program event log
#[derive(Debug, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum BolaoEvent {
    PhaseRegistered(String),
    MatchRegistered(u64, String, String, String, u64),
    BetAccepted(ActorId, u64, Outcome, u128),
    ResultProposed(u64, Outcome, ActorId),
    ResultFinalized(u64, Outcome),
    WinnerPaid(u64, ActorId, u128),
    FinalPrizeSent(u128, ActorId),
    FeeWithdrawn(u128, ActorId),
}

/// Query replies
#[derive(Debug, Encode, Decode, TypeInfo, Clone)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoBolaoState {
    pub owner: ActorId,
    pub kyc_contract: ActorId,
    pub final_prize_distributor: ActorId,
    pub fee_accum: u128,
    pub final_prize_accum: u128,
    pub matches: Vec<MatchInfo>,
    pub phases: Vec<MatchPhase>,
    pub user_points: Vec<(ActorId, u32)>,
}

impl From<BolaoState> for IoBolaoState {
    fn from(state: BolaoState) -> Self {
        Self {
            owner: state.owner,
            kyc_contract: state.kyc_contract,
            final_prize_distributor: state.final_prize_distributor,
            fee_accum: state.fee_accum,
            final_prize_accum: state.final_prize_accum,
            matches: state.matches.values().cloned().collect(),
            phases: state.phases.values().cloned().collect(),
            user_points: state.user_points.iter().map(|(id, pts)| (*id, *pts)).collect(),
        }
    }
}

/// Main service struct
#[derive(Default)]
pub struct Service;

impl Service {
   
    pub fn seed(kyc_contract: ActorId, final_prize_distributor: ActorId) {
        BolaoState::init(msg::source(), kyc_contract, final_prize_distributor)
    }
}

#[sails_rs::service(events = BolaoEvent)]
impl Service {
    pub fn new() -> Self { Self }

    /// Register new phase (group stage, semis, etc).
    pub fn register_phase(&mut self, phase_name: String, start_time: u64, end_time: u64) -> BolaoEvent {
        let state = BolaoState::state_mut();
        if msg::source() != state.owner { panic!("Only owner"); }
        if state.phases.contains_key(&phase_name) { panic!("Duplicate phase"); }
        let phase = MatchPhase {
            name: phase_name.clone(),
            start_time,
            end_time,
        };
        state.phases.insert(phase_name.clone(), phase);
        self.emit_event(BolaoEvent::PhaseRegistered(phase_name.clone())).expect("Notify error");
        BolaoEvent::PhaseRegistered(phase_name)
    }

    /// Register new match. Only owner.
    pub fn register_match(&mut self, phase: String, home: String, away: String, kick_off: u64) -> BolaoEvent {
        let state = BolaoState::state_mut();
        if msg::source() != state.owner { panic!("Only owner"); }
        if !state.phases.contains_key(&phase) { panic!("Phase not found"); }
        let id = state.current_match.saturating_add(1);
        state.current_match = id;
        let info = MatchInfo {
            match_id: id,
            phase: phase.clone(),
            home: home.clone(),
            away: away.clone(),
            kick_off,
            result: ResultStatus::Unresolved,
            pool_home: 0,
            pool_draw: 0,
            pool_away: 0,
            has_bets: false,
            participants: Vec::new(),
        };
        state.matches.insert(id, info);
        self.emit_event(BolaoEvent::MatchRegistered(id, phase, home, away, kick_off)).expect("Notify");
        BolaoEvent::MatchRegistered(id, phase, home, away, kick_off)
    }

    /// Accept a bet (may only before kick_off). Must validate age via KYC contract externally. Fee/final_prize logic applies.
    pub fn bet(&mut self, match_id: u64, selected: Outcome) -> BolaoEvent {
        let state = BolaoState::state_mut();
        let user = msg::source();
        let amount = msg::value();
        let now = exec::block_timestamp();

        // Validate match exists and has not started
        let info = state.matches.get_mut(&match_id).expect("Match not found");
        if now >= info.kick_off { panic!("Match started"); }
        if state.bets.contains_key(&(user, match_id)) { panic!("Already bet"); }

        // KYC Verification (age): check with KYC contract, must reply with true for is_over_18(account)
        let request_bytes = ["is_over_18".to_string().encode(), user.encode()].concat();
        let bytes_reply = msg::send_bytes_for_reply(state.kyc_contract, request_bytes, 0, 0)
            .expect("KYC call failed")
            .wait()
            .expect("No reply from KYC");

        let is_over_18: bool = sails_rs::codec::Decode::decode(&mut &bytes_reply[..]).unwrap();
        if !is_over_18 { panic!("Must be over 18"); }

        // Fee logic
        let fee = amount.saturating_mul(FEE_BASIS_POINTS) / BASIS_POINTS_DIV;
        let final_prize = amount.saturating_mul(FINAL_PRIZE_BASIS_POINTS) / BASIS_POINTS_DIV;
        let bet_amount = amount.saturating_sub(fee).saturating_sub(final_prize);

        state.fee_accum = state.fee_accum.saturating_add(fee);
        state.final_prize_accum = state.final_prize_accum.saturating_add(final_prize);

        match selected {
            Outcome::Home => { info.pool_home = info.pool_home.saturating_add(bet_amount); }
            Outcome::Draw => { info.pool_draw = info.pool_draw.saturating_add(bet_amount); }
            Outcome::Away => { info.pool_away = info.pool_away.saturating_add(bet_amount); }
        }

        info.has_bets = true;
        if !info.participants.contains(&user) {
            info.participants.push(user);
        }

        let bet = Bet {
            user,
            match_id,
            selected,
            amount: bet_amount,
            paid: false,
        };
        state.bets.insert((user, match_id), bet);
        self.emit_event(BolaoEvent::BetAccepted(user, match_id, selected, bet_amount)).expect("event");
        BolaoEvent::BetAccepted(user, match_id, selected, bet_amount)
    }

    /// Propose result (anyone with oracle rights can call).
    pub fn propose_result(&mut self, match_id: u64, outcome: Outcome) -> BolaoEvent {
        let state = BolaoState::state_mut();
        let user = msg::source();
        let info = state.matches.get_mut(&match_id).expect("No such match");
        match &info.result {
            ResultStatus::Unresolved => {
                info.result = ResultStatus::Proposed { outcome, oracle: user };
            }
            _ => panic!("Result already proposed/finalized"),
        }
        self.emit_event(BolaoEvent::ResultProposed(match_id, outcome, user)).expect("Notify");
        BolaoEvent::ResultProposed(match_id, outcome, user)
    }

    /// Finalize proposed result (must be from owner or designated oracle admin).
    pub fn finalize_result(&mut self, match_id: u64) -> BolaoEvent {
        let state = BolaoState::state_mut();
        let user = msg::source();
        let info = state.matches.get_mut(&match_id).expect("No such match");
        let outcome = match &info.result {
            ResultStatus::Proposed { outcome, oracle: _ } => *outcome,
            _ => panic!("Not proposed or already finalized"),
        };
        if user != state.owner {
            panic!("Only owner may finalize");
        }
        info.result = ResultStatus::Finalized { outcome };
        // Points assignment for correct users (accumulate)
        for participant in info.participants.iter() {
            if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                if bet.selected == outcome {
                    let pts = state.user_points.entry(*participant).or_insert(0);
                    *pts = pts.saturating_add(3);
                }
            }
        }
        self.emit_event(BolaoEvent::ResultFinalized(match_id, outcome)).expect("Notify");
        BolaoEvent::ResultFinalized(match_id, outcome)
    }

    /// Begin winner payout for match: pays in safe chunks; one call pays up to MAX_PAYOUT_CHUNK total. Repeatable.
    pub fn payout_winners(&mut self, match_id: u64) -> Vec<BolaoEvent> {
        let state = BolaoState::state_mut();
        let info = state.matches.get(&match_id).expect("Not found");
        let outcome = match info.result {
            ResultStatus::Finalized { outcome } => outcome,
            _ => panic!("Not finalized"),
        };
        // Winners logic
        let total_pool = info.pool_home.saturating_add(info.pool_draw).saturating_add(info.pool_away);
        let (winning_pool, variant) = match outcome {
            Outcome::Home => (info.pool_home, Outcome::Home),
            Outcome::Draw => (info.pool_draw, Outcome::Draw),
            Outcome::Away => (info.pool_away, Outcome::Away),
        };
        // No winners or empty pool
        if winning_pool == 0 { return Vec::new(); }

        // Find all participants who are winners and not yet paid
        let mut paid = 0u128;
        let mut n = 0;
        let mut events = Vec::new();
        for bet in state.bets.values_mut() {
            if bet.match_id == match_id && bet.selected == variant && !bet.paid {
                let share = bet.amount.saturating_mul(total_pool) / winning_pool;
                // Limit chunk payout
                if paid.saturating_add(share) > MAX_PAYOUT_CHUNK { break; }
                // Mark as paid before transferring
                bet.paid = true;
                // Pay out
                msg::send(bet.user, (), share).expect("Payout failed");
                events.push(BolaoEvent::WinnerPaid(match_id, bet.user, share));
                paid = paid.saturating_add(share);
                n += 1;
            }
        }
        events
    }

    /// Send accumulated 'final prize' to FinalPrizeDistributorActor, then resets final_prize_accum.
    pub fn send_final_prize(&mut self) -> BolaoEvent {
        let state = BolaoState::state_mut();
        let to = state.final_prize_distributor;
        let amt = state.final_prize_accum;
        if amt == 0 { panic!("No prize"); }
        state.final_prize_accum = 0;
        msg::send(to, (), amt).expect("Prize payout failed");
        self.emit_event(BolaoEvent::FinalPrizeSent(amt, to)).expect("event");
        BolaoEvent::FinalPrizeSent(amt, to)
    }

    /// Owner withdraws accumulated fees.
    pub fn withdraw_fees(&mut self) -> BolaoEvent {
        let state = BolaoState::state_mut();
        let to = state.owner;
        let amt = state.fee_accum;
        if amt == 0 { panic!("No fee"); }
        state.fee_accum = 0;
        msg::send(to, (), amt).expect("Fee payout failed");
        self.emit_event(BolaoEvent::FeeWithdrawn(amt, to)).expect("event");
        BolaoEvent::FeeWithdrawn(amt, to)
    }

    // === Queries ===

    /// Query a match by id
    pub fn query_match(&self, match_id: u64) -> Option<MatchInfo> {
        BolaoState::state_ref().matches.get(&match_id).cloned()
    }

    /// Query points for a specific user
    pub fn query_user_points(&self, user: ActorId) -> u32 {
        BolaoState::state_ref().user_points.get(&user).cloned().unwrap_or(0)
    }

    /// Query all matches for a phase
    pub fn query_matches_by_phase(&self, phase: String) -> Vec<MatchInfo> {
        let state = BolaoState::state_ref();
        state.matches.values().filter(|m| m.phase == phase).cloned().collect()
    }

    /// Query contract global state
    pub fn query_state(&self) -> IoBolaoState {
        BolaoState::state_ref().clone().into()
    }
}
