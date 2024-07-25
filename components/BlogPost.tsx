import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import {Metadata} from 'next';
import {BaseMdxComponent, MdxData} from './BaseMdxComponent';
import {format} from "date-fns";

interface BlogPostProps {
  slug: string;
}

export function BlogPost({slug}: BlogPostProps) {
  const filePath = path.join(process.cwd(), 'articles', `${slug}.md`);

  const blogComponents = {
    // Add any blog-specific components here
  };

  return <BaseMdxComponent filePath={filePath} additionalComponents={blogComponents}/>;
}

export async function generateMetadata({params}: { params: { slug: string } }): Promise<Metadata> {
  const slug = params.slug;
  const filePath = path.join(process.cwd(), 'articles', `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return {
      title: 'Blog Post Not Found',
    };
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const {data} = matter(fileContents);

  // Type assertion to ensure data conforms to MdxData interface
  const mdxData = data as MdxData;

  const publishDate = mdxData.date ? new Date(mdxData.date) : new Date();
  const formattedDate = format(publishDate, "yyyy-MM-dd");

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: mdxData.title,
    description: mdxData.description,
    datePublished: formattedDate,
    keywords: mdxData.tags?.join(', '),
  };

  return {
    title: mdxData.title,
    description: mdxData.description,
    openGraph: {
      title: mdxData.title,
      description: mdxData.description,
      type: 'article',
      publishedTime: formattedDate,
      tags: mdxData.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: mdxData.title,
      description: mdxData.description,
    },
    alternates: {
      canonical: `https://www.opentierboy.com/blog/${slug}`,
      types: {
        'application/ld+json': JSON.stringify(jsonLd),
      },
    },
    keywords: mdxData.tags,
  };
}

export async function generateStaticParams() {
  const files = fs.readdirSync(path.join(process.cwd(), 'articles'));

  return files.map((filename) => ({
    slug: filename.replace('.md', ''),
  }));
}

