import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Absolute asset URLs also work when a nested application route is loaded directly.
export default defineConfig({
  base: "/",
  plugins: [react()],
});
