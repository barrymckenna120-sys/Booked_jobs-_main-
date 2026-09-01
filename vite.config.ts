import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
      devOptions: {
        enabled: false,
      },

      workbox: {
        cacheId: "bookedjobs-v1",
        cleanupOutdatedCaches: true,

        // Activation is controlled explicitly by the update banner
        // (updateServiceWorker(true)). Forcing skipWaiting/clientsClaim here
        // would swap code under a user who may have unsaved work open.
        skipWaiting: false,
        clientsClaim: false,


        // Precache only what's needed to boot the app shell. The previous glob
        // ("**/*.{js,css,html,ico,png,svg,woff2}") precached 158 files / ~20 MB
        // uncompressed on every first load and after every deploy — including
        // ~7 MB of marketing imagery and every lazy route chunk — which on a
        // weak connection drains for minutes. Route chunks and images are still
        // cached on demand by the CacheFirst /assets/ rule below.
        globPatterns: [
          "index.html",
          "offline.html",
          "assets/index-*.{js,css}",
          "manifest*.json",
          "*.ico",
          "icons/*.png",
        ],
        globIgnores: [
          "**/images/**",
          "**/*.png.br",
          "landing-page.html",
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,


        navigateFallback: "/index.html",

        navigateFallbackAllowlist: [
          /^\/(?!rest|functions|~oauth|storage|realtime|sw\.js|firebase-messaging-sw\.js|assets|icons|manifest\.json|offline\.html|robots\.txt|placeholder\.svg).*/,
        ],

        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/~oauth/,
          /^\/storage/,
          /^\/realtime/,
          /^\/$/,
          /^\/auth/,
          /^\/engineer/,
          /^\/dashboard/,
          /^\/admin/,
          /^\/jobs/,
          /^\/customers/,
          /^\/certificates/,
          /^\/reset-password/,
          /^\/reset-admin/,
          /^\/quote/,
          /^\/pdf/,
          /^\/b/,
        ],

        runtimeCaching: [
          {
            urlPattern: ({ request, url }: { request: Request; url: URL }) => {
              if (request.mode !== "navigate") return false;

              const denied = [
                /^\/rest/,
                /^\/functions/,
                /^\/~oauth/,
                /^\/storage/,
                /^\/realtime/,
                /^\/$/,
                /^\/auth/,
                /^\/engineer/,
                /^\/dashboard/,
                /^\/admin/,
                /^\/jobs/,
                /^\/customers/,
                /^\/certificates/,
                /^\/reset-password/,
                /^\/reset-admin/,
                /^\/quote/,
                /^\/pdf/,
                /^\/b/,
              ];

              return !denied.some((re) => re.test(url.pathname));
            },

            handler: "NetworkFirst",

            options: {
              cacheName: "html",
              networkTimeoutSeconds: 15,
            },
          },

          // Hashed build assets are immutable, so CacheFirst is safe and lets a
          // tab that hasn't updated yet still resolve an older JS/CSS chunk
          // after a deploy instead of 404 / ChunkLoadError.
          {
            urlPattern: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
              sameOrigin &&
              request.method === "GET" &&
              url.pathname.startsWith("/assets/"),

            handler: "CacheFirst",

            options: {
              cacheName: "assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
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
          charts: ["recharts"],
          spreadsheet: ["xlsx-js-style"],
          firebase: [
            "firebase/app",
            "firebase/analytics",
            "firebase/messaging",
          ],
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