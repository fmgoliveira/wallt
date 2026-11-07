import preset from "@wallt/ui/preset";
import type { Config } from "tailwindcss";

export default {
  presets: [preset],
  content: ["./app/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
} satisfies Config;
