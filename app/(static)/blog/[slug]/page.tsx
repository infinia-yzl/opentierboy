import {BlogPost, generateMetadata, generateStaticParams} from "@/components/BlogPost";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import React from "react";
import {FaDiscord} from "react-icons/fa6";

export default function Page({params}: { params: { slug: string } }) {
  return (
    <div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator/>
          <BreadcrumbItem>
            <BreadcrumbLink href="/blog">blog</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator/>
          <BreadcrumbItem>
            <BreadcrumbLink href={`/blog/${params.slug}`}>{params.slug}</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <BlogPost slug={params.slug}/>
      <section className="py-20">
        <Card className="bg-primary text-primary-foreground p-4">
          <CardHeader>
            <CardTitle className="text-2xl md:text-4xl font-bold text-center font-heading">
              Got something to say?
            </CardTitle>
            <CardDescription className="text-lg text-center">
              Share it with us on Discord!
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center px-8">
            <div className="flex justify-center space-x-4 mb-6">
              <Button variant="secondary" asChild>
                <a href="https://discord.gg/CEtDSHV38b" className="flex items-center space-x-2" aria-label="Discord">
                  <FaDiscord className="h-5 w-5"/>
                  <span>Join our Discord</span>
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export {generateMetadata, generateStaticParams};
