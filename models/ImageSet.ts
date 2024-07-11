export default interface ImageSetConfig {
  packages: {
    [key: string]: {
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
    };
  };
}
