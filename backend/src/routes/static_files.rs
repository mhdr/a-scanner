use axum::{
    extract::Request,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
};
use rust_embed::Embed;

/// Embedded frontend assets built from the React app.
/// The path is relative to the Cargo.toml directory.
#[derive(Embed)]
#[folder = "../frontend/dist"]
struct FrontendAssets;

/// Serve embedded static files. Falls back to `index.html` for SPA routing.
pub async fn static_handler(req: Request) -> Response {
    let path = req.uri().path().trim_start_matches('/');

    // Try to serve the exact file requested
    if !path.is_empty() {
        if let Some(file) = FrontendAssets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime.as_ref())],
                file.data,
            )
                .into_response();
        }
    }

    // Fallback to index.html for SPA client-side routing
    match FrontendAssets::get("index.html") {
        Some(file) => Html(file.data).into_response(),
        None => (StatusCode::NOT_FOUND, "Frontend assets not found. Build the frontend first.")
            .into_response(),
    }
}
