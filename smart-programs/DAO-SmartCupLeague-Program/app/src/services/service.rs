#![allow(static_mut_refs)]

use sails_rs::{
    prelude::*,
    gstd::{exec, msg},
};
use sails_rs::collections::HashMap as SailsHashMap;

pub static mut DAO_STATE: Option<DaoState> = None;

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum VoteChoice {
    Yes,
    No,
    Abstain,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ProposalStatus {
    Active,
    Defeated,
    Succeeded,
    Executed,
    Expired,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum ProposalKind {
    SetFeeBps { new_fee_bps: u128 },
    SetFinalPrizeBps { new_final_prize_bps: u128 },
    SetMaxPayoutChunk { new_max_payout_chunk: u128 },
    AddPhase { name: String, start_time: u64, end_time: u64 },
    AddMatch { phase: String, home: String, away: String, kick_off: u64 },
    SetQuorum { new_quorum_bps: u16 },
    SetVotingPeriod { new_voting_period: u64 },
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Proposal {
    pub id: u64,
    pub proposer: ActorId,
    pub kind: ProposalKind,
    pub description: String,
    pub start_time: u64,
    pub end_time: u64,
    pub yes: u32,
    pub no: u32,
    pub abstain: u32,
    pub status: ProposalStatus,
    pub executed: bool,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo, PartialEq, Eq)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct VoteRecord {
    pub proposal_id: u64,
    pub voter: ActorId,
    pub choice: VoteChoice,
}

#[derive(Debug, Clone, Default)]
pub struct DaoState {
    pub owner: ActorId,
    pub kyc_contract: Option<ActorId>,
    pub market_contract: ActorId,
    pub quorum_bps: u16,
    pub voting_period: u64,
    pub proposal_count: u64,
    pub proposals: SailsHashMap<u64, Proposal>,
    pub votes: SailsHashMap<(u64, ActorId), VoteChoice>,
}

impl DaoState {
    pub fn init(owner: ActorId, market_contract: ActorId, kyc_contract: Option<ActorId>) {
        unsafe {
            DAO_STATE = Some(Self {
                owner,
                market_contract,
                kyc_contract,
                quorum_bps: 2000,
                voting_period: 86_400_000,
                proposal_count: 0,
                ..Default::default()
            });
        }
    }

    pub fn state_mut() -> &'static mut DaoState {
        let s = unsafe { DAO_STATE.as_mut() };
        debug_assert!(s.is_some(), "DAO state not initialized");
        unsafe { s.unwrap_unchecked() }
    }

    pub fn state_ref() -> &'static DaoState {
        let s = unsafe { DAO_STATE.as_ref() };
        debug_assert!(s.is_some(), "DAO state not initialized");
        unsafe { s.unwrap_unchecked() }
    }
}

#[event]
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum DaoEvent {
    Seeded(ActorId, ActorId),
    ProposalCreated(u64, ActorId),
    Voted(u64, ActorId, VoteChoice),
    ProposalFinalized(u64, ProposalStatus),
    ProposalExecuted(u64),
    MarketCallDispatched(u64),
    GovernanceParamUpdated,
}

#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MarketDaoCommand {
    RegisterPhase {
        name: String,
        start_time: u64,
        end_time: u64,
    },
    RegisterMatch {
        phase: String,
        home: String,
        away: String,
        kick_off: u64,
    },
    SetFeeBps {
        new_fee_bps: u128,
    },
    SetFinalPrizeBps {
        new_final_prize_bps: u128,
    },
    SetMaxPayoutChunk {
        new_max_payout_chunk: u128,
    },
}

#[derive(Debug, Encode, Decode, TypeInfo, Clone)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct IoDaoState {
    pub owner: ActorId,
    pub market_contract: ActorId,
    pub kyc_contract: Option<ActorId>,
    pub quorum_bps: u16,
    pub voting_period: u64,
    pub proposal_count: u64,
}

