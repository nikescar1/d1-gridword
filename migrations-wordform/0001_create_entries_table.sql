-- Migration number: 0001
CREATE TABLE IF NOT EXISTS entries (
    date_key TEXT NOT NULL,
    diff     TEXT NOT NULL,
    name     TEXT NOT NULL,
    score    INTEGER NOT NULL,
    words    INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    PRIMARY KEY (date_key, diff, name)
);

CREATE INDEX IF NOT EXISTS idx_entries_date_diff_score
    ON entries(date_key, diff, score DESC, ts ASC);
