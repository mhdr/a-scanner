use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use a_scanner_core::{db, scanner, services};
use a_scanner_web::{AppState, routes};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:scanner.db?mode=rwc".to_string());
    let pool = db::init_pool(&database_url).await?;

    tracing::info!("Database initialized");

    services::auth_service::seed_admin_user(&pool).await?;
    let jwt_secret = services::auth_service::get_or_create_jwt_secret(&pool).await?;

    let auto_update_pool = pool.clone();
    tokio::spawn(async move {
        services::provider_service::run_auto_update_loop(auto_update_pool).await;
    });

    let tls_connector = scanner::create_tls_connector();
    let state = AppState::new(pool, tls_connector, jwt_secret);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(routes::app_router(state.clone()))
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
