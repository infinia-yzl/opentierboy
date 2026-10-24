import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig, {ImageSetPackage} from "@/models/ImageSet";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

/**
 * The image sets that people can choose: the template picker, the landing page, the sitemap
 * and the prebuilt /rank pages list these. Legacy sets are left out. They still open by URL
 * (/rank/<set>/<tag>), and old links and link previews that use them keep working.
 */
export function visibleImageSets(): [packageName: string, packageData: ImageSetPackage][] {
  return Object.entries(typedImageSetConfig.packages).filter(([, packageData]) => !packageData.legacy);
}
