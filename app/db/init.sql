-- =============================================================
-- DocVault — Database Initialization Script
-- Run once to set up the database on the EC2 instance
-- =============================================================

-- Create database (run as postgres superuser)
-- psql -U postgres -f init.sql

CREATE DATABASE docvault;

CREATE USER docvault_user WITH ENCRYPTED PASSWORD 'changeme';

GRANT ALL PRIVILEGES ON DATABASE docvault TO docvault_user;

-- Connect to the new database
\c docvault;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO docvault_user;

-- =============================================================
-- TABLES
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    first_name    VARCHAR(100)        NOT NULL,
    last_name     VARCHAR(100)        NOT NULL,
    email         VARCHAR(255)        NOT NULL UNIQUE,
    username      VARCHAR(100)        NOT NULL UNIQUE,
    password_hash VARCHAR(255)        NOT NULL,
    created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(255)        NOT NULL,
    stored_name   VARCHAR(255)        NOT NULL,
    file_path     TEXT                NOT NULL,
    file_size     BIGINT              NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_documents_user  ON documents(user_id);

-- =============================================================
-- GRANT TABLE ACCESS TO APP USER
-- =============================================================

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO docvault_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO docvault_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES    TO docvault_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO docvault_user;

-- Confirmation
SELECT 'Database initialized successfully.' AS status;