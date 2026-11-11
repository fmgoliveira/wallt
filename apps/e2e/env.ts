/** Values shared by the Playwright config (which starts the server with them) and the tests. */
export const PORT = 3100;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Guard for creating the first user; not a secret: the server only lives for the test run. */
export const SETUP_TOKEN = "e2e-only-setup-token-0123456789";
