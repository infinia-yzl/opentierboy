import {Metadata} from "next";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";
import {permanentRedirect} from "next/navigation";
import {visibleImageSets} from "@/lib/imageSets";
import {rankMetadata} from "@/app/rank/rankMetadata";

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [{slug: []}];
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

  if (nameOrPackage && tagSlug) {
    const normalizedTagSlug = createSEOFriendlyTagSlug(tagSlug);
    if (normalizedTagSlug !== tagSlug) permanentRedirect(`/rank/${nameOrPackage}/${normalizedTagSlug}`);
  }

  return null;
}
