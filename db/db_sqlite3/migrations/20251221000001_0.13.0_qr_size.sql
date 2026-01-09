-- +goose Up
ALTER TABLE campaigns ADD COLUMN qr_size INTEGER DEFAULT 250;
ALTER TABLE email_requests ADD COLUMN qr_size INTEGER DEFAULT 250;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN qr_size;
ALTER TABLE email_requests DROP COLUMN qr_size;
