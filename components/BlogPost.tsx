import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import {Metadata} from 'next';
import {BaseMdxComponent, generateBaseMdxMetadata, MdxData} from './BaseMdxComponent';
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

  return {
    title: mdxData.title,
    description: mdxData.description,
    openGraph: {
      title: mdxData.title,
      description: mdxData.description,
      type: 'article',
      publishedTime: format(mdxData.date ?? new Date(), 'MMMM d, yyyy'),
      tags: mdxData.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: mdxData.title,
      description: mdxData.description,
    },
  };
}

export async function generateStaticParams() {
  const files = fs.readdirSync(path.join(process.cwd(), 'articles'));

  return files.map((filename) => ({
    slug: filename.replace('.md', ''),
  }));
}

