-- OTP codes table for secure verification
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  code TEXT NOT NULL,
  email TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(token, code)
);

-- Index for fast lookup by token+code
CREATE INDEX IF NOT EXISTS idx_otp_codes_token_code ON otp_codes(token, code);

-- Index for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

-- Auto-cleanup: delete expired OTPs (older than 1 hour)
-- This can be called via cron or triggered manually
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
