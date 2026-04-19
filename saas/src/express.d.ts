import type { ApiKeyRecord } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      apiTier?: ApiKeyRecord['tier'];
      rateLimit?: number;
    }
  }
}