#[derive(Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Self
    }

    pub fn seed(market_contract: ActorId, kyc_contract: Option<ActorId>) {
        DaoState::init(msg::source(), market_contract, kyc_contract);
    }

    fn assert_owner() {
        let st = DaoState::state_ref();
        if msg::source() != st.owner {
            panic!("Only owner");
        }
    }

    fn assert_active(p: &Proposal, now: u64) {
        if p.status != ProposalStatus::Active {
            panic!("Not active");
        }
        if now >= p.end_time {
            panic!("Voting ended");
        }
    }

    fn total_votes(p: &Proposal) -> u32 {
        p.yes.saturating_add(p.no).saturating_add(p.abstain)
    }

    fn meets_quorum(p: &Proposal, quorum_bps: u16) -> bool {
        if quorum_bps == 0 {
            return true;
        }
        let tv = Service::total_votes(p);
        if tv == 0 {
            return false;
        }
        let min_votes = core::cmp::max(2, (quorum_bps as u32) / 1000);
        tv >= min_votes
    }

    fn compute_status(p: &Proposal, quorum_bps: u16, now: u64) -> ProposalStatus {
        if p.executed {
            return ProposalStatus::Executed;
        }
        if now < p.end_time {
            return ProposalStatus::Active;
        }

        if !Service::meets_quorum(p, quorum_bps) {
            return ProposalStatus::Defeated;
        }

        if p.yes > p.no {
            ProposalStatus::Succeeded
        } else {
            ProposalStatus::Defeated
        }
    }

    fn dispatch_market_call(proposal_id: u64, cmd: MarketDaoCommand) {
        let st = DaoState::state_ref();
        msg::send(st.market_contract, cmd, 0).expect("Market call failed");
        let _ = proposal_id;
    }
}

#[sails_rs::service(events = DaoEvent)]
impl Service {
    #[export]
    pub fn set_market_contract(&mut self, new_market: ActorId) -> DaoEvent {
        Service::assert_owner();
        let st = DaoState::state_mut();
        st.market_contract = new_market;
        self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
        DaoEvent::GovernanceParamUpdated
    }

    #[export]
    pub fn set_owner(&mut self, new_owner: ActorId) -> DaoEvent {
        Service::assert_owner();
        let st = DaoState::state_mut();
        st.owner = new_owner;
        self.emit_event(DaoEvent::GovernanceParamUpdated).ok();
        DaoEvent::GovernanceParamUpdated
    }

    #[export]
    pub fn create_proposal(&mut self, kind: ProposalKind, description: String) -> DaoEvent {
        let st = DaoState::state_mut();
        let proposer = msg::source();
        let now = exec::block_timestamp();

        let id = st.proposal_count.saturating_add(1);
        st.proposal_count = id;

        let end = now.saturating_add(st.voting_period);

        let p = Proposal {
            id,
            proposer,
            kind,
            description,
            start_time: now,
            end_time: end,
            yes: 0,
            no: 0,
            abstain: 0,
            status: ProposalStatus::Active,
            executed: false,
        };

        st.proposals.insert(id, p);

        self.emit_event(DaoEvent::ProposalCreated(id, proposer)).ok();
        DaoEvent::ProposalCreated(id, proposer)
    }

    #[export]
    pub fn vote(&mut self, proposal_id: u64, choice: VoteChoice) -> DaoEvent {
        let st = DaoState::state_mut();
        let voter = msg::source();
        let now = exec::block_timestamp();

        let p = st.proposals.get_mut(&proposal_id).expect("No proposal");
        Service::assert_active(p, now);

        if st.votes.contains_key(&(proposal_id, voter)) {
            panic!("Already voted");
        }

        match choice {
            VoteChoice::Yes => p.yes = p.yes.saturating_add(1),
            VoteChoice::No => p.no = p.no.saturating_add(1),
            VoteChoice::Abstain => p.abstain = p.abstain.saturating_add(1),
        }

        st.votes.insert((proposal_id, voter), choice.clone());

        self.emit_event(DaoEvent::Voted(proposal_id, voter, choice.clone())).ok();
        DaoEvent::Voted(proposal_id, voter, choice)
    }

    #[export]
    pub fn finalize_proposal(&mut self, proposal_id: u64) -> DaoEvent {
        let st = DaoState::state_mut();
        let now = exec::block_timestamp();

        let p = st.proposals.get_mut(&proposal_id).expect("No proposal");

        let new_status = Service::compute_status(p, st.quorum_bps, now);
        p.status = new_status.clone();

        self.emit_event(DaoEvent::ProposalFinalized(proposal_id, new_status.clone()))
            .ok();
        DaoEvent::ProposalFinalized(proposal_id, new_status)
    }

