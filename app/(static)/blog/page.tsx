import React from 'react';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Link from 'next/link';
import {format, compareDesc} from 'date-fns';
import {Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";

interface BlogPost {
  slug: string;
  title: string;
  date: Date;
  description?: string;
}

interface MdxData {
  title: string;
  date?: Date;
  description?: string;
}

function getBlogPosts(): BlogPost[] {
  const postsDirectory = path.join(process.cwd(), 'articles');
  const fileNames = fs.readdirSync(postsDirectory);

  const posts = fileNames.map((fileName) => {
    const slug = fileName.replace(/\.md$/, '');
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const {data} = matter(fileContents);
    const mdxData = data as MdxData;

    return {
      slug,
      title: mdxData.title,
      date: mdxData.date ?? new Date(),
      description: mdxData.description,
    };
  });

  return posts.sort((a, b) => compareDesc(a.date, b.date));
}

const BlogPostCard: React.FC<BlogPost> = ({slug, title, date, description}) => (
  <Link href={`/blog/${slug}`} className="hover:underline">
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-heading">
          {title}
        </CardTitle>
        <CardDescription>{format(date, 'MMMM d, yyyy')}</CardDescription>
      </CardHeader>
      {description && (
        <CardContent>
          <p>{description}</p>
        </CardContent>
      )}
      <CardFooter>
        Read More &rarr;
      </CardFooter>
    </Card>
  </Link>
);

const BlogPostList: React.FC = () => {
  const posts = getBlogPosts();

  return (
    <div className="max-w-4xl md:max-w-screen-2xl mx-auto mt-8 p-4">
      <Breadcrumb className="py-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator/>
          <BreadcrumbItem>
            <BreadcrumbLink href="/blog">blog</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-3xl font-bold mb-6 flex flex-col">
        <span className="text-4xl font-extrabold tracking-tight lg:text-5xl">
          Blog
        </span>
        <span className="block text-xl text-muted-foreground mt-4 font-normal tracking-wide">
          The latest articles and content from the team at OpenTierBoy.
        </span>
      </h1>
      <Separator className="my-4"/>
      <div className="space-y-4">
        {posts.map((post) => (
          <BlogPostCard key={post.slug} {...post} />
        ))}
      </div>
    </div>
  );
};

export default BlogPostList;

export function generateMetadata() {
  return {
    title: 'Blog Posts',
    description: 'A list of all our blog posts',
  };
}
