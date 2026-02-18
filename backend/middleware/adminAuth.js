/**
 * Admin Authentication Middleware
 * Protects sensitive admin/operations endpoints
 *
 * Usage: router.post('/cache/clear', adminAuth, handler)
 *
 * Authentication methods (checked in order):
 *   1. Header: x-admin-key: <ADMIN_API_KEY>
 *   2. Query:  ?adminKey=<ADMIN_API_KEY>
 */

import dotenv from 'dotenv';
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

  const provided = req.headers['x-admin-key'] || req.query.adminKey;

  if (!provided) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (provided !== ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  next();
}
