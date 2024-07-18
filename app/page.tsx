import Link from 'next/link';
import {Button} from "@/components/ui/button";
import {Card, CardHeader, CardTitle, CardContent} from "@/components/ui/card";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {PlusCircledIcon} from "@radix-ui/react-icons";
import PackageCard from "@/components/PackageCard";
import {Separator} from "@/components/ui/separator";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

const FEATURED_SETS = {
  "image-reachthefinals": ['all', 'light', 'medium', 'heavy'],
  "image-wutheringwaves": [
    'c_all',
    'c_rarity_5',
    'c_rarity_4',
  ]
  // Add more packages and their featured sets here
};

const Home = () => {
  return (
    <main className="container mx-auto px-8 py-4">
      <div className="text-center mb-8">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Welcome to OpenTierBoy
        </h1>
        <p className="text-xl text-muted-foreground [&:not(:first-child)]:mt-4 mb-4">
          Craft, rank, share your tier lists - free and open-source.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={"/about"}>
            Learn More
          </Link>
        </Button>
      </div>
      <div className="flex justify-center items-center w-full my-10">
        <Separator className="w-1/4"/>
      </div>
      <h2 className="scroll-m-20 pb-4 text-3xl font-semibold tracking-tight first:mt-0">
        Create a New Tier List
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Featured sets */}
        {Object.entries(FEATURED_SETS).map(([packageName, tags]) => {
          const packageData = typedImageSetConfig.packages[packageName];
          if (!packageData) return null;

          return <PackageCard key={packageName} packageData={packageData} tags={tags}/>
        })}

        <Card>
          <CardHeader>
            <CardTitle>Others</CardTitle>
            <Separator/>
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
