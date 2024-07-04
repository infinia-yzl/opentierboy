import {ThemeToggle} from "@/components/ThemeToggle";
import TierListManager from "@/components/TierListManager";
import {ZenToggle} from "@/components/ZenToggle";
import imagesetConfig from '../imageset.config.json';
import {ItemProps} from "@/components/Item";

export interface Tier {
  id: string;
  name: string;
  items: ItemProps[];
  labelPosition?: 'top' | 'left' | 'right';
  placeholder?: string;
}

const getInitialItems = (): ItemProps[] => {
  return imagesetConfig.packageImages.flatMap(({packageName, images}) =>
    images.map((image: string, index: number) => ({
      id: `${packageName}-item-${index}`,
      content: `${image.split('.')[0]}`,
      imageUrl: `/images/${packageName}/${image}`,
    }))
  );
};

const getInitialTiers = (items: ItemProps[]): Tier[] => [
  {id: 'tier-s', name: 'S', items: [], labelPosition: 'left', placeholder: 'S'},
  {id: 'tier-a', name: 'A', items: [], labelPosition: 'left', placeholder: 'A'},
  {id: 'tier-b', name: 'B', items: [], labelPosition: 'left', placeholder: 'B'},
  {id: 'tier-c', name: 'C', items: [], labelPosition: 'left', placeholder: 'C'},
  {id: 'tier-f', name: 'F', items: [], labelPosition: 'left', placeholder: 'F'},
  {id: 'uncategorized', name: '', items: items, labelPosition: 'left'},
];

const Home = () => {
  const initialItems = getInitialItems();
  const initialTiers = getInitialTiers(initialItems);

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
