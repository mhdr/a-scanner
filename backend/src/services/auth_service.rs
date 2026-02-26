use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, Algorithm};
use rand::Rng;
use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::Claims;

/// Hash a plaintext password with argon2.
pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {}", e)))?;
    Ok(hash.to_string())
}

/// Verify a plaintext password against an argon2 hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {}", e)))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// Create a JWT token for the given username, valid for 24 hours.
pub fn generate_jwt(username: &str, secret: &[u8]) -> Result<String, AppError> {
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
    let claims = Claims {
        sub: username.to_string(),
        exp,
        iat: now.timestamp() as usize,
    };
    jsonwebtoken::encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encoding failed: {}", e)))
}

/// Validate a JWT token and return the claims.
pub fn validate_jwt(token: &str, secret: &[u8]) -> Result<Claims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    jsonwebtoken::decode::<Claims>(token, &DecodingKey::from_secret(secret), &validation)
        .map(|data| data.claims)
        .map_err(|e| AppError::Unauthorized(format!("Invalid token: {}", e)))
}

/// Retrieve the JWT secret from the `settings` table, or generate and persist
/// a new random 32-byte secret on first run.
pub async fn get_or_create_jwt_secret(pool: &SqlitePool) -> Result<Vec<u8>, AppError> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'jwt_secret'")
            .fetch_optional(pool)
            .await?;

    if let Some((hex_secret,)) = row {
        // Decode hex string back to bytes
        let bytes = hex::decode(&hex_secret)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid jwt_secret hex: {}", e)))?;
        return Ok(bytes);
    }

    // Generate a new 32-byte random secret
    let mut secret = vec![0u8; 32];
    rand::thread_rng().fill(&mut secret[..]);
    let hex_secret = hex::encode(&secret);

    sqlx::query("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)")
        .bind(&hex_secret)
        .execute(pool)
        .await?;

    tracing::info!("Generated new JWT secret");
    Ok(secret)
}

/// Seed the default admin user if no users exist yet.
/// Uses argon2-hashed "admin" as the default password.
pub async fn seed_admin_user(pool: &SqlitePool) -> Result<(), AppError> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if count.0 > 0 {
        return Ok(());
    }

    let password_hash = hash_password("admin")?;
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES ('admin', 'admin', ?, ?, ?)")
        .bind(&password_hash)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

    tracing::info!("Seeded default admin user (admin/admin)");
    Ok(())
}

/// Change the password for a user after verifying the current password.
pub async fn change_password(
    pool: &SqlitePool,
    username: &str,
    current_password: &str,
    new_password: &str,
) -> Result<(), AppError> {
    let user: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM users WHERE username = ?")
            .bind(username)
            .fetch_optional(pool)
            .await?;

    let (current_hash,) = user.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    if !verify_password(current_password, &current_hash)? {
        return Err(AppError::Unauthorized(
            "Current password is incorrect".to_string(),
        ));
    }

    if new_password.len() < 4 {
        return Err(AppError::BadRequest(
            "New password must be at least 4 characters".to_string(),
        ));
    }

    let new_hash = hash_password(new_password)?;
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?")
        .bind(&new_hash)
        .bind(&now)
        .bind(username)
        .execute(pool)
        .await?;

    tracing::info!("Password changed for user: {}", username);
    Ok(())
}
