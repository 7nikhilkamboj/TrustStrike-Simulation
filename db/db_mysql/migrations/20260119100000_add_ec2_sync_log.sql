-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

CREATE TABLE ec2_sync_log (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    sync_type VARCHAR(50) NOT NULL UNIQUE,
    last_sync_at DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success'
);

-- +goose Down
-- SQL section 'Down' is executed when this migration is rolled back

DROP TABLE IF EXISTS ec2_sync_log;
