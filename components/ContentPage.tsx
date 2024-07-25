import path from 'path';
import {BaseMdxComponent, generateBaseMdxMetadata} from './BaseMdxComponent';

interface ContentPageProps {
  filename: string;
}

export function ContentPage({filename}: ContentPageProps) {
  const filePath = path.join(process.cwd(), filename);

  const contentComponents = {
    // Add any content-specific components here
  };

  return <BaseMdxComponent filePath={filePath} additionalComponents={contentComponents}/>;
}

export const generateContentMetadata = generateBaseMdxMetadata;
