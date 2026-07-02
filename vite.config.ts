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
      registerType: "autoUpdate",
      filename: "sw.js",
      strategies: "generateSW",
      injectRegister: null,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 20000,
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/\~oauth/,
          /^\/$/,
          /^\/auth/,
          /^\/engineer/,
          /^\/dashboard/,
          /^\/admin/,
          /^\/jobs/,
          /^\/customers/,
          /^\/certificates/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/service_calls/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-service-calls",
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/engineers/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-engineers",
              expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
