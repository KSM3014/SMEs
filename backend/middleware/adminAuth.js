/**
 * Admin Authentication Middleware
 * Protects sensitive admin/operations endpoints
 *
 * Usage: router.post('/cache/clear', adminAuth, handler)
 *
 * Authentication: Header only
 *   x-admin-key: <ADMIN_API_KEY>
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export default function adminAuth(req, res, next) {
  if (!ADMIN_API_KEY) {
    console.warn('[AdminAuth] ADMIN_API_KEY not configured in .env — blocking all admin requests');
    return res.status(503).json({
      success: false,
      error: 'Admin access not configured'
    });
  }

  const provided = req.headers['x-admin-key'];

  if (!provided) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Use x-admin-key header.'
    });
  }

  // Timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(ADMIN_API_KEY))) {
    return res.status(403).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  next();
}
