-- Add manager_reaction column to logs table
-- Stores emoji reactions from managers as a text field (e.g. "👍,🔥")
-- Lightweight alternative to a full comments system

ALTER TABLE logs ADD COLUMN IF NOT EXISTS manager_reaction TEXT DEFAULT NULL;

COMMENT ON COLUMN logs.manager_reaction IS 'Manager reaction stamps, comma-separated emoji (e.g. "👍,🔥")';
