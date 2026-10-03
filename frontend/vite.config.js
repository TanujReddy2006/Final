import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const envFrontend = loadEnv(mode, __dirname, '');
  const envRoot = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const env = { ...envRoot, ...envFrontend };
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';
  const apiUrl = env.API_URL || env.VITE_API_URL || 'http://localhost:4000/api/v1';

  return {
    plugins: [react()],
    server: {
      port: 5173
    },
    envPrefix: ['VITE_', 'API_'],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'process.env.API_URL': JSON.stringify(apiUrl)
    }
  };
});
