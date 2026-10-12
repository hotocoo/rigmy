//! RigMY core: pure business logic shared by the API server and the browser (WASM).
//!
//! No IO and no price data lives here: prices only ever arrive through [`types::Bootstrap::offers`]
//! (written by the ingester) and history through [`history::Snapshot`]s.

pub mod catalog;
pub mod content;
pub mod geo;
pub mod history;
pub mod time;
pub mod types;

pub use catalog::{build_from_map, fmt_num, Catalog, CatalogError};
pub use content::{ContentError, ContentFile, EtaTable};
pub use geo::{
    dist, fmt_km, nearby, open_state, postcode, region_of, validate_postcodes, LatLon, Nearby,
    PostcodesFile,
};
pub use history::{build_history, cat_index, sale_events, stats, Snapshot};
pub use types::*;

#[cfg(test)]
mod tests;
