import type {BrowserContext} from '@playwright/test';

/**
 * Vercel Deployment Protection lets automated tests through when a request carries this
 * header with the project's bypass secret (Vercel: Protection Bypass for Automation).
 */
export const BYPASS_HEADER = 'x-vercel-protection-bypass';

export const bypassSecret = (): string | undefined =>
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined;

/**
 * Adds the bypass header to browser requests for the site under test, and to nothing else.
 *
 * A global `extraHTTPHeaders` entry would send the secret to every origin the page
 * loads, including images from other sites. This route matches only requests whose
 * origin equals the origin of `baseURL`. Without a secret it does nothing, so local runs
 * and pull request CI behave exactly as before.
 */
export async function sendBypassOnlyToSite(context: BrowserContext, baseURL: string | undefined) {
  const secret = bypassSecret();
  if (!secret || !baseURL) return;

  const siteOrigin = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin === siteOrigin,
    // fallback() lets a test's own page.route handlers still see the request.
    (route) => route.fallback({headers: {...route.request().headers(), [BYPASS_HEADER]: secret}}),
  );
}
