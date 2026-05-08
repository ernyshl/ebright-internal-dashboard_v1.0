const { z } = require('zod');

// Load .env (optional in production environments)
require('dotenv').config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  INV_DATABASE_URL: z.string().min(1, 'INV_DATABASE_URL is required'),

  // Source DB for the ST attendance/staff sync service (different database on same host).
  // When unset, the sync service is disabled.
  ST_SYNC_SOURCE_DATABASE_URL: z.string().optional(),
  ST_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),

  // Connection to ebrightleads_db (HR system of record — has hrfs.BranchStaff,
  // hrfs.AttendanceLog, etc.). When unset, defaults to swapping the database
  // name in DATABASE_URL — same host/user/password, db = ebrightleads_db.
  // Override only if the leads DB lives on a different host/credentials.
  LEADS_DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Google Ads API Configuration
  GOOGLE_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_LOGIN_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_ID: z.string().optional(),

  // GHL webhook secret (set in GHL webhook URL as ?secret=XXX)
  GHL_WEBHOOK_SECRET: z.string().optional(),

  // Meta / TikTok ad account IDs
  META_MAIN_FB_ID: z.string().optional(),
  META_TT_ID: z.string().optional(),
  META_SARA_ID: z.string().optional(),
  META_ONLINE_ID: z.string().optional(),

  // AMF (Hikvision DS-K1T804A) direct-device sync. When AMF_HOST is unset the
  // service is disabled and we rely on the vendor middleware path through stSync.
  AMF_HOST: z.string().optional(),
  AMF_PORT: z.coerce.number().int().positive().default(80),
  AMF_USERNAME: z.string().optional(),
  AMF_PASSWORD: z.string().optional(),
  AMF_SYNC_LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
  // 30s, not 10s: Hikvision firmware closes keep-alive between the 401
  // challenge and the digest retry, so each request is two round-trips on
  // a fresh TCP connection. Under load the device routinely takes 15-25s
  // to answer the first deviceInfo call, which was killing the whole sync.
  AMF_SYNC_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AMF_SYNC_PAGE_SIZE: z.coerce.number().int().positive().default(30),
  // Recurring poll of the device. Keeps the dashboard in sync when the laptop
  // (or vendor middleware) was offline — every tick drains the device's
  // 50,000-event on-board buffer up to the watermark. 5 min is a balance
  // between freshness and not hammering a rate-limited terminal.
  AMF_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),

  // Telegram bot (required at runtime when bot is used, optional at boot)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_CHATS: z.string().optional(),
  TELEGRAM_REPORT_CHATS: z.string().optional(),
  TELEGRAM_ALERT_CHATS: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

module.exports = { env };
