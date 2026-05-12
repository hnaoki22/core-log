/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strip the X-Powered-By header — fingerprints the framework version and
  // gives no operational benefit.
  poweredByHeader: false,

  // Static security headers in addition to whatever middleware.ts injects.
  // Middleware runs on dynamic routes only; this catches the static asset
  // pipeline too.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
