export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}