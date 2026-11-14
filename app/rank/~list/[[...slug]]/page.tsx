import {Metadata} from "next";
import {createSEOFriendlyTagSlug} from "@/lib/utils";
import {permanentRedirect} from "next/navigation";
import {PageStarted} from "@/components/StartHold";
import {rankMetadata} from "@/app/rank/rankMetadata";

/**
 * Every editor address with a list in its link (/rank/<set>/<tag>?state=…, and /rank?state=…).
 * The proxy rewrites them here (lib/rankRoute.ts, SHARED_LIST_SEGMENT); the browser keeps the
 * address it asked for. Rendered on request, so a shared link's title and link preview come from
 * its list. The editor itself sits in app/rank/layout.tsx and reads the list from the address,
 * so the list goes to the browser once: as the editor's HTML.
 */
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const state = typeof searchParams.state === 'string' ? searchParams.state : undefined;
  return rankMetadata(params.slug, state);
}

export default async function SharedListPage(props: Props) {
  const params = await props.params;
  const [nameOrPackage, tagSlug] = params.slug || [];

  // proxy.ts answers an old tag path with a 308 before the page renders; this is the fallback.
  if (nameOrPackage && tagSlug) {
    const normalizedTagSlug = createSEOFriendlyTagSlug(tagSlug);
    if (normalizedTagSlug !== tagSlug) {
      const searchParams = await props.searchParams;
      const searchParamsString = new URLSearchParams(searchParams as Record<string, string>).toString();
      permanentRedirect(`/rank/${nameOrPackage}/${normalizedTagSlug}${searchParamsString ? `?${searchParamsString}` : ''}`);
    }
  }

  return <PageStarted/>;
}
