use bolao_program::client::{
    service::Service as BolaoSvc, // trait — needed for method dispatch
    Score,
};
use sails_rs::prelude::*;

mod fixture;
#[allow(dead_code)]
mod utils;

use fixture::{actor, Fixture, ADMIN, NEW_ADMIN, ORACLE, STRANGER, USER1};
use utils::{AWAY_TEAM, BET_5_VARA, GROUP_PHASE, HOME_TEAM, KICK_OFF, ONE_VARA};

// ── Helper: register a phase + one match, returns match_id = 1 ───────────────

async fn setup_phase_and_match(f: &Fixture) -> u64 {
    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();

    1 // first match_id is always 1
}

// ── Test 1 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn deploy_and_query_state() {
    let f = Fixture::new().await;

    let state = f.program.service("Service").query_state().query().unwrap();

    assert_eq!(state.admin, actor(ADMIN));
    assert_eq!(state.protocol_fee_accumulated, 0);
    assert_eq!(state.final_prize_accumulated, 0);
    assert!(state.matches.is_empty());
    assert!(state.phases.is_empty());
    assert!(!state.podium_finalized);
    assert!(!state.final_prize_finalized);
}

// ── Test 2 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn set_oracle_authorized() {
    let f = Fixture::new().await;

    // Stranger cannot authorize an oracle.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await;
    assert!(err.is_err(), "non-admin should not authorize oracle");

    // Admin authorizes oracle.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    // Admin can also revoke.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), false)
        .await
        .expect("revoking oracle should succeed");
}

// ── Test 3 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_phase_happy_path() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.phases.len(), 1);
    assert_eq!(state.phases[0].name, GROUP_PHASE);
    assert_eq!(state.phases[0].points_weight, 1);
}

// ── Test 4 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_phase_validations() {
    let f = Fixture::new().await;

    // Weight = 0 → error.
    let err = f
        .program
        .service("Service")
        .register_phase("Phase A".to_string(), 0, 100, 0)
        .await;
    assert!(err.is_err(), "weight 0 should be rejected");

    // Weight > MAX_POINTS_WEIGHT (20) → error.
    let err = f
        .program
        .service("Service")
        .register_phase("Phase B".to_string(), 0, 100, 21)
        .await;
    assert!(err.is_err(), "weight > 20 should be rejected");

    // Valid registration.
    f.program
        .service("Service")
        .register_phase("Phase C".to_string(), 0, 100, 1)
        .await
        .unwrap();

    // Duplicate phase name → error.
    let err = f
        .program
        .service("Service")
        .register_phase("Phase C".to_string(), 0, 200, 1)
        .await;
    assert!(err.is_err(), "duplicate phase should be rejected");

    // Stranger cannot register a phase.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_phase("Phase D".to_string(), 0, 100, 1)
        .await;
    assert!(err.is_err(), "non-admin should not register phase");
}

// ── Test 5 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_match_happy_path() {
    let f = Fixture::new().await;

    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    f.program
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await
        .unwrap();

    let m = f
        .program
        .service("Service")
        .query_match(1)
        .query()
        .unwrap()
        .expect("match 1 should exist");

    assert_eq!(m.match_id, 1);
    assert_eq!(m.home, HOME_TEAM);
    assert_eq!(m.away, AWAY_TEAM);
    assert_eq!(m.kick_off, KICK_OFF);
    assert!(!m.has_bets);
}

// ── Test 6 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_match_validations() {
    let f = Fixture::new().await;

    // Cannot register a match for an unknown phase.
    let err = f
        .program
        .service("Service")
        .register_match(
            "Unknown Phase".to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await;
    assert!(err.is_err(), "unknown phase should be rejected");

    // Stranger cannot register a match.
    f.program
        .service("Service")
        .register_phase(GROUP_PHASE.to_string(), 0, u64::MAX, 1)
        .await
        .unwrap();

    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .register_match(
            GROUP_PHASE.to_string(),
            HOME_TEAM.to_string(),
            AWAY_TEAM.to_string(),
            KICK_OFF,
        )
        .await;
    assert!(err.is_err(), "non-admin should not register match");
}

// ── Test 7 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn propose_result_access_control() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 2, away: 1 };

    // Unauthorized user cannot propose.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .propose_result(match_id, score.clone(), None)
        .await;
    assert!(err.is_err(), "non-oracle should not propose result");

    // Authorize oracle, then propose successfully.
    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, score.clone(), None)
        .await
        .expect("authorized oracle should propose successfully");

    let m = f
        .program
        .service("Service")
        .query_match(match_id)
        .query()
        .unwrap()
        .unwrap();

    // Result should now be Proposed (non-Unresolved).
    use bolao_program::client::ResultStatus;
    assert!(
        !matches!(m.result, ResultStatus::Unresolved),
        "result should be Proposed after oracle submission"
    );
}

