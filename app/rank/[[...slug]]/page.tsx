import {Metadata} from "next";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";
import {permanentRedirect} from "next/navigation";
import {visibleImageSets} from "@/lib/imageSets";
import {PageStarted} from "@/components/StartHold";
import {rankMetadata} from "@/app/rank/rankMetadata";

/**
 * The template pages (/rank/<set>/<tag>) and the blank /rank, without a list in the link. Built
 * once, so the CDN serves them: nothing here reads the address's query. The editor itself sits in
 * app/rank/layout.tsx and reads the template from the path. An address with a list in its link
 * (`?state=`) never reaches this route: the proxy rewrites it to app/rank/~list (lib/rankRoute.ts).
 */
export const dynamic = 'force-static';

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [{slug: []}];
  // Legacy sets are left out here. Their pages still render on request, once, and are kept.
  visibleImageSets().forEach(([packageName, packageData]) => {
    const displayNameSlug = slugify(packageData.displayName);
    // Generate params for both packageName and displayName
    [packageName, displayNameSlug].forEach(nameOrPackage => {
      params.push({slug: [nameOrPackage, 'all']});
      Object.keys(packageData.tags).forEach((tagName) => {
        const seoFriendlyTag = createSEOFriendlyTagSlug(tagName);
        params.push({slug: [nameOrPackage, seoFriendlyTag]});
      });
    });
  });
  return params;
}

type Props = {
  params: Promise<{ slug?: string[] }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  return rankMetadata(params.slug, undefined);
}

export default async function TemplatePage(props: Props) {
  const params = await props.params;
  const [nameOrPackage, tagSlug] = params.slug || [];

  // proxy.ts answers an old tag path with a 308 before the page renders; this is the fallback.
  if (nameOrPackage && tagSlug) {
    const normalizedTagSlug = createSEOFriendlyTagSlug(tagSlug);
    if (normalizedTagSlug !== tagSlug) permanentRedirect(`/rank/${nameOrPackage}/${normalizedTagSlug}`);
  }

  return <PageStarted/>;
}
