use oracle_program::{
    client::{
        service::Service as OracleSvc, // trait — needed for method dispatch
        OracleCtors, OracleProgram,
        PenaltyWinner,
    },
    WASM_BINARY,
};
use sails_rs::{
    client::{GearEnv, GtestEnv},
    gtest::System,
    prelude::*,
};

mod fixture;
#[allow(dead_code)]
mod utils;

use fixture::{actor, Fixture, ADMIN, FEEDER_BASE, NEW_ADMIN, STRANGER};

// ── Test 1 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn deploy_and_query_state() {
    let f = Fixture::new().await;

    let state = f.oracle.service("Service").query_state().query().unwrap();

    assert_eq!(state.admin, actor(ADMIN));
    assert_eq!(state.consensus_threshold, 2); // DEFAULT_CONSENSUS_THRESHOLD
    assert!(state.authorized_feeders.is_empty());
    assert!(state.match_results.is_empty());
    assert!(state.pending_admin.is_none());
}

// ── Test 2 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn register_match_only_admin() {
    let f = Fixture::new().await;

    // Stranger cannot register a match.
    let err = f.as_actor(STRANGER).service("Service").register_match(1).await;
    assert!(err.is_err(), "non-admin should not register a match");

    // Admin can register.
    f.oracle.service("Service").register_match(1).await.unwrap();

    let pending = f.oracle.service("Service").query_pending_matches().query().unwrap();
    assert_eq!(pending, vec![1u64]);
}

// ── Test 3 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn submit_requires_registration() {
    let f = Fixture::new().await;

    // Authorize feeder 1.
    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 1), true)
        .await
        .unwrap();

    // Feeder tries to submit to an unregistered match → error.
    let err = f
        .as_actor(FEEDER_BASE + 1)
        .service("Service")
        .submit_result(99, 1, 0, None)
        .await;
    assert!(err.is_err(), "submit to unregistered match should fail");
}

// ── Test 4 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn consensus_happy_path() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    f.oracle.service("Service").register_match(1).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();

    // First feeder submits: 2-1, no penalty.
    f.as_actor(f1).service("Service").submit_result(1, 2, 1, None).await.unwrap();

    // Still pending (only 1 vote).
    let result = f.oracle.service("Service").query_match_result(1).query().unwrap();
    assert!(result.is_none(), "should still be pending after 1 vote");

    // Second feeder agrees → consensus reached.
    f.as_actor(f2).service("Service").submit_result(1, 2, 1, None).await.unwrap();

    let result = f
        .oracle
        .service("Service")
        .query_match_result(1)
        .query()
        .unwrap()
        .expect("result should be finalized");

    assert_eq!(result.score.home, 2);
    assert_eq!(result.score.away, 1);
    assert!(result.penalty_winner.is_none());
}

// ── Test 5 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn revoked_feeder_excluded_from_consensus() {
    // Single fixture — two parts use different match IDs to avoid a second System::new().
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;
    let f3 = FEEDER_BASE + 3;

    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f3), true).await.unwrap();

    // Part 1 (match 1): normal 2-vote consensus finalizes with default threshold=2.
    f.oracle.service("Service").register_match(1).await.unwrap();
    f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(1, 1, 0, None).await.unwrap();

    let r = f.oracle.service("Service").query_match_result(1).query().unwrap();
    assert!(r.is_some(), "consensus should finalize after 2 matching votes");

    // Part 2 (match 2): raise threshold to 3, revoke f2 after they vote.
    // Active votes: f1(2-0) + f3(2-0) = 2 < threshold 3 → still pending.
    f.oracle.service("Service").set_consensus_threshold(3).await.unwrap();
    f.oracle.service("Service").register_match(2).await.unwrap();
    f.as_actor(f1).service("Service").submit_result(2, 2, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(2, 2, 0, None).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), false).await.unwrap();
    f.as_actor(f3).service("Service").submit_result(2, 2, 0, None).await.unwrap();

    let r = f.oracle.service("Service").query_match_result(2).query().unwrap();
    assert!(
        r.is_none(),
        "revoked feeder's vote should not count — result must stay pending"
    );
}

// ── Test 6 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_result_blocks_finalized() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;
    let f2 = FEEDER_BASE + 2;

    f.oracle.service("Service").register_match(1).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f2), true).await.unwrap();
    f.as_actor(f1).service("Service").submit_result(1, 0, 0, None).await.unwrap();
    f.as_actor(f2).service("Service").submit_result(1, 0, 0, None).await.unwrap();

    // Result is now Finalized — admin cannot cancel it.
    let err = f.oracle.service("Service").cancel_result(1).await;
    assert!(err.is_err(), "cancel_result on Finalized should return error");

    // But can cancel a Pending match.
    f.oracle.service("Service").register_match(2).await.unwrap();
    f.oracle.service("Service").cancel_result(2).await.expect("cancel_result on Pending should succeed");
}

