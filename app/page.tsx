import {ThemeToggle} from "@/components/ThemeToggle";
import TierListManager from "@/components/TierListManager";
import {ZenToggle} from "@/components/ZenToggle";
import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";

const Home = () => {
  const initialTiers: Tier[] = [
    ...DEFAULT_TIER_TEMPLATE,
    {id: 'uncategorized', name: '', items: [], labelPosition: 'left'},
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
