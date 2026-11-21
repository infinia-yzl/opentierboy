import {NextResponse, type NextRequest} from 'next/server';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import {rankRoute, rankSegments, SHARED_LIST_SEGMENT} from '@/lib/rankRoute';


const imageSets = imagesetConfig as ImageSetConfig;

export function proxy(request: NextRequest) {
  const segments = rankSegments(request.nextUrl.pathname);
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
      let response: NextResponse;
      if (request.nextUrl.searchParams.has('state')) {
        const url = request.nextUrl.clone();
        url.pathname = ['/rank', SHARED_LIST_SEGMENT, ...request.nextUrl.pathname.split('/').slice(2).filter(Boolean)].join('/');
        response = NextResponse.rewrite(url);
      } else {
        response = NextResponse.next();
      }
      if (route.legacy) response.headers.set('X-Robots-Tag', 'noindex');
      return response;
    }
  }
}

export const config = {
  // Every /rank request: page loads, and client-side navigations (they fetch the same paths).
  matcher: ['/rank/:path*'],
};
