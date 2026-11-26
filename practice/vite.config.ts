import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at https://lambdanotfound.github.io/practice/, so the site root
// stays free for a homepage.
export default defineConfig({
  base: "/practice/",
  plugins: [react()],
});
