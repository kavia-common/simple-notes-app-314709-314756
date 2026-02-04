const { createProxyMiddleware } = require("http-proxy-middleware");

/**
 * CRA dev server proxy configuration.
 *
 * Why: In development, calling a backend on a different origin (different port)
 * requires the backend to be configured with CORS. If it isn't, browsers will
 * fail requests with a generic "Failed to fetch".
 *
 * This proxy makes requests from the React dev server appear same-origin to the
 * browser, avoiding CORS entirely.
 *
 * Note: This file is only used by `react-scripts start` (development).
 */
module.exports = function setupProxy(app) {
  const target =
    process.env.REACT_APP_BACKEND_URL ||
    process.env.REACT_APP_API_BASE ||
    "http://localhost:8000";

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false, // allow self-signed certs in dev if present
    logLevel: "warn",
  });

  // Proxy common API roots. This lets the frontend call /notes, /api/notes, /v1/notes
  // without embedding cross-origin URLs in the browser.
  app.use("/notes", proxy);
  app.use("/api", proxy);
  app.use("/v1", proxy);
  app.use("/health", proxy);
  app.use("/healthz", proxy);
};
