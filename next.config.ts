import type { NextConfig } from "next";

// Allow the dev server to be opened from a phone via the LAN address in APP_URL.
const appHost = (() => {
  try {
    return new URL(process.env.APP_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: appHost && appHost !== "localhost" ? [appHost] : [],
  serverExternalPackages: ["web-push", "pg", "@prisma/adapter-pg"],
};

export default nextConfig;
