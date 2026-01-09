
-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE groups ADD COLUMN group_type VARCHAR(255) DEFAULT 'email';

-- +goose Down
-- SQL section 'Down' is executed when this migration is rolled back
ALTER TABLE groups DROP COLUMN group_type;
