import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      filename: "sw.js",
      strategies: "generateSW",
      injectRegister: null,
      devOptions: { enabled: false },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [
          /^\/(?!(?:rest|functions|~oauth|storage|realtime|sw\.js|firebase-messaging-sw\.js|assets|icons|manifest\.json|offline\.html|robots\.txt|placeholder\.svg)).*/,
        ],
        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/~oauth/,
          /^\/storage/,
          /^\/realtime/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => {
              if (request.mode !== "navigate") return false;
              const denied = [
                /^\/rest/, /^\/functions/, /^\/~oauth/, /^\/storage/, /^\/realtime/,
              ];
              return !denied.some((re) => re.test(url.pathname));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 15,
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest/,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy, rarely-needed-on-first-paint libs get their own chunks so the
          // landing page and login don't pay for them.
          charts: ["recharts"],
          spreadsheet: ["xlsx-js-style"],
          firebase: ["firebase/app", "firebase/analytics", "firebase/messaging"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
