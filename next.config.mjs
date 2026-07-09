import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TypeScript catches real type errors. Pre-existing ESLint style issues from
    // earlier phases are tracked separately and do not block the production build.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      "ioredis",
      "rate-limiter-flexible",
      "nodemailer",
      "bcryptjs",
      "@prisma/client",
      "prisma",
      "tesseract.js",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
    ],
  },
  webpack: (config) => {
    // pdf.js requires these to be aliased to false in non-browser environments
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  // Only upload source maps when auth token is provided (production CI)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
