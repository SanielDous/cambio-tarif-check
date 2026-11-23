/**
 * Where the end-to-end tests find the production build. vite preview serves the same dist/ under
 * a sub-path the build was not made for and at the site root (see e2e/preview.mjs); both must
 * work.
 */
export const SUB_PATH = "/nested/deploy/";
export const PORT = 4173;
export const ROOT_PORT = 4174;
export const BASE_URL = `http://localhost:${PORT}${SUB_PATH}`;
export const ROOT_URL = `http://localhost:${ROOT_PORT}/`;
