import fs from 'fs';
import {MDXRemote} from 'next-mdx-remote/rsc';
import matter from 'gray-matter';
import {cn} from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {Metadata} from "next";

export interface MdxData {
  title: string;
  description?: string;
  date?: Date;
  tags?: string[];

  [key: string]: any;
}

interface BaseMdxComponentProps {
  filePath: string;
  additionalComponents?: Record<string, React.ComponentType<any>>;
}

const baseComponents = {
  h1: ({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className={cn("scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl", className)} {...props} />
  ),
  h2: ({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className={cn("scroll-m-20 border-b pt-8 pb-2 mb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0", className)} {...props} />
  ),
  h3: ({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className={cn("scroll-m-20 text-2xl py-2 font-semibold tracking-tight", className)} {...props} />
  ),
  p: ({className, ...props}: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className={cn("leading-7 [&:not(:first-child)]:my-3", className)} {...props} />
  ),
  ul: ({className, ...props}: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className={cn("mb-6 ml-6 list-disc [&>li]:mt-2 [&>li]:mb-1", className)} {...props} />
  ),
  ol: ({className, ...props}: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className={cn("mb-6 ml-6 list-decimal [&>li]:mt-2 [&>li:has(img)+li]:mt-6", className)} {...props} />
  ),
  li: ({className, ...props}: React.HTMLAttributes<HTMLLIElement>) => (
    <li className={cn("mt-2 [&>img]:mt-4", className)} {...props} />
  ),
  blockquote: ({className, ...props}: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)} {...props} />
  ),
  a: ({className, ...props}: React.HTMLAttributes<HTMLAnchorElement>) => (
    <a className={cn("font-medium text-primary underline underline-offset-4", className)} {...props} />
  ),
};

export function BaseMdxComponent({filePath, additionalComponents = {}}: BaseMdxComponentProps) {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const {content, data} = matter(fileContents);

  const allComponents = {...baseComponents, ...additionalComponents};

  return (
    <Card className="w-full max-w-4xl md:max-w-screen-2xl mx-auto mt-4">
      <CardHeader>
        <CardTitle>{data.title}</CardTitle>
        {data.description && <CardDescription>{data.description}</CardDescription>}
        <Separator/>
      </CardHeader>
      <CardContent>
        <MDXRemote
          source={content}
          components={allComponents}
        />
      </CardContent>
    </Card>
  );
}

export function generateBaseMdxMetadata(filePath: string): Metadata {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const {data} = matter(fileContents);
  const mdxData = data as MdxData;
  if (!mdxData.title) {
    throw new Error(`Missing required 'title' in frontmatter for file: ${filePath}`);
  }

  return {
    title: mdxData.title,
    description: mdxData.description,
    openGraph: {
      title: mdxData.title,
      description: mdxData.description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: mdxData.title,
      description: mdxData.description,
    },
    keywords: mdxData.tags,
  };
}
