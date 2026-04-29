export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    error: err.message || 'Internal server error',
  });
}