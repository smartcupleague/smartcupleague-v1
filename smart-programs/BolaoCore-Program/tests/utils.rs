pub const ONE_VARA: u128 = 1_000_000_000_000;
pub const MIN_BET: u128 = 3 * ONE_VARA; // mirrors MIN_BET_PLANCK in constants.rs
pub const BET_5_VARA: u128 = 5 * ONE_VARA;

/// Far-future kick-off time. gtest uses the real Unix timestamp in milliseconds
/// (currently ~1.75 × 10¹²), so KICK_OFF must exceed that. Using year ~2286.
pub const KICK_OFF: u64 = 9_999_999_999_999;

pub const GROUP_PHASE: &str = "Group Stage";
pub const HOME_TEAM: &str = "Brazil";
pub const AWAY_TEAM: &str = "Germany";