// ── Test 8 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_proposed_result() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    let wrong_score = Score { home: 0, away: 0 };

    // Oracle submits wrong result.
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, wrong_score, None)
        .await
        .unwrap();

    // Admin cancels the proposal.
    f.program
        .service("Service")
        .cancel_proposed_result(match_id)
        .await
        .expect("admin should be able to cancel proposed result");

    // Oracle re-proposes with correct score.
    let correct_score = Score { home: 2, away: 1 };
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, correct_score, None)
        .await
        .expect("oracle should re-propose after cancellation");
}

// ── Test 9 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn full_match_flow_with_winner() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    let score = Score { home: 2, away: 1 };

    // USER1 places a correct bet: 2-1.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .expect("USER1 place_bet should succeed");

    // Oracle proposes 2-1.
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, score, None)
        .await
        .unwrap();

    // Admin finalizes — USER1 gets 3 pts (exact score, group phase weight=1).
    f.program
        .service("Service")
        .finalize_result(match_id)
        .await
        .expect("finalize_result should succeed");

    let pts = f
        .program
        .service("Service")
        .query_user_points(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pts, 3, "exact score in group phase should award 3 points");

    // Admin prepares settlement.
    f.program
        .service("Service")
        .prepare_match_settlement(match_id)
        .await
        .expect("prepare_match_settlement should succeed");

    // USER1 claims their match reward.
    f.as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await
        .expect("USER1 claim_match_reward should succeed");

    // Second claim attempt must fail.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await;
    assert!(err.is_err(), "double-claim should be rejected");
}

// ── Test 10 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn place_bet_validations() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    let score = Score { home: 1, away: 0 };

    // Bet below minimum → error.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(ONE_VARA) // 1 VARA < 3 VARA minimum
        .await;
    assert!(err.is_err(), "bet below minimum should be rejected");

    // Valid first bet.
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score.clone(), None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Same user bets again on the same match → error.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .place_bet(match_id, score, None)
        .with_value(BET_5_VARA)
        .await;
    assert!(err.is_err(), "double bet should be rejected");
}

// ── Test 11 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn no_winner_settlement() {
    let f = Fixture::new().await;
    let match_id = setup_phase_and_match(&f).await;

    f.program
        .service("Service")
        .set_oracle_authorized(actor(ORACLE), true)
        .await
        .unwrap();

    let final_score = Score { home: 1, away: 0 }; // home wins

    // USER1 bets 0-2 — predicts away win (wrong outcome, not just wrong score).
    let wrong_outcome_score = Score { home: 0, away: 2 };
    f.as_actor(USER1)
        .service("Service")
        .place_bet(match_id, wrong_outcome_score, None)
        .with_value(BET_5_VARA)
        .await
        .unwrap();

    // Oracle proposes 1-0 (home win), admin finalizes.
    f.as_actor(ORACLE)
        .service("Service")
        .propose_result(match_id, final_score, None)
        .await
        .unwrap();
    f.program
        .service("Service")
        .finalize_result(match_id)
        .await
        .unwrap();

    // Wrong outcome (predicted away win, home won) → USER1 gets 0 points.
    let pts = f
        .program
        .service("Service")
        .query_user_points(actor(USER1))
        .query()
        .unwrap();
    assert_eq!(pts, 0, "wrong outcome prediction should give 0 points");

    // Settlement: no winners, prize pool goes to final_prize_accumulated.
    f.program
        .service("Service")
        .prepare_match_settlement(match_id)
        .await
        .expect("settlement with no winners should succeed");

    // USER1 (non-winner) cannot claim.
    let err = f
        .as_actor(USER1)
        .service("Service")
        .claim_match_reward(match_id)
        .await;
    assert!(err.is_err(), "non-winner should not claim match reward");
}

// ── Test 12 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn change_admin_two_step() {
    let f = Fixture::new().await;

    // Zero address rejected.
    let err = f
        .program
        .service("Service")
        .change_admin(ActorId::zero())
        .await;
    assert!(err.is_err(), "change_admin(zero) should be rejected");

    // Step 1: admin proposes new admin.
    f.program
        .service("Service")
        .change_admin(actor(NEW_ADMIN))
        .await
        .expect("change_admin should succeed");

    // Stranger cannot accept.
    let err = f
        .as_actor(STRANGER)
        .service("Service")
        .accept_admin()
        .await;
    assert!(err.is_err(), "stranger should not accept admin");

    // Step 2: proposed admin accepts.
    f.as_actor(NEW_ADMIN)
        .service("Service")
        .accept_admin()
        .await
        .expect("new admin accept should succeed");

    let state = f.program.service("Service").query_state().query().unwrap();
    assert_eq!(state.admin, actor(NEW_ADMIN));
    assert_ne!(state.admin, actor(ADMIN));
}
