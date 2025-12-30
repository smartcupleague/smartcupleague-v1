#![no_std]

use sails_rs::prelude::*;
pub mod services;

use services::service::Service;

pub struct Program;

#[program]
impl Program {
    
    pub fn new(market_contract: ActorId, kyc_contract: ActorId) -> Self {
        Service::seed(market_contract, Some(kyc_contract));
        Self
    }

    pub fn service(&self) -> Service {
        Service::new()
    }
}
