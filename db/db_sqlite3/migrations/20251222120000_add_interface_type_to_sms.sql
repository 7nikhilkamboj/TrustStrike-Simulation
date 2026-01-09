-- +goose Up
-- +goose StatementBegin
ALTER TABLE `sms` ADD COLUMN `interface_type` TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- SQLite does not support ALTER TABLE DROP COLUMN directly in older versions.
-- For simplicity, we just leave it if someone reverts.
-- +goose StatementEnd
