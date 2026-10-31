import type {MDXRemoteProps} from 'next-mdx-remote/rsc';

/**
 * Options for rendering blog articles (articles/*.md) with next-mdx-remote.
 *
 * Articles are Markdown with a few components that take only string props, such as
 * <TierListItem title="..." url="..." imageSrc="..."/>. JavaScript expressions such as
 * {variable} or prop={value} are removed, never run.
 */
export const MDX_OPTIONS: MDXRemoteProps['options'] = {blockJS: true, blockDangerousJS: true};
