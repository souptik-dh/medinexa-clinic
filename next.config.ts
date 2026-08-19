import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  turbopack: {
    // Pin the workspace root to this project - without this, a stray
    // package.json/package-lock.json in a parent directory (e.g. from
    // running an npm command in the wrong folder) makes Turbopack infer
    // the wrong root and fail to resolve dependencies like tailwindcss.
    root: __dirname,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
