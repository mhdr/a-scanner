pub mod error;
pub mod routes;

use std::sync::Arc;

use a_scanner_core::CoreState;

/// Shared web-backend application state.
///
/// Wraps the platform-agnostic [`CoreState`] from the core crate.
/// Web-specific concerns (e.g. Axum extractors) live in this crate,
/// but all business logic is delegated to core via the facade API.
#[derive(Clone)]
pub struct AppState {
    /// Platform-agnostic core state (DB pool, TLS, JWT, scan channels).
    pub core: CoreState,
}

impl AppState {
    /// Create a new `AppState` wrapping the given [`CoreState`].
    pub fn new(core: CoreState) -> Arc<Self> {
        Arc::new(Self { core })
    }
}
