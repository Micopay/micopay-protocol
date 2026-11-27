import { defineConfig } from 'vite';

// COOP/COEP => crossOriginIsolated => bb.js puede usar hilos (solo en https o localhost).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { host: '0.0.0.0', port: 5179, headers: isolation },
  preview: { host: '0.0.0.0', port: 5179, headers: isolation },
  optimizeDeps: { exclude: ['@noir-lang/noirc_abi', '@noir-lang/acvm_js', '@aztec/bb.js'] },
  build: { target: 'esnext' },
  esbuild: { target: 'esnext' },
});
