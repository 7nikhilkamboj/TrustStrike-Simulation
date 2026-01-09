-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE groups ADD COLUMN group_type VARCHAR(255) DEFAULT 'email';
UPDATE groups SET group_type='email' WHERE group_type IS NULL;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
-- SQLite doesn't support DROP COLUMN easily in older versions, but for VARCHAR columns it's often ignored or requires table recreation. 
-- Since this is for a new feature, we'll keep it simple or leave it empty if not strictly required for rollback in this environment.
