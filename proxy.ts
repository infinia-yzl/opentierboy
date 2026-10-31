import {NextResponse, type NextRequest} from 'next/server';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import {rankRoute} from '@/lib/rankRoute';

/**
 * HTTP status codes for /rank paths (owner review of #196: "Legacy stuff should use correct
 * HTTP codes"). The editor page streams, so it always answers 200; the status is decided here,
 * before the page renders (lib/rankRoute.ts):
 *
 * - an old tag path (underscores, capitals): 308 to its URL form, with the same query;
 * - a template that does not exist (unknown set or tag, and no list in the link): 404;
 * - a path with a malformed escape (such as %E0%A4%A): 400;
 * - a legacy set's page: 200 with `X-Robots-Tag: noindex`, so search engines drop it while
 *   bookmarks, blog links and shared links keep working;
 * - everything else, and every link with a list in it: the page, unchanged.
 */

const imageSets = imagesetConfig as ImageSetConfig;

function pathSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').slice(2).filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // A malformed escape such as %E0%A4%A.
  }
}

export function proxy(request: NextRequest) {
  const segments = pathSegments(request.nextUrl.pathname);
  // Before, the page failed with 500 on such a path.
  if (!segments) return new NextResponse('Bad request', {status: 400});
  const hasState = request.nextUrl.searchParams.getAll('state').length === 1;
  const route = rankRoute(imageSets, segments, hasState);

  switch (route.kind) {
    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = route.pathname;
      return NextResponse.redirect(url, 308);
    }
    case 'notFound':
      // Next.js's own not-found page, inside the site layout, with status 404.
      return NextResponse.rewrite(new URL('/_not-found', request.url), {status: 404});
    case 'page': {
      const response = NextResponse.next();
      if (route.legacy) response.headers.set('X-Robots-Tag', 'noindex');
      return response;
    }
  }
}

export const config = {
  // Every /rank request: page loads, and client-side navigations (they fetch the same paths).
  matcher: ['/rank/:path*'],
};
