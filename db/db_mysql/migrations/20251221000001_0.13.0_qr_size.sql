-- +goose Up
ALTER TABLE campaigns ADD COLUMN qr_size INT DEFAULT 250;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN qr_size;
