CREATE DATABASE sample;
GRANT ALL PRIVILEGES ON DATABASE sample TO airflow;

\c sample

CREATE TABLE IF NOT EXISTS sample_table (
    id SERIAL PRIMARY KEY,
    order_number BIGINT,
    total NUMERIC(18,2),
    discount NUMERIC(18,2),
    buyer_id BIGINT
);