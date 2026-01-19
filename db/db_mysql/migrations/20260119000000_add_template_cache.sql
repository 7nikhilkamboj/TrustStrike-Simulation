-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

CREATE TABLE template_cache (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    cache_type VARCHAR(50) NOT NULL,
    cache_key VARCHAR(255) NOT NULL DEFAULT '',
    data LONGTEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_template_cache_type_key ON template_cache(cache_type, cache_key);

-- +goose Down
-- SQL section 'Down' is executed when this migration is rolled back

DROP INDEX idx_template_cache_type_key ON template_cache;
DROP TABLE template_cache;
