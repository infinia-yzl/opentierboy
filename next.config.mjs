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

  images: {
    // The placeholder tile for an unknown item points at http://localhost:3000 outside
    // Vercel (TierCortex.baseUrl). Next.js 16 stops the image optimizer from fetching local
    // addresses unless this is on. It stays off on Vercel, where the pattern below matches
    // nothing.
    dangerouslyAllowLocalIP: !process.env.VERCEL,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '**/placeholder-image.png',
      },
    ],
  },
};

export default nextConfig;
