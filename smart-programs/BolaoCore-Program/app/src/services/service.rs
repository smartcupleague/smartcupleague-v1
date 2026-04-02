use sails_rs::{prelude::*, gstd::{exec, msg}};

use super::constants::{
    PROTOCOL_FEE_BPS, FINAL_PRIZE_BPS, BPS_DENOMINATOR,
    BET_CLOSE_WINDOW_SECONDS, MIN_BET_PLANCK,
    MAX_PHASE_NAME_LEN, MAX_POINTS_WEIGHT, MAX_TEAM_NAME_LEN,
};
use super::types::{
    Score, PenaltyWinner, ResultStatus, Match, Bet, UserBetRecord,
    UserBetView, PhaseConfig, PodiumPick, PodiumResult,
    WalletClaimStatus, FinalPrizeClaimStatus,
};
use super::events::SmartCupEvent;
use super::state::{SmartCupState, IoSmartCupState};
use super::utils::{
    outcome, advance_outcome, is_knockout, eligible_for_payout,
    top5_share_sum_bps, collect_leaderboard,
};

// ── Service bootstrap ─────────────────────────────────────────────────────────

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

    // ── Admin: oracle management ──────────────────────────────────────────────

    #[export]
    pub fn set_oracle_authorized(&mut self, oracle: ActorId, authorized: bool) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        state.authorized_oracles.insert(oracle, authorized);

        self.emit_event(SmartCupEvent::OracleAuthorized(oracle, authorized))
            .expect("event");
    }

    // ── Admin: phase & match registration ────────────────────────────────────

    #[export]
    pub fn register_phase(
        &mut self,
        phase_name: String,
        start_time: u64,
        end_time: u64,
        points_weight: u32,
    ) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if phase_name.len() > MAX_PHASE_NAME_LEN {
            panic!("Phase name too long");
        }
        if state.phases.contains_key(&phase_name) {
            panic!("Duplicate phase");
        }
        if points_weight == 0 {
            panic!("Invalid points weight");
        }
       
        if points_weight > MAX_POINTS_WEIGHT {
            panic!("Points weight too large");
        }

        let phase = PhaseConfig {
            name: phase_name.clone(),
            start_time,
            end_time,
            points_weight,
        };
        state.phases.insert(phase_name.clone(), phase);

        self.emit_event(SmartCupEvent::PhaseRegistered(phase_name))
            .expect("event");
    }

    #[export]
    pub fn register_match(
        &mut self,
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    ) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if !state.phases.contains_key(&phase) {
            panic!("Phase not found");
        }

        if home.len() > MAX_TEAM_NAME_LEN || home.is_empty() {
            panic!("Invalid home team name length");
        }
        if away.len() > MAX_TEAM_NAME_LEN || away.is_empty() {
            panic!("Invalid away team name length");
        }

        if kick_off <= exec::block_timestamp() {
            panic!("kick_off must be in the future");
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
            phase,
            home,
            away,
            kick_off,
        ))
        .expect("event");
    }

    // ── Betting ───────────────────────────────────────────────────────────────

    #[export]
    pub fn place_bet(
        &mut self,
        match_id: u64,
        predicted_score: Score,
        predicted_penalty_winner: Option<PenaltyWinner>,
    ) {
        let state = SmartCupState::state_mut();

        let bettor = msg::source();
        let sent_value = msg::value();
        let now = exec::block_timestamp();

        let m = state.matches.get_mut(&match_id).expect("Match not found");

        if sent_value < MIN_BET_PLANCK {
            panic!("Bet below minimum");
        }

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

        state.protocol_fee_accumulated =
            state.protocol_fee_accumulated.saturating_add(protocol_fee);
        state.final_prize_accumulated =
            state.final_prize_accumulated.saturating_add(final_prize_cut);

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
    }

    // ── Oracle: result proposal ───────────────────────────────────────────────

    #[export]
    pub fn propose_result(
        &mut self,
        match_id: u64,
        final_score: Score,
        penalty_winner: Option<PenaltyWinner>,
    ) {
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

        self.emit_event(SmartCupEvent::ResultProposed(
            match_id,
            final_score,
            penalty_winner,
            oracle,
        ))
        .expect("event");
    }

    // ── Admin: cancel wrong oracle proposal ──────────────────────────────────
    #[export]
    pub fn cancel_proposed_result(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        let m = state.matches.get_mut(&match_id).expect("No such match");

        let oracle = match &m.result {
            ResultStatus::Proposed { oracle, .. } => *oracle,
            ResultStatus::Unresolved => panic!("No proposal to cancel"),
            ResultStatus::Finalized { .. } => panic!("Result already finalized — cannot cancel"),
        };

        m.result = ResultStatus::Unresolved;

        self.emit_event(SmartCupEvent::ResultProposalCancelled(match_id, oracle))
            .expect("event");
    }

    // ── Admin: result finalization ────────────────────────────────────────────

    #[export]
    pub fn finalize_result(&mut self, match_id: u64) {
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
                        outcome(bet.score)
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
                } else if bet_outcome == final_outcome {
                    added_points = phase_weight;
                }

                if added_points > 0 {
                    let pts = state.user_points.entry(*participant).or_insert(0);
                    *pts = pts.saturating_add(added_points);

                    self.emit_event(SmartCupEvent::PointsAwarded(
                        *participant,
                        match_id,
                        added_points,
                    ))
                    .expect("event");
                }
            }
        }

        self.emit_event(SmartCupEvent::ResultFinalized(
            match_id,
            final_score,
            final_penalty_winner,
        ))
        .expect("event");
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    #[export]
    pub fn prepare_match_settlement(&mut self, match_id: u64) {
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
                    total_winner_stake =
                        total_winner_stake.saturating_add(bet.stake_in_match_pool);
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
            return;
        }

        m.total_winner_stake = total_winner_stake;
        m.total_claimed = 0;
        m.settlement_prepared = true;

        self.emit_event(SmartCupEvent::SettlementPrepared(match_id, total_winner_stake))
            .expect("event");
    }

    #[export]
    pub fn claim_match_reward(&mut self, match_id: u64) {
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
            .checked_div(m.total_winner_stake)
            .expect("Division by zero: total_winner_stake is zero");

        if share == 0 {
            bet.claimed = true;
            panic!("Zero payout");
        }

        bet.claimed = true;
        m.total_claimed = m.total_claimed.saturating_add(share);

        msg::send_with_gas(caller, (), 0, share)
            .unwrap_or_else(|_| panic!("Failed to send reward"));

        self.emit_event(SmartCupEvent::MatchRewardClaimed(match_id, caller, share))
            .expect("event");
    }

    // ── Dust sweep ────────────────────────────────────────────────────────────

    #[export]
    pub fn sweep_match_dust_to_final_prize(&mut self, match_id: u64) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        
        {
            let m = state.matches.get(&match_id).expect("No such match");

            if !m.settlement_prepared {
                panic!("Settlement not prepared");
            }
            if m.dust_swept {
                panic!("Dust already swept");
            }

            if m.match_prize_pool > 0 {
                let (final_score, final_penalty_winner) = match m.result {
                    ResultStatus::Finalized { score, penalty_winner } => (score, penalty_winner),
                    _ => panic!("Match not finalized"),
                };
                let phase_weight = state
                    .phases
                    .get(&m.phase)
                    .map(|p| p.points_weight)
                    .unwrap_or(1);

                for participant in m.participants.iter() {
                    if let Some(bet) = state.bets.get(&(*participant, match_id)) {
                        if !bet.claimed
                            && eligible_for_payout(
                                bet.score,
                                bet.penalty_winner,
                                final_score,
                                final_penalty_winner,
                                phase_weight,
                            )
                        {
                            panic!("Unclaimed eligible bets remain — sweep after all winners have claimed");
                        }
                    }
                }
            }
        }

        let m = state.matches.get_mut(&match_id).expect("No such match");

        if m.match_prize_pool == 0 {
            m.dust_swept = true;
            self.emit_event(SmartCupEvent::MatchDustSwept(match_id, 0))
                .expect("event");
            return;
        }

        let dust = m.match_prize_pool.saturating_sub(m.total_claimed);
        state.final_prize_accumulated =
            state.final_prize_accumulated.saturating_add(dust);

        m.match_prize_pool = 0;
        m.dust_swept = true;

        self.emit_event(SmartCupEvent::MatchDustSwept(match_id, dust))
            .expect("event");
    }

    // ── Podium picks ──────────────────────────────────────────────────────────

    #[export]
    pub fn submit_podium_pick(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) {
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

        if champion.is_empty() || champion.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid champion name length");
        }
        if runner_up.is_empty() || runner_up.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid runner_up name length");
        }
        if third_place.is_empty() || third_place.len() > MAX_TEAM_NAME_LEN {
            panic!("Invalid third_place name length");
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
            champion,
            runner_up,
            third_place,
        ))
        .expect("event");
    }

    #[export]
    pub fn finalize_podium(
        &mut self,
        champion: String,
        runner_up: String,
        third_place: String,
    ) {
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

        self.emit_event(SmartCupEvent::PodiumFinalized(
            champion.clone(),
            runner_up.clone(),
            third_place.clone(),
        ))
        .expect("event");

        // Collect bonuses first to avoid borrowing state while mutating it.
        let bonuses: Vec<(ActorId, u32)> = state
            .podium_picks
            .iter()
            .filter_map(|(user, pick)| {
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
                if bonus > 0 { Some((*user, bonus)) } else { None }
            })
            .collect();

        for (user, bonus) in bonuses {
            let pts = state.user_points.entry(user).or_insert(0);
            *pts = pts.saturating_add(bonus);
            self.emit_event(SmartCupEvent::PodiumBonusAwarded(user, bonus))
                .expect("event");
        }
    }

    // ── Final prize pool ──────────────────────────────────────────────────────

    #[export]
    pub fn finalize_final_prize_pool(&mut self) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if state.final_prize_finalized {
            panic!("Final prize already finalized");
        }
        if !state.podium_finalized {
            panic!("Podium not finalized");
        }

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

            let group_size = j - i; // always >= 1 by loop invariant
            let start_pos = current_position;
            let end_pos = current_position + group_size - 1;
            let affected_end = end_pos.min(5);

            if start_pos <= 5 {
                let group_bps = top5_share_sum_bps(start_pos, affected_end);
                if group_bps > 0 {
                    let group_amount = pool.saturating_mul(group_bps) / BPS_DENOMINATOR;

                    let per_wallet = group_amount
                        .checked_div(group_size as u128)
                        .expect("Division by zero: group_size is zero");

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

        let dust = pool.saturating_sub(total_allocated);

        state.final_prize_finalized = true;
        state.final_prize_claimable_total = total_allocated;
        state.final_prize_accumulated = 0;

        if dust > 0 {
            let admin = state.admin;
            state.final_prize_rounding_dust = 0;
            msg::send(admin, (), dust).expect("Dust auto-sweep failed");
            self.emit_event(SmartCupEvent::FinalPrizeRoundingDustWithdrawn(dust, admin))
                .expect("event");
        } else {
            state.final_prize_rounding_dust = 0;
        }

        self.emit_event(SmartCupEvent::FinalPrizePoolFinalized(total_allocated, dust))
            .expect("event");
    }

    #[export]
    pub fn claim_final_prize(&mut self) {
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

        // CEI: update state BEFORE external send
        state.final_prize_claimed.insert(caller, true);
        state.final_prize_claimable_total =
            state.final_prize_claimable_total.saturating_sub(amount);

        msg::send_with_gas(caller, (), 0, amount)
            .unwrap_or_else(|_| panic!("Failed to send final prize"));

        self.emit_event(SmartCupEvent::FinalPrizeClaimed(caller, amount))
            .expect("event");
    }

    // ── Admin: withdrawals ────────────────────────────────────────────────────

    #[export]
    pub fn withdraw_protocol_fees(&mut self) {
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
    }

    #[export]
    pub fn withdraw_final_prize_rounding_dust(&mut self) {
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
    }

    /// Step 1 of 2-step admin transfer: proposes a new admin address.
    /// The proposed address must call accept_admin() to complete the transfer.
    #[export]
    pub fn change_admin(&mut self, new_admin: ActorId) {
        let state = SmartCupState::state_mut();
        state.only_admin();

        if new_admin == ActorId::zero() {
            panic!("Invalid new admin");
        }
        if new_admin == state.admin {
            panic!("Proposed admin is the same as current admin");
        }

        let old = state.admin;
        state.pending_admin = Some(new_admin);

        self.emit_event(SmartCupEvent::AdminProposed(old, new_admin))
            .expect("event");
    }

    /// Step 2 of 2-step admin transfer: pending admin confirms ownership.
    /// Must be called by the address previously set via change_admin().
    #[export]
    pub fn accept_admin(&mut self) {
        let state = SmartCupState::state_mut();
        let caller = msg::source();

        let pending = state.pending_admin.expect("No pending admin proposal");
        if caller != pending {
            panic!("Only the proposed admin can accept");
        }

        let old = state.admin;
        state.admin = pending;
        state.pending_admin = None;

        self.emit_event(SmartCupEvent::AdminChanged(old, pending))
            .expect("event");
    }

    // ── Queries ───────────────────────────────────────────────────────────────

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
                    already_claimed: false,
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
                .checked_div(m.total_winner_stake)
                .unwrap_or(0);

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
