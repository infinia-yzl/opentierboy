import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import {Metadata} from 'next';
import {BaseMdxComponent, MdxData} from './BaseMdxComponent';
import {format} from "date-fns";
import StructuredMetadata from "@/components/StructuredMetadata";

interface BlogPostProps {
  slug: string;
}

export function BlogPost({slug}: BlogPostProps) {
  const filePath = path.join(process.cwd(), 'articles', `${slug}.md`);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const {data} = matter(fileContents);
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
    image: mdxData.ogImage ? `https://www.opentierboy.com${mdxData.ogImage}` : undefined,
  };

  const blogComponents = {
    // Add any blog-specific components here
  };

  return (
    <>
      <StructuredMetadata data={jsonLd}/>
      <BaseMdxComponent filePath={filePath} additionalComponents={blogComponents}/>
    </>
  );
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

  return {
    title: mdxData.title,
    description: mdxData.description,
    openGraph: {
      title: mdxData.title,
      description: mdxData.description,
      type: 'article',
      publishedTime: formattedDate,
      tags: mdxData.tags,
      siteName: 'OpenTierBoy',
      url: `https://www.opentierboy.com/blog/${slug}`,
      images: mdxData.ogImage ? [
        {
          url: `https://www.opentierboy.com${mdxData.ogImage}`,
          width: 1200,
          height: 630,
          alt: mdxData.title,
        }
      ] : [
        {
          url: 'https://www.opentierboy.com/opengraph-image.png',
          width: 1200,
          height: 630,
          alt: 'OpenTierBoy',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: mdxData.title,
      description: mdxData.description,
      images: mdxData.ogImage ? [`https://www.opentierboy.com${mdxData.ogImage}`] : undefined,
    },
    alternates: {
      canonical: `https://www.opentierboy.com/blog/${slug}`,
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

