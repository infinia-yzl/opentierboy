import fs from 'node:fs';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import matter from 'gray-matter';
import {compileMDX} from 'next-mdx-remote/rsc';
import {describe, expect, it} from 'vitest';
import {MDX_OPTIONS} from '@/lib/mdx';

type Props = Record<string, string>;

/** Stands in for TierListItem and prints the props it receives. */
const TierListItem = (props: Props) =>
  createElement('a', {href: props.url, 'data-title': props.title, 'data-image': props.imageSrc});

async function render(source: string): Promise<string> {
  const {content} = await compileMDX({source, options: MDX_OPTIONS, components: {TierListItem}});
  return renderToStaticMarkup(content);
}

describe('blog articles (MDX)', () => {
  it('removes JavaScript expressions instead of running them', async () => {
    const html = await render([
      'Sum: {1 + 1}',
      '',
      '{globalThis.process ? "server" : "browser"}',
      '',
      '<TierListItem title={"x" + "y"} url="https://example.com/" imageSrc="/a.webp"/>',
    ].join('\n'));

    expect(html).toContain('Sum:');
    expect(html).not.toContain('2');
    expect(html).not.toContain('server');
    expect(html).not.toContain('browser');
    expect(html).not.toContain('xy');
  });

  it('renders the components of every article with their string props', async () => {
    const articlesDir = path.join(process.cwd(), 'articles');
    for (const file of fs.readdirSync(articlesDir).filter((name) => name.endsWith('.md'))) {
      const {content} = matter(fs.readFileSync(path.join(articlesDir, file), 'utf8'));
      const expected = Array.from(content.matchAll(/<TierListItem\b[^>]*\burl="([^"]+)"/g), (match) => match[1]);

      const html = await render(content);

      const rendered = Array.from(html.matchAll(/<a href="([^"]+)" data-title="[^"]+" data-image="[^"]+"/g),
        (match) => match[1].replace(/&amp;/g, '&'));
      expect(rendered, file).toEqual(expected);
    }
  });
});
