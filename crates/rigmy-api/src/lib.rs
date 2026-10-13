//! RigMY backend: SQLite store, config seeding, price ingestion and the HTTP API.
//! All price data comes from `ingest`; nothing here generates or ships prices.

pub mod adapters;
pub mod config;
pub mod db;
pub mod hours;
pub mod ingest;
pub mod osm;
pub mod seed;
pub mod server;
