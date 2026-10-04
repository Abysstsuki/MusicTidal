import type { NextConfig } from "next";

const nextConfig = {
  distDir: process.env.MUSICTIDAL_NEXT_DIST_DIR || '.next',
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

export default nextConfig;
