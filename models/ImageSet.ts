export interface ImageSetPackage {
  displayName: string;
  images: {
    filename: string;
    label: string;
    tags: string[];
  }[];
  tags: {
    [key: string]: {
      title: string;
      description: string;
      category: string;
    };
  };
  /**
   * A legacy set is frozen (imageset.legacy.json, images committed in public/images/). Its
   * /rank pages, old links and link previews keep working, but the template picker, the
   * landing page and the sitemap leave it out.
   */
  legacy?: boolean;
}

export default interface ImageSetConfig {
  packages: {
    [key: string]: ImageSetPackage;
  };
}
