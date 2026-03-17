-- Enable pgcrypto for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin config table (single row, no client access)
CREATE TABLE admin_config (
  id integer PRIMARY KEY DEFAULT 1,
  password_hash text NOT NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
-- No policies = no client can read/write directly

-- Insert bcrypt hash of 'Password0129'
INSERT INTO admin_config (password_hash)
VALUES (crypt('Password0129', gen_salt('bf')));

-- RPC function: verify password server-side
CREATE OR REPLACE FUNCTION verify_admin_password(password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash FROM admin_config WHERE id = 1;
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(password, stored_hash) = stored_hash;
END;
$$;
