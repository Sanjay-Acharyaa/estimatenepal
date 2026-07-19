export const CACHE_TTL = 300; // 5 minutes — rates, resources, settings
export const BOQ_CACHE_TTL = 30; // 30 seconds — BOQ recomputes frequently
export const BOQ_MAX_CACHE_BYTES = 512 * 1024; // 512 KB max BOQ payload in Redis
export const PAGE_SIZE = 30; // default paginated list page size
export const DEFAULT_ASSEMBLY_COLOUR = "#3B82F6"; // Tailwind blue-500

// Rate catalog — cap on rows fetched into Redis per filter combo.
// Orgs with more than this many rates will see empty pages beyond this index.
// Raise this value if large DUDBC imports are imported (Phase 8+).
export const RATES_MAX_CACHED_ROWS = 5000;

// Dropdown search results in the rate form catalog picker
export const CATALOG_SEARCH_LIMIT = 15;

// Maximum qtyPerUnit in a rate analysis line (guards against data-entry typos)
export const QTY_PER_UNIT_MAX = 99_999;

// Maximum dry-volume factor for mortar and concrete (shared by UI and API Zod schema)
export const DRY_VOLUME_MAX = 1.8;
