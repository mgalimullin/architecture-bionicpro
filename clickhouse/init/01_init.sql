CREATE TABLE kafka_sample_table
(
    id UInt64,
    order_number UInt64,
    total Float64,
    discount Float64,
    buyer_id UInt64
)
ENGINE = Kafka
SETTINGS
 kafka_broker_list = 'kafka:9092',
 kafka_topic_list = 'crm.public.sample_table',
 kafka_group_name = 'clickhouse',
 kafka_format = 'JSONEachRow';

CREATE TABLE orders_analytics
(
    buyer_id UInt64,
    orders_count UInt64,
    total_sum Float64,
    total_discount Float64
)
ENGINE = SummingMergeTree
ORDER BY buyer_id;

CREATE MATERIALIZED VIEW orders_mv
TO orders_analytics
AS
SELECT
    buyer_id,
    count() AS orders_count,
    sum(total) AS total_sum,
    sum(discount) AS total_discount
FROM kafka_sample_table
GROUP BY buyer_id;