import {Metadata} from "next";
import {createSEOFriendlyTagSlug} from "@/lib/utils";
import {permanentRedirect} from "next/navigation";
import {rankMetadata} from "@/app/rank/rankMetadata";

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

  if (nameOrPackage && tagSlug) {
    const normalizedTagSlug = createSEOFriendlyTagSlug(tagSlug);
    if (normalizedTagSlug !== tagSlug) {
      const searchParams = await props.searchParams;
      const searchParamsString = new URLSearchParams(searchParams as Record<string, string>).toString();
      permanentRedirect(`/rank/${nameOrPackage}/${normalizedTagSlug}${searchParamsString ? `?${searchParamsString}` : ''}`);
    }
  }

  return null;
}
