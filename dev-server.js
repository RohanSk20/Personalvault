import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from './api/[...route].js';

// Load .env or .env.local if present
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, envFile);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    console.log(`Loaded environment from ${envFile}`);
    break;
  }
}

const PORT = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`PersonalVault API server running at http://localhost:${PORT}`);
  console.log(`Ready to receive requests proxied from Vite dev server.`);
});
