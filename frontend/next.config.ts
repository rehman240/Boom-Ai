import type { NextConfig } from "next";

// Where the FastAPI backend runs. Read at build time (rewrites are baked into the build).
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Self-contained server build, so the app runs in Docker on any host (Vercel, AWS, ...).
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    // The browser only talks to this app. /api/* is forwarded to the backend, which keeps
    // the login cookie same-site (Safari blocks cookies between different domains).
    return [{ source: "/api/:path*", destination: `${backendUrl}/:path*` }];
  },
};

export default nextConfig;
