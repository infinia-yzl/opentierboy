import fs from 'fs';
import path from 'path';
import {MDXRemote} from 'next-mdx-remote/rsc';
import matter from 'gray-matter';
import {cn} from "@/lib/utils";

// Import shadcn components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";

interface MarkdownPageProps {
  filename: string;
}

const components = {
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
    <p className={cn("leading-7 [&:not(:first-child)]:my-4", className)} {...props} />
  ),
  ul: ({className, ...props}: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)} {...props} />
  ),
  ol: ({className, ...props}: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className={cn("my-6 ml-6 list-decimal [&>li]:mt-2", className)} {...props} />
  ),
  li: ({className, ...props}: React.HTMLAttributes<HTMLLIElement>) => (
    <li className={cn("mt-2", className)} {...props} />
  ),
  blockquote: ({className, ...props}: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)} {...props} />
  ),
  a: ({className, ...props}: React.HTMLAttributes<HTMLAnchorElement>) => (
    <a className={cn("font-medium text-primary underline underline-offset-4", className)} {...props} />
  ),
};

export default async function RemoteMdxComponent({filename}: MarkdownPageProps) {
  const filePath = path.join(process.cwd(), filename);
  const fileContents = fs.readFileSync(filePath, 'utf8');

  // Parse the frontmatter
  const {content, data} = matter(fileContents);

  return (
    <Card className="w-full max-w-4xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>{data.title}</CardTitle>
        {data.description && <CardDescription>{data.description}</CardDescription>}
        <Separator/>
      </CardHeader>
      <CardContent>
        <MDXRemote
          source={content}
          components={components}
        />
      </CardContent>
    </Card>
  );
}
