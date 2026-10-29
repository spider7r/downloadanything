import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        // Return JSON — never an HTML error page — when the API is down
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            if ("writeHead" in res) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Download server unavailable (it may be restarting). Try again shortly.",
                }),
              );
            }
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
