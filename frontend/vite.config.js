import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.API_URL || env.VITE_API_URL || '';

  return {
    plugins: [react()],
    server: {
      port: 5173
    },
    envPrefix: ['VITE_', 'API_'],
    define: {
      'process.env.API_URL': JSON.stringify(apiUrl)
    }
  };
});
