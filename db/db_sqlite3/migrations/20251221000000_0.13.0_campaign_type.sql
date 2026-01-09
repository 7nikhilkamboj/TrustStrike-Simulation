-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE campaigns ADD COLUMN campaign_type VARCHAR(255) DEFAULT 'email';
UPDATE campaigns SET campaign_type='email' WHERE campaign_type IS NULL;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
