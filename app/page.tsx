import Link from 'next/link';
import {Button} from "@/components/ui/button";
import {Card, CardHeader, CardTitle, CardContent} from "@/components/ui/card";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {slugify} from "@/lib/utils";
import {PlusCircledIcon} from "@radix-ui/react-icons";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

const featuredSets = {
  "image-reachthefinals": ['all', 'light', 'medium', 'heavy'],
  // Add more packages and their featured sets here
};

const Home = () => {
  return (
    <main className="container mx-auto px-8 py-4">
      <h1 className="text-3xl font-bold pb-8 text-center">Create a New Tier List</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Featured sets */}
        {Object.entries(featuredSets).map(([packageName, tags]) => {
          const packageData = typedImageSetConfig.packages[packageName];
          if (!packageData) return null;

          return (
            <Card key={packageName}>
              <CardHeader>
                <CardTitle>{packageData.displayName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tags.map((tagName) => (
                  <Button
                    key={tagName}
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={`/rank/${slugify(packageData.displayName)}/${tagName}`}>
                      {tagName === 'all' ? 'All Items' : packageData.tags[tagName]?.title || tagName}
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <CardTitle>Others</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full" variant="outline">
              <Link href="/rank/">
                <PlusCircledIcon className="mr-2 h-4 w-4"/>
                Create Blank List
              </Link>
            </Button>
            <Button asChild className="w-full" variant="outline">
              <Link href={"/rank/image-set/all"}>
                Example template
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Home;