    #[export]
    pub fn execute(&mut self, proposal_id: u64) -> Vec<DaoEvent> {
        let st = DaoState::state_mut();
        let now = exec::block_timestamp();

        let p = st.proposals.get_mut(&proposal_id).expect("No proposal");

        let computed = Service::compute_status(p, st.quorum_bps, now);
        if computed == ProposalStatus::Active {
            panic!("Still active");
        }
        if computed != ProposalStatus::Succeeded {
            p.status = computed;
            return vec![DaoEvent::ProposalFinalized(proposal_id, p.status.clone())];
        }
        if p.executed {
            panic!("Already executed");
        }

        let mut events = Vec::new();

        match p.kind.clone() {
            ProposalKind::AddPhase {
                name,
                start_time,
                end_time,
            } => {
                Service::dispatch_market_call(
                    proposal_id,
                    MarketDaoCommand::RegisterPhase {
                        name,
                        start_time,
                        end_time,
                    },
                );
                events.push(DaoEvent::MarketCallDispatched(proposal_id));
            }
            ProposalKind::AddMatch {
                phase,
                home,
                away,
                kick_off,
            } => {
                Service::dispatch_market_call(
                    proposal_id,
                    MarketDaoCommand::RegisterMatch {
                        phase,
                        home,
                        away,
                        kick_off,
                    },
                );
                events.push(DaoEvent::MarketCallDispatched(proposal_id));
            }
            ProposalKind::SetFeeBps { new_fee_bps } => {
                Service::dispatch_market_call(
                    proposal_id,
                    MarketDaoCommand::SetFeeBps { new_fee_bps },
                );
                events.push(DaoEvent::MarketCallDispatched(proposal_id));
            }
            ProposalKind::SetFinalPrizeBps { new_final_prize_bps } => {
                Service::dispatch_market_call(
                    proposal_id,
                    MarketDaoCommand::SetFinalPrizeBps {
                        new_final_prize_bps,
                    },
                );
                events.push(DaoEvent::MarketCallDispatched(proposal_id));
            }
            ProposalKind::SetMaxPayoutChunk { new_max_payout_chunk } => {
                Service::dispatch_market_call(
                    proposal_id,
                    MarketDaoCommand::SetMaxPayoutChunk {
                        new_max_payout_chunk,
                    },
                );
                events.push(DaoEvent::MarketCallDispatched(proposal_id));
            }

            ProposalKind::SetQuorum { new_quorum_bps } => {
                st.quorum_bps = new_quorum_bps;
                events.push(DaoEvent::GovernanceParamUpdated);
            }
            ProposalKind::SetVotingPeriod { new_voting_period } => {
                st.voting_period = new_voting_period;
                events.push(DaoEvent::GovernanceParamUpdated);
            }
        }

        p.executed = true;
        p.status = ProposalStatus::Executed;
        events.push(DaoEvent::ProposalExecuted(proposal_id));

        for e in events.iter().cloned() {
            self.emit_event(e).ok();
        }

        events
    }

    #[export]
    pub fn query_state(&self) -> IoDaoState {
        let st = DaoState::state_ref();
        IoDaoState {
            owner: st.owner,
            market_contract: st.market_contract,
            kyc_contract: st.kyc_contract,
            quorum_bps: st.quorum_bps,
            voting_period: st.voting_period,
            proposal_count: st.proposal_count,
        }
    }

    #[export]
    pub fn query_proposal(&self, proposal_id: u64) -> Option<Proposal> {
        DaoState::state_ref().proposals.get(&proposal_id).cloned()
    }

    #[export]
    pub fn query_proposals(&self) -> Vec<Proposal> {
        DaoState::state_ref().proposals.values().cloned().collect()
    }

    #[export]
    pub fn query_vote(&self, proposal_id: u64, voter: ActorId) -> Option<VoteChoice> {
        DaoState::state_ref().votes.get(&(proposal_id, voter)).cloned()
    }
}
