import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'";

export default defineConfig({
  plugins: [
    react(),
    // Restrictive content policy for the shipped build. Not applied in dev, where Vite injects inline helpers.
    { name: "vh-csp", apply: "build", transformIndexHtml: (html: string) => html.replace("<!--CSP-->", `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`) },
  ],
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5173, strictPort: false },
  build: { target: "es2022", outDir: "dist" },
});
