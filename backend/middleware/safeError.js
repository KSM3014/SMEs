/**
 * Safe error response helper
 * Returns detailed errors only in development mode
 */

export function safeErrorMessage(error) {
  if (process.env.NODE_ENV === 'development') return error.message;
  return 'Internal server error';
}

export function sendError(res, statusCode, error) {
  console.error(`[Error ${statusCode}]`, error.message || error);
  res.status(statusCode).json({
    success: false,
    error: safeErrorMessage(error)
  });
}
