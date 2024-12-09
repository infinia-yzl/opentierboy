import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Card, CardHeader, CardTitle, CardContent} from "@/components/ui/card";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {PlusCircledIcon} from "@radix-ui/react-icons";
import PackageCard from "@/components/PackageCard";
import {Separator} from "@/components/ui/separator";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

const FEATURED_SETS = {
  "image-reachthefinals": ["all", "light", "medium", "heavy"],
  "image-supervive": [
    "hunter",
    "power",
    "fighter",
    "initiator",
    "frontliner",
    "protector",
    "controller"
  ],
  "image-wutheringwaves": ["c_all", "c_rarity_5", "c_rarity_4"],
  "image-overwatch": ["h_all", "tank", "dps", "sup"],
  "image-helldivers2": [
    "Stratagems",
    "Primaries",
    "Secondaries",
    "Grenades",
    "Boosters"
  ],
  "image-webdev": ["all", "fe", "be", "fs"],
  // Add more packages and their featured sets here
};

const Home = () => {
  return (
    <div className="container mx-auto px-8 py-4">
      <div className="text-center mb-8 md:my-8">
        <div className="text-center">
          <h1 className="relative inline-block mb-4">
            <span className="text-4xl font-extrabold tracking-tight lg:text-5xl">
              Free and Open-Source Tier Lists
            </span>
            <span className="block text-xl text-muted-foreground mt-4 font-normal tracking-wide">
              Craft, rank and share your passion with OpenTierBoy.
            </span>
          </h1>
        </div>
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
    </div>
  );
};

export default Home;
