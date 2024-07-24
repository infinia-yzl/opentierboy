import {ContentPage, generateContentMetadata} from "@/components/ContentPage";

export default function TermsPage() {
  return <ContentPage filename="TERMS.md"/>;
}

export const generateMetadata = () => generateContentMetadata("TERMS.md");
