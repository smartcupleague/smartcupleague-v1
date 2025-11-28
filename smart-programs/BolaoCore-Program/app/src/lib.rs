
#![no_std]

use sails_rs::prelude::*;
pub mod services;

use services::service::Service;

pub struct Program;

#[program]
impl Program {
    
    pub fn new(kyc_contract: ActorId, final_prize_distributor: ActorId) -> Self {
        Service::seed(kyc_contract, final_prize_distributor);
        Self
    }

    #[route("Bolaocore")]
    pub fn service(&self) -> Service {
        Service::new()
    }
}
