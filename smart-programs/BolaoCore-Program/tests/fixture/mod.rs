use sails_rs::{
    client::{Actor, GearEnv, GtestEnv},
    gtest::System,
    prelude::*,
};
use bolao_program::{
    client::{BolaoCtors, BolaoProgram},
    WASM_BINARY,
};

pub const ADMIN: u64 = 100;
pub const NEW_ADMIN: u64 = 101;
pub const STRANGER: u64 = 199;
pub const ORACLE: u64 = 200;
pub const USER1: u64 = 201;
pub const USER2: u64 = 202;

pub fn actor(id: u64) -> ActorId {
    id.into()
}

pub struct Fixture {
    pub env: GtestEnv,
    pub program: Actor<BolaoProgram, GtestEnv>,
}

impl Fixture {
    pub async fn new() -> Self {
        let system = System::new();
        system.init_logger();

        for id in [ADMIN, NEW_ADMIN, STRANGER, ORACLE, USER1, USER2] {
            system.mint_to(id, 100_000_000_000_000);
        }

        let code_id = system.submit_code(WASM_BINARY);
        let env = GtestEnv::new(system, actor(ADMIN));

        let program = env
            .deploy::<BolaoProgram>(code_id, b"bolao-salt".to_vec())
            .new(actor(ADMIN))
            .await
            .unwrap();

        Fixture { env, program }
    }

    /// Returns an Actor with the signer set to `id`.
    pub fn as_actor(&self, id: u64) -> Actor<BolaoProgram, GtestEnv> {
        let env = self.env.clone().with_actor_id(id.into());
        Actor::new(env, self.program.id())
    }
}
