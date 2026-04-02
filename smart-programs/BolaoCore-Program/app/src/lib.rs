
#![no_std]

use sails_rs::prelude::*;
pub mod services;

use services::service::Service;

pub struct Program;

#[program]
impl Program {
    
    pub fn new( admin: ActorId) -> Self {
        Service::seed(admin);
        Self
    }

    pub fn service(&self) -> Service {
        Service::new()
    }
}