// ── Test 7 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn threshold_bounds() {
    let f = Fixture::new().await;

    // threshold = 0 → error.
    let err = f.oracle.service("Service").set_consensus_threshold(0).await;
    assert!(err.is_err(), "threshold 0 should be rejected");

    // threshold > MAX_FEEDERS (20) → error.
    let err = f.oracle.service("Service").set_consensus_threshold(21).await;
    assert!(err.is_err(), "threshold above MAX_FEEDERS should be rejected");

    // threshold = 1 → ok.
    f.oracle.service("Service").set_consensus_threshold(1).await.expect("threshold 1 should be valid");

    // threshold = MAX_FEEDERS (20) → ok.
    f.oracle.service("Service").set_consensus_threshold(20).await.expect("threshold MAX_FEEDERS should be valid");
}

// ── Test 8 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn propose_admin_rejects_zero() {
    let f = Fixture::new().await;

    let err = f.oracle.service("Service").propose_admin(ActorId::zero()).await;
    assert!(err.is_err(), "propose_admin(zero) should be rejected");
}

// ── Test 9 ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn admin_two_step_transfer() {
    let f = Fixture::new().await;

    // Step 1: current admin proposes new admin.
    f.oracle.service("Service").propose_admin(actor(NEW_ADMIN)).await.expect("propose_admin failed");

    // A stranger cannot accept.
    let err = f.as_actor(STRANGER).service("Service").accept_admin().await;
    assert!(err.is_err(), "stranger should not be able to accept admin");

    // Step 2: proposed admin accepts.
    f.as_actor(NEW_ADMIN).service("Service").accept_admin().await.expect("accept_admin failed");

    let state = f.oracle.service("Service").query_state().query().unwrap();
    assert_eq!(state.admin, actor(NEW_ADMIN));
    assert!(state.pending_admin.is_none());
    assert_ne!(state.admin, actor(ADMIN));
}

// ── Test 10 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn force_finalize_bypasses_consensus() {
    let f = Fixture::new().await;

    f.oracle
        .service("Service")
        .force_finalize_result(42, 3, 2, Some(PenaltyWinner::Home))
        .await
        .expect("force_finalize_result failed");

    let result = f
        .oracle
        .service("Service")
        .query_match_result(42)
        .query()
        .unwrap()
        .expect("result should exist after force-finalize");

    assert_eq!(result.score.home, 3);
    assert_eq!(result.score.away, 2);
    assert_eq!(result.penalty_winner, Some(PenaltyWinner::Home));
}

// ── Test 11 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn feeder_cannot_double_submit() {
    let f = Fixture::new().await;
    let f1 = FEEDER_BASE + 1;

    f.oracle.service("Service").register_match(1).await.unwrap();
    f.oracle.service("Service").set_feeder_authorized(actor(f1), true).await.unwrap();

    // First submit: ok.
    f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await.expect("first submit should succeed");

    // Second submit by same feeder for same match: error.
    let err = f.as_actor(f1).service("Service").submit_result(1, 1, 0, None).await;
    assert!(err.is_err(), "feeder double-submit should be rejected");
}

// ── Test 12 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn max_feeders_limit() {
    let f = Fixture::new().await;

    // Authorize 20 feeders (MAX_FEEDERS).
    for n in 1..=20_u64 {
        f.oracle
            .service("Service")
            .set_feeder_authorized(actor(FEEDER_BASE + n), true)
            .await
            .expect(&format!("feeder {} should be authorized", n));
    }

    // The 21st feeder must be rejected.
    let err = f.oracle.service("Service").set_feeder_authorized(actor(FEEDER_BASE + 21), true).await;
    assert!(err.is_err(), "feeder #21 should exceed MAX_FEEDERS");

    // Revoking one frees a slot.
    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 1), false)
        .await
        .expect("revoking a feeder should succeed");

    f.oracle
        .service("Service")
        .set_feeder_authorized(actor(FEEDER_BASE + 21), true)
        .await
        .expect("slot freed — feeder #21 should now be accepted");
}

// ── Test 13 ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn constructor_rejects_zero_admin() {
    let system = System::new();
    system.init_logger();
    system.mint_to(ADMIN, 100_000_000_000_000);

    let code_id = system.submit_code(WASM_BINARY);
    let env = GtestEnv::new(system, actor(ADMIN));

    let result = env
        .deploy::<OracleProgram>(code_id, b"zero-admin-salt".to_vec())
        .new(ActorId::zero())
        .await;

    assert!(result.is_err(), "constructor with zero admin should fail");
}
