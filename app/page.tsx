import Link from "next/link";
import {Button} from "@/components/ui/button";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import PackageCard from "@/components/PackageCard";
import OwnListCard from "@/components/OwnListCard";
import RecentlyViewed from "@/components/RecentlyViewed";
import {rankPageNames} from "@/lib/imageSets";
import {templateButton} from "@/lib/templateButtons";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

// Active sets only. Legacy sets (SUPERVIVE, WUTHERING WAVES, HELLDIVERS 2, Web Development
// Technologies and the example template) are hidden here; their /rank pages still work.
const FEATURED_SETS = {
  "image-reachthefinals": ["all", "light", "medium", "heavy"],
  "image-overwatch": ["h_all", "tank", "dps", "sup"],
  // Add more packages and their featured sets here
};

// The picture on each template button: an item id (<packageName>-<filename>) per tag. When a set
// update drops that item, the button takes the template's first item (lib/templateButtons.ts).
const FEATURED_PREVIEWS: Record<string, Record<string, string>> = {
  "image-reachthefinals": {
    all: "image-reachthefinals-Sledgehammer_Rank_1.webp",
    light: "image-reachthefinals-Dagger_Rank_1.webp",
    medium: "image-reachthefinals-Defibrillator_Rank_1.webp",
    heavy: "image-reachthefinals-Mesh_Shield_Rank_1.webp",
  },
  "image-overwatch": {
    h_all: "image-overwatch-tra.webp",
    tank: "image-overwatch-rei.webp",
    dps: "image-overwatch-gen.webp",
    sup: "image-overwatch-mer.webp",
  },
};

// A server component: the item counts and pictures come from imageset.config.json at build
// time, so an image-set update changes them on its next deploy.
const Home = () => {
  return (
    <div className="flex flex-col gap-10 pb-4 md:gap-14">
      <section aria-labelledby="hero" className="flex flex-col items-center gap-2.5 pt-8 text-center md:pt-16">
        <h1 id="hero" className="text-[30px] font-black leading-[1.15] md:text-[44px]">
          Free and Open-Source Tier Lists
        </h1>
        <p className="text-base text-muted-foreground md:text-lg">Craft, rank and share your passion.</p>
        <p className="text-[13px] text-muted-foreground md:text-sm">No ads, no logins, no sign ups. Create tier lists for free.</p>
        <Button asChild variant="outline" size="sm" className="mt-2.5 text-[13px]">
          <Link href={"/about"}>
            Learn More
          </Link>
        </Button>
      </section>

      <section aria-labelledby="create" className="flex flex-col gap-4">
        <h2 id="create" className="text-[22px] font-black md:text-2xl">
          Create a New Tier List
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {/* Featured sets */}
          {Object.entries(FEATURED_SETS).map(([packageName, tags]) => {
            const packageData = typedImageSetConfig.packages[packageName];
            if (!packageData || packageData.legacy) return null;
            const templates = tags.map((tag) => templateButton(packageName, packageData, tag, FEATURED_PREVIEWS[packageName]?.[tag]));
            return <PackageCard key={packageName} packageName={packageName} packageData={packageData} templates={templates}/>;
          })}

          <OwnListCard/>
        </div>
      </section>

      <RecentlyViewed pageNames={rankPageNames()}/>
    </div>
  );
};

export default Home;
