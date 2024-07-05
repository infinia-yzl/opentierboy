import {ThemeToggle} from "@/components/ThemeToggle";
import TierListManager from "@/components/TierListManager";
import {ZenToggle} from "@/components/ZenToggle";
import imagesetConfig from '../imageset.config.json';
import Item from "@/models/Item";
import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";

const getInitialItems = (): Item[] => {
  return imagesetConfig.packageImages.flatMap(({packageName, images}) =>
    images.map((image: string, index: number) => ({
      id: `${packageName}-item-${index}`,
      content: `${image.split('.')[0]}`,
      imageUrl: `/images/${packageName}/${image}`,
    }))
  );
};

const Home = () => {
  const initialItems = getInitialItems();
  const initialTiers: Tier[] = [
    ...DEFAULT_TIER_TEMPLATE,
    {id: 'uncategorized', name: '', items: initialItems, labelPosition: 'left'},
  ];

  return (
    <main className="flex flex-col items-center justify-between">
      <h1 className="text-3xl p-12">Tier Scribble <ThemeToggle/></h1>
      <TierListManager initialTiers={initialTiers}>
        <div className="flex flex-auto space-x-2">
          <ZenToggle/>
        </div>
      </TierListManager>
    </main>
  );
};

export default Home;
