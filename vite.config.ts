import { defineConfig } from "vite";
import basicSsl from '@vitejs/plugin-basic-ssl'
import solidPlugin from "vite-plugin-solid";
import alias from "@rollup/plugin-alias";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [solidPlugin(), alias(), basicSsl()],
  server: {
    port: 3000,
    https: true,
  },
  build: {
    target: "esnext",
  },
  resolve: {
    alias: [
      {
        find: "~",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
});
