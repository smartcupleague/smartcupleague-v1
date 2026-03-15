#![allow(static_mut_refs)]

use sails_rs::{
    prelude::*,
    gstd::{exec, msg},
};
use sails_rs::collections::HashMap as SailsHashMap;

const PROTOCOL_FEE_BPS: u128 = 500; // 5%
const FINAL_PRIZE_BPS: u128 = 2000; // 20%
const BPS_DENOMINATOR: u128 = 10_000;

const BET_CLOSE_WINDOW_SECONDS: u64 = 600; // 10 minutes

pub static mut SMARTCUP_STATE: Option<SmartCupState> = None;

#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Score {
    pub home: u8,
    pub away: u8,
}

#[derive(Debug, Clone, Copy, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum PenaltyWinner {
    Home,
    Away,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ResultStatus {
    Unresolved,
    Proposed {
        score: Score,
        penalty_winner: Option<PenaltyWinner>,
        oracle: ActorId,
    },
    Finalized {
        score: Score,
        penalty_winner: Option<PenaltyWinner>,
    },
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct WalletClaimStatus {
    pub wallet: ActorId,
    pub amount_claimable: u128,
    pub already_claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PhaseConfig {
    pub name: String,
    pub start_time: u64,
    pub end_time: u64,
    pub points_weight: u32, // Group=1, R32=2, R16=3, QF=4, SF=5, 3rd=6, Final=8
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Match {
    pub match_id: u64,
    pub phase: String,
    pub home: String,
    pub away: String,
    pub kick_off: u64,

    pub result: ResultStatus,

    // 75% of stake goes here
    pub match_prize_pool: u128,

    pub has_bets: bool,
    pub participants: Vec<ActorId>,

    pub total_winner_stake: u128,

    pub total_claimed: u128,
    pub settlement_prepared: bool,
    pub dust_swept: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Bet {
    pub user: ActorId,
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct UserBetRecord {
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct UserBetView {
    pub match_id: u64,
    pub score: Score,
    pub penalty_winner: Option<PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub claimed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PodiumPick {
    pub champion: String,
    pub runner_up: String,
    pub third_place: String,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PodiumResult {
    pub champion: String,
    pub runner_up: String,
    pub third_place: String,
}

fn outcome(score: Score) -> i8 {
    // 1 = home win, 0 = draw, -1 = away win
    if score.home > score.away {
        1
    } else if score.home < score.away {
        -1
    } else {
        0
    }
}


fn advance_outcome(score: Score, pen: Option<PenaltyWinner>) -> i8 {
    if score.home > score.away {
        1
    } else if score.home < score.away {
        -1
    } else {
        match pen.expect("Penalty winner required on draw") {
            PenaltyWinner::Home => 1,
            PenaltyWinner::Away => -1,
        }
    }
}

fn is_knockout(points_weight: u32) -> bool {
    points_weight > 1
}

fn eligible_for_payout(
    bet_score: Score,
    bet_penalty_winner: Option<PenaltyWinner>,
    final_score: Score,
    final_penalty_winner: Option<PenaltyWinner>,
    phase_weight: u32,
) -> bool {
    let knockout = is_knockout(phase_weight);
    let draw_final = final_score.home == final_score.away;

    // Exact score eligibility (requires penalties correct too if draw+knockout)
    if bet_score == final_score {
        if knockout && draw_final {
            return bet_penalty_winner.is_some() && bet_penalty_winner == final_penalty_winner;
        }
        return true;
    }

    // Group: classic win/draw/loss
    if !knockout {
        return outcome(bet_score) == outcome(final_score);
    }

    // ✅ Knockout: "outcome" means who advances
    let final_adv = advance_outcome(final_score, final_penalty_winner);

    // What did the bettor imply?
    // - If they predicted a draw, their "advance" is determined by their penalty_winner
    // - If they predicted non-draw, their "advance" is determined by win/loss in their score
    let bet_adv = if bet_score.home == bet_score.away {
        if bet_penalty_winner.is_none() {
            return false;
        }
        advance_outcome(bet_score, bet_penalty_winner)
    } else {
        outcome(bet_score) // 1 or -1
    };

    bet_adv == final_adv
}

#[derive(Debug, Clone, Default)]
pub struct SmartCupState {
    pub admin: ActorId,
    pub final_prize_distributor: ActorId,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,

    pub matches: SailsHashMap<u64, Match>,
    pub phases: SailsHashMap<String, PhaseConfig>,

    pub user_points: SailsHashMap<ActorId, u32>,

    // (user, match) -> bet
    pub bets: SailsHashMap<(ActorId, u64), Bet>,

    pub user_bets: SailsHashMap<ActorId, Vec<UserBetRecord>>,

    pub next_match_id: u64,

    // Podium
    pub podium_picks: SailsHashMap<ActorId, PodiumPick>,
    pub podium_result: Option<PodiumResult>,
    pub podium_finalized: bool,
    pub r32_lock_time: Option<u64>,

    // Oracle allowlist
    pub authorized_oracles: SailsHashMap<ActorId, bool>,
}

impl SmartCupState {
    pub fn init(admin: ActorId, final_prize_distributor: ActorId) {
        unsafe {
            SMARTCUP_STATE = Some(Self {
                admin,
                final_prize_distributor,
                ..Default::default()
            })
        }
    }

    pub fn state_mut() -> &'static mut SmartCupState {
        let s = unsafe { SMARTCUP_STATE.as_mut() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    pub fn state_ref() -> &'static SmartCupState {
        let s = unsafe { SMARTCUP_STATE.as_ref() };
        debug_assert!(s.is_some(), "State not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    fn only_admin(&self) {
        if msg::source() != self.admin {
            panic!("Only admin");
        }
    }

    fn only_oracle(&self) {
        let caller = msg::source();
        if self.authorized_oracles.get(&caller).cloned().unwrap_or(false) != true {
            panic!("Only authorized oracle");
        }
    }
}

#[event]
#[derive(Debug, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum SmartCupEvent {
    PhaseRegistered(String),
    MatchRegistered(u64, String, String, String, u64),
    OracleAuthorized(ActorId, bool),
    BetAccepted(ActorId, u64, Score, Option<PenaltyWinner>, u128),
    ResultProposed(u64, Score, Option<PenaltyWinner>, ActorId),
    ResultFinalized(u64, Score, Option<PenaltyWinner>),
    SettlementPrepared(u64, u128),
    PointsAwarded(ActorId, u64, u32),
    MatchRewardClaimed(u64, ActorId, u128),
    MatchDustSwept(u64, u128),
    PodiumPickSubmitted(ActorId, String, String, String),
    PodiumFinalized(String, String, String),
    PodiumBonusAwarded(ActorId, u32),
    FinalPrizeSent(u128, ActorId),
    ProtocolFeesWithdrawn(u128, ActorId),
    AdminChanged(ActorId, ActorId),
}

#[derive(Debug, Encode, Decode, TypeInfo, Clone)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoSmartCupState {
    pub admin: ActorId,
    pub final_prize_distributor: ActorId,

    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,

    pub matches: Vec<Match>,
    pub phases: Vec<PhaseConfig>,

    pub user_points: Vec<(ActorId, u32)>,

    pub podium_finalized: bool,
    pub r32_lock_time: Option<u64>,
}

impl From<SmartCupState> for IoSmartCupState {
    fn from(state: SmartCupState) -> Self {
        Self {
            admin: state.admin,
            final_prize_distributor: state.final_prize_distributor,

            protocol_fee_accumulated: state.protocol_fee_accumulated,
            final_prize_accumulated: state.final_prize_accumulated,

            matches: state.matches.values().cloned().collect(),
            phases: state.phases.values().cloned().collect(),

            user_points: state
                .user_points
                .iter()
                .map(|(id, pts)| (*id, *pts))
                .collect(),

            podium_finalized: state.podium_finalized,
            r32_lock_time: state.r32_lock_time,
        }
    }
}

#[derive(Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Self
    }

    pub fn seed(final_prize_distributor: ActorId) {
        SmartCupState::init(msg::source(), final_prize_distributor)
    }
}

#[sails_rs::service(events = SmartCupEvent)]
impl Service {
    #[export]
    pub fn set_oracle_authorized(&mut self, oracle: ActorId, authorized: bool) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        state.authorized_oracles.insert(oracle, authorized);

        self.emit_event(SmartCupEvent::OracleAuthorized(oracle, authorized))
            .expect("event");
        SmartCupEvent::OracleAuthorized(oracle, authorized)
    }

    #[export]
    pub fn register_phase(
        &mut self,
        phase_name: String,
        start_time: u64,
        end_time: u64,
        points_weight: u32,
    ) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.phases.contains_key(&phase_name) {
            panic!("Duplicate phase");
        }
        if points_weight == 0 {
            panic!("Invalid points weight");
        }

        let phase = PhaseConfig {
            name: phase_name.clone(),
            start_time,
            end_time,
            points_weight,
        };
        state.phases.insert(phase_name.clone(), phase);

        self.emit_event(SmartCupEvent::PhaseRegistered(phase_name.clone()))
            .expect("event");
        SmartCupEvent::PhaseRegistered(phase_name)
    }

    #[export]
    pub fn register_match(
        &mut self,
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    ) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if !state.phases.contains_key(&phase) {
            panic!("Phase not found");
        }

        let match_id = state.next_match_id.saturating_add(1);
        state.next_match_id = match_id;

        if phase == "Round of 32" {
            match state.r32_lock_time {
                None => state.r32_lock_time = Some(kick_off),
                Some(t) => {
                    if kick_off < t {
                        state.r32_lock_time = Some(kick_off);
                    }
                }
            }
        }

        let m = Match {
            match_id,
            phase: phase.clone(),
            home: home.clone(),
            away: away.clone(),
            kick_off,
            result: ResultStatus::Unresolved,
            match_prize_pool: 0,
            has_bets: false,
            participants: Vec::new(),

            total_winner_stake: 0,
            total_claimed: 0,
            settlement_prepared: false,
            dust_swept: false,
        };

        state.matches.insert(match_id, m);

        self.emit_event(SmartCupEvent::MatchRegistered(
            match_id,
            phase.clone(),
            home.clone(),
            away.clone(),
            kick_off,
        ))
        .expect("event");

        SmartCupEvent::MatchRegistered(match_id, phase, home, away, kick_off)
    }

    #[export]
    pub fn place_bet(
        &mut self,
        match_id: u64,
        predicted_score: Score,
        predicted_penalty_winner: Option<PenaltyWinner>,
    ) -> SmartCupEvent {
        let state = SmartCupState::state_mut();

        let bettor = msg::source();
        let sent_value = msg::value(); // VARA
        let now = exec::block_timestamp();

        let m = state.matches.get_mut(&match_id).expect("Match not found");

        // strict close window: 10 minutes before kickoff
        let close_time = m.kick_off.saturating_sub(BET_CLOSE_WINDOW_SECONDS);
        if now >= close_time {
            panic!("Betting closed");
        }
        if state.bets.contains_key(&(bettor, match_id)) {
            panic!("Already bet");
        }
        if predicted_score.home > 20 || predicted_score.away > 20 {
            panic!("Score too high");
        }

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);
        let knockout = is_knockout(phase_weight);

        // ✅ User bet penalty rules:
        // Group: penalty winner MUST be None
        // Knockout:
        //   - if predicted draw: penalty winner REQUIRED
        //   - if predicted non-draw: penalty winner MUST be None
        let predicted_draw = predicted_score.home == predicted_score.away;

        if !knockout {
            if predicted_penalty_winner.is_some() {
                panic!("Penalty winner not allowed in group stage");
            }
        } else {
            if predicted_draw {
                if predicted_penalty_winner.is_none() {
                    panic!("Knockout draw requires penalty winner");
                }
            } else {
                if predicted_penalty_winner.is_some() {
                    panic!("Penalty winner only allowed when predicting draw");
                }
            }
        }

        let protocol_fee = sent_value.saturating_mul(PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        let final_prize_cut = sent_value.saturating_mul(FINAL_PRIZE_BPS) / BPS_DENOMINATOR;
        let match_pool_cut = sent_value
            .saturating_sub(protocol_fee)
            .saturating_sub(final_prize_cut);

        state.protocol_fee_accumulated = state.protocol_fee_accumulated.saturating_add(protocol_fee);
        state.final_prize_accumulated = state.final_prize_accumulated.saturating_add(final_prize_cut);

        m.match_prize_pool = m.match_prize_pool.saturating_add(match_pool_cut);
        m.has_bets = true;
        if !m.participants.contains(&bettor) {
            m.participants.push(bettor);
        }

        // Store bet
        let bet = Bet {
            user: bettor,
            match_id,
            score: predicted_score,
            penalty_winner: predicted_penalty_winner,
            stake_in_match_pool: match_pool_cut,
            claimed: false,
        };
        state.bets.insert((bettor, match_id), bet);

        // Store user bet history (UI)
        let list = state.user_bets.entry(bettor).or_insert(Vec::new());
        list.push(UserBetRecord {
            match_id,
            score: predicted_score,
            penalty_winner: predicted_penalty_winner,
            stake_in_match_pool: match_pool_cut,
        });

        self.emit_event(SmartCupEvent::BetAccepted(
            bettor,
            match_id,
            predicted_score,
            predicted_penalty_winner,
            match_pool_cut,
        ))
        .expect("event");

        SmartCupEvent::BetAccepted(
            bettor,
            match_id,
            predicted_score,
            predicted_penalty_winner,
            match_pool_cut,
        )
    }

    #[export]
    pub fn propose_result(
        &mut self,
        match_id: u64,
        final_score: Score,
        penalty_winner: Option<PenaltyWinner>,
    ) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_oracle();

        let oracle = msg::source();
        let m = state.matches.get_mut(&match_id).expect("No such match");

        match &m.result {
            ResultStatus::Unresolved => {
                m.result = ResultStatus::Proposed {
                    score: final_score,
                    penalty_winner,
                    oracle,
                };
            }
            _ => panic!("Result already proposed/finalized"),
        }

        self.emit_event(SmartCupEvent::ResultProposed(match_id, final_score, penalty_winner, oracle))
            .expect("event");
        SmartCupEvent::ResultProposed(match_id, final_score, penalty_winner, oracle)
    }

    #[export]
    pub fn finalize_result(&mut self, match_id: u64) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let m = state.matches.get_mut(&match_id).expect("No such match");

        let (final_score, final_penalty_winner) = match &m.result {
            ResultStatus::Proposed {
                score,
                penalty_winner,
                oracle: _,
            } => (*score, *penalty_winner),
            _ => panic!("Not proposed or already finalized"),
        };

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);
        let knockout = is_knockout(phase_weight);

        // Result validation:
        let draw_final = final_score.home == final_score.away;
        if knockout {
            if draw_final && final_penalty_winner.is_none() {
                panic!("Knockout draw result requires penalty winner");
            }
            if !draw_final && final_penalty_winner.is_some() {
                panic!("Penalty winner should be None when final score is not a draw");
            }
        } else {
            if final_penalty_winner.is_some() {
                panic!("Group stage must not include penalty winner");
            }
        }

        m.result = ResultStatus::Finalized {
            score: final_score,
            penalty_winner: final_penalty_winner,
        };

        
        let final_outcome = if knockout {
            advance_outcome(final_score, final_penalty_winner)
        } else {
            outcome(final_score)
        };

        for participant in m.participants.iter() {
            if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                let mut added_points: u32 = 0;

                let bet_outcome = if knockout {
                    if bet.score.home == bet.score.away {
                        if bet.penalty_winner.is_none() {
                            
                            0
                        } else {
                            advance_outcome(bet.score, bet.penalty_winner)
                        }
                    } else {
                        outcome(bet.score) // 1 or -1
                    }
                } else {
                    outcome(bet.score)
                };

                let penalties_correct = if knockout && draw_final {
                    bet.penalty_winner.is_some() && bet.penalty_winner == final_penalty_winner
                } else {
                    true
                };

                if bet.score == final_score && penalties_correct {
                    added_points = 3u32.saturating_mul(phase_weight);
                } else {
                    // outcome points
                    if bet_outcome == final_outcome {
                        // In knockout final draw case, bet_outcome already encodes "who advances";
                        // for a draw-prediction bet, that required having penalty_winner.
                        added_points = phase_weight;
                    }
                }

                if added_points > 0 {
                    let pts = state.user_points.entry(*participant).or_insert(0);
                    *pts = pts.saturating_add(added_points);

                    self.emit_event(SmartCupEvent::PointsAwarded(*participant, match_id, added_points))
                        .expect("event");
                }
            }
        }

        self.emit_event(SmartCupEvent::ResultFinalized(match_id, final_score, final_penalty_winner))
            .expect("event");
        SmartCupEvent::ResultFinalized(match_id, final_score, final_penalty_winner)
    }

    #[export]
    pub fn prepare_match_settlement(&mut self, match_id: u64) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        let m = state.matches.get_mut(&match_id).expect("No such match");

        if m.settlement_prepared {
            panic!("Settlement already prepared");
        }

        let (final_score, final_penalty_winner) = match m.result {
            ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
            _ => panic!("Match not finalized"),
        };

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);

        // Determine eligible stake (exact score OR correct outcome)
        let mut total_winner_stake: u128 = 0;
        for participant in m.participants.iter() {
            if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                let eligible = eligible_for_payout(
                    bet.score,
                    bet.penalty_winner,
                    final_score,
                    final_penalty_winner,
                    phase_weight,
                );

                if eligible {
                    total_winner_stake = total_winner_stake.saturating_add(bet.stake_in_match_pool);
                }
            }
        }

        // No eligible winners => roll entire match pool to final prize immediately
        if total_winner_stake == 0 {
            state.final_prize_accumulated = state
                .final_prize_accumulated
                .saturating_add(m.match_prize_pool);

            m.match_prize_pool = 0;
            m.total_winner_stake = 0;
            m.total_claimed = 0;
            m.settlement_prepared = true;
            m.dust_swept = true;

            self.emit_event(SmartCupEvent::SettlementPrepared(match_id, 0))
                .expect("event");
            return SmartCupEvent::SettlementPrepared(match_id, 0);
        }

        m.total_winner_stake = total_winner_stake;
        m.total_claimed = 0;
        m.settlement_prepared = true;

        self.emit_event(SmartCupEvent::SettlementPrepared(match_id, total_winner_stake))
            .expect("event");
        SmartCupEvent::SettlementPrepared(match_id, total_winner_stake)
    }

    
    #[export]
    pub fn claim_match_reward(&mut self, match_id: u64) -> SmartCupEvent {
        let state = SmartCupState::state_mut();

        let caller = msg::source();
        let m = state.matches.get_mut(&match_id).expect("No such match");

        if !m.settlement_prepared {
            panic!("Settlement not prepared");
        }
        if m.match_prize_pool == 0 || m.total_winner_stake == 0 {
            panic!("No rewards for this match");
        }

        let bet = state
            .bets
            .get_mut(&(caller, match_id))
            .expect("No bet for this match");

        if bet.claimed {
            panic!("Already claimed");
        }

        let (final_score, final_penalty_winner) = match m.result {
            ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
            _ => panic!("Match not finalized"),
        };

        let phase_weight = state
            .phases
            .get(&m.phase)
            .map(|p| p.points_weight)
            .unwrap_or(1);

        // Exact score OR correct outcome
        let eligible = eligible_for_payout(
            bet.score,
            bet.penalty_winner,
            final_score,
            final_penalty_winner,
            phase_weight,
        );

        if !eligible {
            panic!("Not eligible for payout");
        }

        
        let share = bet
            .stake_in_match_pool
            .saturating_mul(m.match_prize_pool)
            / m.total_winner_stake;

        if share == 0 {
            bet.claimed = true;
            panic!("Zero payout");
        }

        bet.claimed = true;
        m.total_claimed = m.total_claimed.saturating_add(share);

        msg::send_with_gas(caller, (), 0, share)
            .unwrap_or_else(|_| panic!("Failed to send value to caller - this should never happen"));

        self.emit_event(SmartCupEvent::MatchRewardClaimed(match_id, caller, share))
            .expect("event");
        SmartCupEvent::MatchRewardClaimed(match_id, caller, share)
    }

    #[export]
    pub fn sweep_match_dust_to_final_prize(&mut self, match_id: u64) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        let m = state.matches.get_mut(&match_id).expect("No such match");

        if !m.settlement_prepared {
            panic!("Settlement not prepared");
        }
        if m.dust_swept {
            panic!("Dust already swept");
        }

        if m.match_prize_pool == 0 {
            m.dust_swept = true;
            self.emit_event(SmartCupEvent::MatchDustSwept(match_id, 0))
                .expect("event");
            return SmartCupEvent::MatchDustSwept(match_id, 0);
        }

       
        let dust = m.match_prize_pool.saturating_sub(m.total_claimed);

      
        state.final_prize_accumulated = state.final_prize_accumulated.saturating_add(dust);

        m.match_prize_pool = 0;
        m.dust_swept = true;

        self.emit_event(SmartCupEvent::MatchDustSwept(match_id, dust))
            .expect("event");
        SmartCupEvent::MatchDustSwept(match_id, dust)
    }

    #[export]
    pub fn submit_podium_pick(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        let user = msg::source();
        let now = exec::block_timestamp();

        let lock = state.r32_lock_time.expect("R32 lock time not set");
        if now >= lock {
            panic!("Podium picks locked");
        }
        if state.podium_picks.contains_key(&user) {
            panic!("Podium pick already submitted");
        }

        state.podium_picks.insert(
            user,
            PodiumPick {
                champion: champion.clone(),
                runner_up: runner_up.clone(),
                third_place: third_place.clone(),
            },
        );

        self.emit_event(SmartCupEvent::PodiumPickSubmitted(
            user,
            champion.clone(),
            runner_up.clone(),
            third_place.clone(),
        ))
        .expect("event");

        SmartCupEvent::PodiumPickSubmitted(user, champion, runner_up, third_place)
    }

    #[export]
    pub fn finalize_podium(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) -> Vec<SmartCupEvent> {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.podium_finalized {
            panic!("Already finalized");
        }

        state.podium_finalized = true;
        state.podium_result = Some(PodiumResult {
            champion: champion.clone(),
            runner_up: runner_up.clone(),
            third_place: third_place.clone(),
        });

        let mut events = Vec::new();
        events.push(SmartCupEvent::PodiumFinalized(
            champion.clone(),
            runner_up.clone(),
            third_place.clone(),
        ));

        for (user, pick) in state.podium_picks.iter() {
            let mut bonus: u32 = 0;

            if pick.champion == champion {
                bonus = bonus.saturating_add(20);
            }
            if pick.runner_up == runner_up {
                bonus = bonus.saturating_add(10);
            }
            if pick.third_place == third_place {
                bonus = bonus.saturating_add(5);
            }

            if bonus > 0 {
                let pts = state.user_points.entry(*user).or_insert(0);
                *pts = pts.saturating_add(bonus);
                events.push(SmartCupEvent::PodiumBonusAwarded(*user, bonus));
            }
        }

        events
    }

    #[export]
    pub fn send_final_prize(&mut self) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let to = state.final_prize_distributor;
        let amt = state.final_prize_accumulated;

        if amt == 0 {
            panic!("No final prize");
        }

        state.final_prize_accumulated = 0;

        // native VARA transfer
        msg::send(to, (), amt).expect("Final prize transfer failed");

        self.emit_event(SmartCupEvent::FinalPrizeSent(amt, to))
            .expect("event");
        SmartCupEvent::FinalPrizeSent(amt, to)
    }

    #[export]
    pub fn withdraw_protocol_fees(&mut self) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let to = state.admin;
        let amt = state.protocol_fee_accumulated;

        if amt == 0 {
            panic!("No protocol fees");
        }

        state.protocol_fee_accumulated = 0;

        msg::send(to, (), amt).expect("Fee transfer failed");

        self.emit_event(SmartCupEvent::ProtocolFeesWithdrawn(amt, to))
            .expect("event");
        SmartCupEvent::ProtocolFeesWithdrawn(amt, to)
    }

    #[export]
    pub fn change_admin(&mut self, new_admin: ActorId) -> SmartCupEvent {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if new_admin == ActorId::zero() {
            panic!("Invalid new admin");
        }

        let old = state.admin;
        state.admin = new_admin;

        self.emit_event(SmartCupEvent::AdminChanged(old, new_admin))
            .expect("event");

        SmartCupEvent::AdminChanged(old, new_admin)
    }

    #[export]
    pub fn query_match(&self, match_id: u64) -> Option<Match> {
        SmartCupState::state_ref().matches.get(&match_id).cloned()
    }

    #[export]
    pub fn query_user_points(&self, user: ActorId) -> u32 {
        SmartCupState::state_ref()
            .user_points
            .get(&user)
            .cloned()
            .unwrap_or(0)
    }

    #[export]
    pub fn query_matches_by_phase(&self, phase: String) -> Vec<Match> {
        let state = SmartCupState::state_ref();
        state
            .matches
            .values()
            .filter(|m| m.phase == phase)
            .cloned()
            .collect()
    }

    #[export]
    pub fn query_state(&self) -> IoSmartCupState {
        SmartCupState::state_ref().clone().into()
    }

    #[export]
    pub fn query_wallet_claim_status(&self, wallet: ActorId) -> WalletClaimStatus {
        let state = SmartCupState::state_ref();

        let records = match state.user_bets.get(&wallet) {
            Some(v) => v,
            None => {
                return WalletClaimStatus {
                    wallet,
                    amount_claimable: 0,
                    already_claimed: true,
                };
            }
        };

        let mut total_claimable: u128 = 0;
        let mut has_unclaimed_eligible = false;

        for r in records.iter() {
            let m = match state.matches.get(&r.match_id) {
                Some(m) => m,
                None => continue,
            };

            if !m.settlement_prepared || m.match_prize_pool == 0 || m.total_winner_stake == 0 {
                continue;
            }

            let bet = match state.bets.get(&(wallet, r.match_id)) {
                Some(b) => b,
                None => continue,
            };

            if bet.claimed {
                continue;
            }

            let (final_score, final_penalty_winner) = match m.result {
                ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
                _ => continue,
            };

            let phase_weight = state
                .phases
                .get(&m.phase)
                .map(|p| p.points_weight)
                .unwrap_or(1);

            let eligible = eligible_for_payout(
                bet.score,
                bet.penalty_winner,
                final_score,
                final_penalty_winner,
                phase_weight,
            );

            if !eligible {
                continue;
            }

            let claimable = bet
                .stake_in_match_pool
                .saturating_mul(m.match_prize_pool)
                / m.total_winner_stake;

            if claimable > 0 {
                total_claimable = total_claimable.saturating_add(claimable);
                has_unclaimed_eligible = true;
            }
        }

        WalletClaimStatus {
            wallet,
            amount_claimable: total_claimable,
            already_claimed: !has_unclaimed_eligible,
        }
    }

    #[export]
    pub fn query_bets_by_user(&self, user: ActorId) -> Vec<UserBetView> {
        let state = SmartCupState::state_ref();

        let records = match state.user_bets.get(&user) {
            Some(v) => v,
            None => return Vec::new(),
        };

        let mut out = Vec::with_capacity(records.len());
        for r in records.iter() {
            let claimed = state
                .bets
                .get(&(user, r.match_id))
                .map(|b| b.claimed)
                .unwrap_or(false);

            out.push(UserBetView {
                match_id: r.match_id,
                score: r.score,
                penalty_winner: r.penalty_winner,
                stake_in_match_pool: r.stake_in_match_pool,
                claimed,
            });
        }
        out
    }
}