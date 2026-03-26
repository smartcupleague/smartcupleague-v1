#![allow(static_mut_refs)]

use sails_rs::{
    prelude::*,
    gstd::{exec, msg},
};
use sails_rs::collections::HashMap as SailsHashMap;

const PROTOCOL_FEE_BPS: u128 = 500; // 5%
const FINAL_PRIZE_BPS: u128 = 1000; // 20%
const BPS_DENOMINATOR: u128 = 10_000;
const BET_CLOSE_WINDOW_SECONDS: u64 = 600; // 10 minutes
const FINAL_PRIZE_TOP5_BPS: [u128; 5] = [4500, 2500, 1500, 1000, 500];



pub static mut SMARTCUP_STATE: Option<SmartCupState> = None;



#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct FinalPrizeClaimStatus {
    pub wallet: ActorId,
    pub final_prize_finalized: bool,
    pub eligible: bool,
    pub amount_claimable: u128,
    pub already_claimed: bool,
    pub points: u32,
}

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

    if bet_score == final_score {
        if knockout && draw_final {
            return bet_penalty_winner.is_some() && bet_penalty_winner == final_penalty_winner;
        }
        return true;
    }

    
    if !knockout {
        return outcome(bet_score) == outcome(final_score);
    }

    let final_adv = advance_outcome(final_score, final_penalty_winner);

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

fn top5_share_sum_bps(start_pos: usize, end_pos_inclusive: usize) -> u128 {
    let mut total = 0u128;
    for pos in start_pos..=end_pos_inclusive {
        total = total.saturating_add(FINAL_PRIZE_TOP5_BPS[pos - 1]);
    }
    total
}

fn collect_leaderboard(state: &SmartCupState) -> Vec<(ActorId, u32)> {
    let mut wallets: Vec<ActorId> = Vec::new();

    for (wallet, _) in state.user_bets.iter() {
        wallets.push(*wallet);
    }

    for (wallet, _) in state.podium_picks.iter() {
        if !wallets.contains(wallet) {
            wallets.push(*wallet);
        }
    }

    let mut leaderboard: Vec<(ActorId, u32)> = wallets
        .into_iter()
        .filter(|wallet| {
            state
                .user_bets
                .get(wallet)
                .map(|bets| bets.iter().any(|b| b.stake_in_match_pool > 0))
                .unwrap_or(false)
        })
        .map(|wallet| {
            let points = state.user_points.get(&wallet).cloned().unwrap_or(0);
            (wallet, points)
        })
        .collect();

    leaderboard.sort_by(|a, b| b.1.cmp(&a.1));
    leaderboard
}


#[derive(Debug, Clone, Default)]
pub struct SmartCupState {
    pub admin: ActorId,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,
    pub matches: SailsHashMap<u64, Match>,
    pub phases: SailsHashMap<String, PhaseConfig>,
    pub user_points: SailsHashMap<ActorId, u32>,
    pub bets: SailsHashMap<(ActorId, u64), Bet>,
    pub user_bets: SailsHashMap<ActorId, Vec<UserBetRecord>>,
    pub next_match_id: u64,
    pub podium_picks: SailsHashMap<ActorId, PodiumPick>,
    pub podium_result: Option<PodiumResult>,
    pub podium_finalized: bool,
    pub r32_lock_time: Option<u64>,
    pub authorized_oracles: SailsHashMap<ActorId, bool>,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
    pub final_prize_allocations: SailsHashMap<ActorId, u128>,
    pub final_prize_claimed: SailsHashMap<ActorId, bool>,
}

