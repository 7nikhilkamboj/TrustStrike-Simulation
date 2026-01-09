-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE campaigns ADD COLUMN sms_id BIGINT;
CREATE TABLE sms (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    twilio_account_sid VARCHAR(255) NOT NULL,
    twilio_auth_token VARCHAR(255) NOT NULL,
    sms_from VARCHAR(255) NOT NULL,
    modified_date DATETIME NOT NULL
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

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
DROP TABLE sms_logs;
DROP TABLE sms;
ALTER TABLE campaigns DROP COLUMN sms_id;
