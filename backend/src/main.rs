use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use a_scanner_backend::{AppState, db, routes, scanner, services};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install the ring crypto provider for rustls before any TLS operations
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    // Initialize database
    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:scanner.db?mode=rwc".to_string());
    let pool = db::init_pool(&database_url).await?;

    tracing::info!("Database initialized");

    // Spawn auto-update background task for provider IP ranges
    let auto_update_pool = pool.clone();
    tokio::spawn(async move {
        services::provider_service::run_auto_update_loop(auto_update_pool).await;
    });

    // Create shared TLS connector (reused across all scans)
    let tls_connector = scanner::create_tls_connector();

    // Build shared state
    let state = AppState::new(pool, tls_connector);

    // CORS layer for development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the application router
    let app = Router::new()
        .merge(routes::app_router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Start the server
    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
