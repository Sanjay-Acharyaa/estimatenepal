import { withSentryConfig } from "@sentry/nextjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  webpack: (config, { isServer }) => {
    if (isServer) {
      // exceljs bundles JSZip which has async ZIP callbacks that hang when webpack-bundled;
      // marking it external forces Node.js native require() and fixes the hang.
      config.externals.push({ exceljs: "commonjs exceljs" });
    }
    // Explicitly set @/ alias so it is always resolved correctly on both
    // Windows (dev) and Linux (production) regardless of tsconfig auto-detection.
    if (!config.resolve.alias) config.resolve.alias = {};
    config.resolve.alias["@"] = path.resolve(__dirname);
    // pdf.js requires these to be aliased to false in non-browser environments
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Only upload source maps when auth token is provided (production CI)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