impl SmartCupState {
    pub fn init(admin: ActorId) {
        unsafe {
            SMARTCUP_STATE = Some(Self {
                admin,
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
    FinalPrizePoolFinalized(u128, u128),
    FinalPrizeClaimed(ActorId, u128),
    FinalPrizeRoundingDustWithdrawn(u128, ActorId),
}

#[derive(Debug, Encode, Decode, TypeInfo, Clone)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoSmartCupState {
    pub admin: ActorId,
    pub protocol_fee_accumulated: u128,
    pub final_prize_accumulated: u128,
    pub matches: Vec<Match>,
    pub phases: Vec<PhaseConfig>,
    pub user_points: Vec<(ActorId, u32)>,
    pub podium_finalized: bool,
    pub r32_lock_time: Option<u64>,
    pub final_prize_finalized: bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust: u128,
}

impl From<SmartCupState> for IoSmartCupState {
    fn from(state: SmartCupState) -> Self {
        Self {
            admin: state.admin,
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
            final_prize_finalized: state.final_prize_finalized,
            final_prize_claimable_total: state.final_prize_claimable_total,
            final_prize_rounding_dust: state.final_prize_rounding_dust,
        }
    }
}

#[derive(Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Self
    }

    pub fn seed(admin: ActorId) {
        SmartCupState::init(admin)
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

        let close_time = m.kick_off.saturating_sub(BET_CLOSE_WINDOW_SECONDS);

        if sent_value == 0 {
            panic!("Bet amount must be greater than zero");
                            } 
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

      
        let bet = Bet {
            user: bettor,
            match_id,
            score: predicted_score,
            penalty_winner: predicted_penalty_winner,
            stake_in_match_pool: match_pool_cut,
            claimed: false,
        };
        state.bets.insert((bettor, match_id), bet);

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
                    
                    if bet_outcome == final_outcome {
                        
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
    pub fn finalize_final_prize_pool(&mut self) -> SmartCupEvent {
    let state = SmartCupState::state_mut();
    state.only_admin();

    if state.final_prize_finalized {
        panic!("Final prize already finalized");
    }

    if !state.podium_finalized {
        panic!("Podium not finalized");
    }

    {
        for m in state.matches.values() {
            match m.result {
                ResultStatus::Finalized { .. } => {}
                _ => panic!("Not all matches finalized"),
            }

            if !m.settlement_prepared {
                panic!("Not all match settlements prepared");
            }

            if !m.dust_swept {
                panic!("Not all match dust swept");
            }
        }
    }

    let pool = state.final_prize_accumulated;
    if pool == 0 {
        panic!("No final prize pool");
    }

    let leaderboard = collect_leaderboard(state);
    if leaderboard.is_empty() {
        panic!("No participants");
    }

    let mut i: usize = 0;
    let mut current_position: usize = 1;
    let mut total_allocated: u128 = 0;

    while i < leaderboard.len() && current_position <= 5 {
        let tied_points = leaderboard[i].1;
        let mut j = i + 1;

        while j < leaderboard.len() && leaderboard[j].1 == tied_points {
            j += 1;
        }

        let group_size = j - i;
        let start_pos = current_position;
        let end_pos = current_position + group_size - 1;
        let affected_end = end_pos.min(5);

        if start_pos <= 5 {
            let group_bps = top5_share_sum_bps(start_pos, affected_end);

            if group_bps > 0 {
                let group_amount = pool.saturating_mul(group_bps) / BPS_DENOMINATOR;
                let per_wallet = group_amount / (group_size as u128);

                if per_wallet > 0 {
                    for k in i..j {
                        let wallet = leaderboard[k].0;
                        state.final_prize_allocations.insert(wallet, per_wallet);
                        state.final_prize_claimed.insert(wallet, false);
                    }

                    total_allocated = total_allocated
                        .saturating_add(per_wallet.saturating_mul(group_size as u128));
                }
            }
        }

        current_position = current_position.saturating_add(group_size);
        i = j;
    }

    if total_allocated == 0 {
        panic!("Nothing allocated");
    }

    state.final_prize_finalized = true;
    state.final_prize_claimable_total = total_allocated;
    state.final_prize_rounding_dust = pool.saturating_sub(total_allocated);
    state.final_prize_accumulated = 0;

    self.emit_event(SmartCupEvent::FinalPrizePoolFinalized(
        total_allocated,
        state.final_prize_rounding_dust,
    ))
    .expect("event");

    SmartCupEvent::FinalPrizePoolFinalized(
        total_allocated,
        state.final_prize_rounding_dust,
    )
}

#[export]
pub fn claim_final_prize(&mut self) -> SmartCupEvent {
    let state = SmartCupState::state_mut();
    let caller = msg::source();

    if !state.final_prize_finalized {
        panic!("Final prize not finalized");
    }

    let already_claimed = state
        .final_prize_claimed
        .get(&caller)
        .cloned()
        .unwrap_or(false);

    if already_claimed {
        panic!("Final prize already claimed");
    }

    let amount = state
        .final_prize_allocations
        .get(&caller)
        .cloned()
        .unwrap_or(0);

    if amount == 0 {
        panic!("Not eligible for final prize");
    }

    state.final_prize_claimed.insert(caller, true);
    state.final_prize_claimable_total =
        state.final_prize_claimable_total.saturating_sub(amount);

    msg::send_with_gas(caller, (), 0, amount)
        .unwrap_or_else(|_| panic!("Failed to send final prize"));

    self.emit_event(SmartCupEvent::FinalPrizeClaimed(caller, amount))
        .expect("event");

    SmartCupEvent::FinalPrizeClaimed(caller, amount)
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
pub fn sweep_match_dust_to_final_prize(&mut self, match_id: u64) -> SmartCupEvent {
    let state = SmartCupState::state_mut();
    state.only_admin();

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
pub fn withdraw_final_prize_rounding_dust(&mut self) -> SmartCupEvent {
    let state = SmartCupState::state_mut();
    state.only_admin();

    if !state.final_prize_finalized {
        panic!("Final prize not finalized");
    }

    let amt = state.final_prize_rounding_dust;
    if amt == 0 {
        panic!("No final prize rounding dust");
    }

    let to = state.admin;
    state.final_prize_rounding_dust = 0;

    msg::send(to, (), amt).expect("Final prize rounding dust transfer failed");

    self.emit_event(SmartCupEvent::FinalPrizeRoundingDustWithdrawn(amt, to))
        .expect("event");

    SmartCupEvent::FinalPrizeRoundingDustWithdrawn(amt, to)
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

    #[export]
pub fn query_final_prize_claim_status(&self, wallet: ActorId) -> FinalPrizeClaimStatus {
    let state = SmartCupState::state_ref();

    let points = state.user_points.get(&wallet).cloned().unwrap_or(0);
    let allocated = state
        .final_prize_allocations
        .get(&wallet)
        .cloned()
        .unwrap_or(0);
    let already_claimed = state
        .final_prize_claimed
        .get(&wallet)
        .cloned()
        .unwrap_or(false);

    FinalPrizeClaimStatus {
        wallet,
        final_prize_finalized: state.final_prize_finalized,
        eligible: allocated > 0,
        amount_claimable: if already_claimed { 0 } else { allocated },
        already_claimed,
        points,
    }
}
}