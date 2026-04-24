const { z } = require('zod');

// Load .env (optional in production environments)
require('dotenv').config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
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

  // Telegram bot (required at runtime when bot is used, optional at boot)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_CHATS: z.string().optional(),
  TELEGRAM_REPORT_CHATS: z.string().optional(),
  TELEGRAM_ALERT_CHATS: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

