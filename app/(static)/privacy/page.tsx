import {ContentPage, generateContentMetadata} from "@/components/ContentPage";

export default function TermsPage() {
  return <ContentPage filename="PRIVACY.md"/>;
}

export const generateMetadata = () => generateContentMetadata("PRIVACY.md");
