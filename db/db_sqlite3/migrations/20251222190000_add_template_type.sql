-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE templates ADD COLUMN type TEXT DEFAULT 'email';
UPDATE templates SET type='email' WHERE type IS NULL;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
