import type {NextConfig} from 'next';
import {contentSecurityPolicyHeader} from './lib/security/csp';
import {SECURITY_HEADERS} from './lib/security/headers';

// Image sets are prepared before the build by the `prebuild` npm script
// (scripts/prepareImages.js), not here: Next.js 16 builds with Turbopack, which does not
// run webpack hooks.

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `next dev` would otherwise append its own block to AGENTS.md (a symlink to CLAUDE.md)
  // whenever it detects a coding agent. CLAUDE.md is the owner's file.
  agentRules: false,

  transpilePackages: ['next-mdx-remote'],

  // Every image that next/image optimizes is the app's own (relative URLs, including the
  // placeholder tile of an unknown item), so the optimizer fetches no remote images. Link
  // images are plain <img> elements and never go through the optimizer (A8): never add
  // `https://**` to `images.remotePatterns`.

  // Content Security Policy on every page (lib/security/csp.ts, amendments A11 and A39),
  // and the other security headers (lib/security/headers.ts).
  // `next dev` needs eval; Vercel preview deployments show the Vercel Toolbar.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        contentSecurityPolicyHeader({
          dev: process.env.NODE_ENV !== 'production',
          vercelToolbar: process.env.VERCEL_ENV === 'preview',
        }),
        ...SECURITY_HEADERS,
      ],
    }];
  },
};

export default nextConfig;
