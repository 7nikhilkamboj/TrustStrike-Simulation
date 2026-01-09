-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
PRAGMA foreign_keys=OFF;

-- Fix SMS table
CREATE TABLE sms_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    twilio_account_sid VARCHAR(255) NOT NULL,
    twilio_auth_token VARCHAR(255) NOT NULL,
    sms_from VARCHAR(255) NOT NULL,
    modified_date DATETIME NOT NULL,
    interface_type TEXT
);

INSERT INTO sms_new (user_id, name, twilio_account_sid, twilio_auth_token, sms_from, modified_date, interface_type)
SELECT user_id, name, twilio_account_sid, twilio_auth_token, sms_from, modified_date, interface_type FROM sms;

DROP TABLE sms;
ALTER TABLE sms_new RENAME TO sms;

-- Fix SMS logs table
CREATE TABLE sms_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id BIGINT NOT NULL,
    r_id VARCHAR(255) NOT NULL,
    send_date DATETIME NOT NULL,
    send_attempt INTEGER DEFAULT 0,
    processing BOOLEAN DEFAULT 0,
    target VARCHAR(255) NOT NULL
);

INSERT INTO sms_logs_new (campaign_id, r_id, send_date, send_attempt, processing, target)
SELECT campaign_id, r_id, send_date, send_attempt, processing, target FROM sms_logs;

DROP TABLE sms_logs;
ALTER TABLE sms_logs_new RENAME TO sms_logs;

PRAGMA foreign_keys=ON;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
-- Dropping and recreating without autoincrement (not ideal, but follows Down pattern)
DROP TABLE sms_logs;
DROP TABLE sms;
CREATE TABLE sms (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    twilio_account_sid VARCHAR(255) NOT NULL,
    twilio_auth_token VARCHAR(255) NOT NULL,
    sms_from VARCHAR(255) NOT NULL,
    modified_date DATETIME NOT NULL,
    interface_type TEXT
);
CREATE TABLE sms_logs (
    id BIGINT PRIMARY KEY,
    campaign_id BIGINT NOT NULL,
    r_id VARCHAR(255) NOT NULL,
    send_date DATETIME NOT NULL,
    send_attempt INTEGER DEFAULT 0,
    processing BOOLEAN DEFAULT 0,
    target VARCHAR(255) NOT NULL
);
