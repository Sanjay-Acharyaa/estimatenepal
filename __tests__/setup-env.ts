// Provide a dummy REDIS_URL so lib/redis.ts doesn't throw during imports in unit tests.
// The redis client is created but never actually connected — pure-function tests don't call it.
process.env.REDIS_URL = "redis://localhost:6379";