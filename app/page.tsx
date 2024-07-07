import TierListManager from "@/components/TierListManager";
import {ZenToggle} from "@/components/ZenToggle";
import {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import {ThemeSelector} from "@/components/ThemeSelector";

const Home = () => {
  return (
    <main className="flex flex-col items-center justify-between">
      <h1 className="text-3xl p-12">Tier Scribble <ThemeSelector/></h1>
      <TierListManager initialTiers={DEFAULT_TIER_TEMPLATE}>
        <div className="flex flex-auto space-x-2">
          <ZenToggle/>
        </div>
      </TierListManager>
    </main>
  );
};

export default Home;
