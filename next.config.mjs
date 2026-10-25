// Image sets are prepared before the build by the `prebuild` npm script
// (scripts/prepareImages.js), not here: Next.js 16 builds with Turbopack, which does not
// run webpack hooks.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `next dev` would otherwise append its own block to AGENTS.md (a symlink to CLAUDE.md)
  // whenever it detects a coding agent. CLAUDE.md is the owner's file.
  agentRules: false,

  transpilePackages: ['next-mdx-remote'],

  // Every image that next/image optimizes is the app's own (relative URLs, including the
  // placeholder tile of an unknown item), so the optimizer fetches no remote images.
};

export default nextConfig;
