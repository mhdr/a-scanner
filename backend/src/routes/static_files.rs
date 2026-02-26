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

/// Returns an appropriate Cache-Control header value for the given path.
///
/// Vite produces hashed filenames for assets in the `assets/` directory
/// (e.g. `assets/index-DiwrgTda.css`, `assets/vendor-react-B74x04Yn.js`).
/// These are safe to cache forever since any content change produces a new hash.
/// For everything else (index.html, favicon, etc.), use `no-cache` so the
/// browser always revalidates and picks up new deployments.
fn cache_control_for(path: &str) -> &'static str {
    if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    }
}

/// Serve embedded static files. Falls back to `index.html` for SPA routing.
pub async fn static_handler(req: Request) -> Response {
    let path = req.uri().path().trim_start_matches('/');

    // Try to serve the exact file requested
    if !path.is_empty() {
        if let Some(file) = FrontendAssets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let cache = cache_control_for(path);
            return (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime.as_ref()),
                    (header::CACHE_CONTROL, cache),
                ],
                file.data,
            )
                .into_response();
        }
    }

    // Fallback to index.html for SPA client-side routing
    match FrontendAssets::get("index.html") {
        Some(file) => (
            StatusCode::OK,
            [(header::CACHE_CONTROL, "no-cache")],
            Html(file.data),
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "Frontend assets not found. Build the frontend first.")
            .into_response(),
    }
}
