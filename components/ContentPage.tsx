import path from 'path';
import {BaseMdxComponent, generateBaseMdxMetadata} from './BaseMdxComponent';

// The build traces the files that server code reads and deploys them with it. Fixed paths
// keep that to these two files. A path built from a prop makes Turbopack trace the whole
// project, public images included.
const CONTENT_FILES = {
  'TERMS.md': path.join(process.cwd(), 'TERMS.md'),
  'PRIVACY.md': path.join(process.cwd(), 'PRIVACY.md'),
};

interface ContentPageProps {
  filename: keyof typeof CONTENT_FILES;
}

export function ContentPage({filename}: ContentPageProps) {
  const filePath = CONTENT_FILES[filename];

  const contentComponents = {
    // Add any content-specific components here
  };

  return <BaseMdxComponent filePath={filePath} additionalComponents={contentComponents}/>;
}

export const generateContentMetadata = generateBaseMdxMetadata;
