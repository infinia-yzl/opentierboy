import {ContentPage, generateContentMetadata} from "@/components/ContentPage";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import React from "react";
import {PageStarted} from '@/components/StartHold';

export default function TermsPage() {
  return (
    <div>
      <PageStarted/>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator/>
          <BreadcrumbItem>
            <BreadcrumbLink href="/privacy">privacy</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ContentPage filename="PRIVACY.md"/>
    </div>
  );
}

export const generateMetadata = () => generateContentMetadata("PRIVACY.md");
