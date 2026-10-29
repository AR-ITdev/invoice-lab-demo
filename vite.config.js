import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the static build works from any host or subfolder, which keeps a future migration trivial.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
