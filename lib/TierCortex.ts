import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import Item from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import LZString from 'lz-string';
import {ImageReconstructor} from "@/lib/ImageReconstruction";

const CUSTOM_ITEMS_KEY = 'customItems';
const typedImageSetConfig = imagesetConfig as ImageSetConfig;

interface EncodedState {
  title?: string;
  tiers: SimplifiedTier[];
}

interface SimplifiedTier {
  i: string; // id
  n: string; // name
  t: SimplifiedItem[]; // items
}

interface SimplifiedItem {
  i: string; // id
  c?: string; // content (only for custom items)
  d?: string; // base64 image data (for custom items)
}

export interface TierWithSimplifiedItems extends Omit<Tier, 'items'> {
  items: SimplifiedItem[];
}

interface StoredCustomItem {
  i: string; // id
  c: string; // content
  d: string; // imageData
}

export interface PackageItemLookup {
  [key: string]: Item;
}

const OG_TIER_GRADIENTS = [
  'linear-gradient(to right, #d21203, #c40a01)',
  'linear-gradient(to right, #ee1e1e, #f84a44)',
  'linear-gradient(to right, #dca414, #dc991d)',
  'linear-gradient(to right, #c98b17, #e8910f)',
  'linear-gradient(to right, #7ad21f, #1aea1d)',
  'linear-gradient(to right, #72b231, #0cd30e)',
  'linear-gradient(to right, #4d7e15, #01b004)',
];

export class TierCortex {
  // this class isn't concerned about managing UI states, so tiers are managed externally
  private readonly packageItemLookup: PackageItemLookup;
  private customItemsMap: Map<string, StoredCustomItem>;
  private readonly isServer: boolean;
  private baseUrl: string;


  constructor() {
    this.isServer = typeof window === 'undefined';
    this.baseUrl = this.isServer ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'
      : window.location.origin;
    this.packageItemLookup = this.initializePackageItemLookup();
    this.customItemsMap = new Map<string, StoredCustomItem>();

    if (!this.isServer) {
      this.initializeCustomItemsMap();
    }
  }

  public static hasBase64Images(tiers: TierWithSimplifiedItems[]): boolean {
    return tiers.some(tier => 
      tier.items.some(item => 
        item.d && item.d.startsWith('data:image/')
      )
    );
  }

  public static encodeTierStateForURL(title: string | undefined, tiers: TierWithSimplifiedItems[]): string {
    const simplifiedTiers: SimplifiedTier[] = tiers.map(tier => ({
      i: tier.id,
      n: tier.name,
      t: tier.items
    }));
    const encodedState: EncodedState = {
      tiers: simplifiedTiers
    };
    if (title) {
      encodedState.title = title;
    }
    const jsonString = JSON.stringify(encodedState);
    
    // Check if state contains Base64 images
    const hasBase64Images = TierCortex.hasBase64Images(tiers);
    
    if (hasBase64Images) {
      // Use direct URL encoding instead of LZ compression for Base64 data
      // LZ compression actually makes Base64 data larger due to lack of patterns
      return encodeURIComponent(jsonString);
    } else {
      return LZString.compressToEncodedURIComponent(jsonString);
    }
  }

  public isCustomItem(itemId: string): boolean {
    return !this.packageItemLookup.hasOwnProperty(itemId);
  }

  public getOgTierGradient(index: number, tiersLength: number): string {
    if (index === tiersLength - 1) return 'linear-gradient(to right, #f0f0f0, #f0f0f0)';
    return OG_TIER_GRADIENTS[index % OG_TIER_GRADIENTS.length];
  }

  public async decodeTierStateFromURL(encodedState: string): Promise<{ title?: string, tiers: Tier[] } | null> {
    try {
      let jsonString: string | null = null;
      
      // Try LZ decompression first (for states without Base64 images)
      try {
        jsonString = LZString.decompressFromEncodedURIComponent(encodedState);
      } catch (lzError) {
        // LZ decompression failed, try direct URL decoding
      }
      
      // If LZ decompression failed, try direct URL decoding (for Base64 image states)
      if (!jsonString) {
        try {
          jsonString = decodeURIComponent(encodedState);
        } catch (directError) {
          throw new Error('Failed to decode state with any method');
        }
      }

      if (!jsonString) throw new Error('Failed to decompress state');

      const parsed = JSON.parse(jsonString);

      let title: string | undefined;
      let simplifiedTiers: SimplifiedTier[];

      if (Array.isArray(parsed)) {
        // Old format: array of tiers
        simplifiedTiers = parsed;
      } else if (typeof parsed === 'object' && Array.isArray(parsed.tiers)) {
        // New format: object with title and tiers
        title = parsed.title;
        simplifiedTiers = parsed.tiers;
      } else {
        throw new Error('Invalid state format');
      }

      const tiers = simplifiedTiers.map(simplifiedTier => ({
        id: simplifiedTier.i,
        name: simplifiedTier.n,
        items: simplifiedTier.t.map(item => this.resolveItem(item.i, item.c, item.d))
      }));

      // Reconstruct compressed images from shared URLs
      this.reconstructCompressedImages(tiers);

      return {title, tiers};
    } catch (error) {
      console.error('Failed to decode tier state from URL:', error);
      return null;
    }
  }

  private async reconstructCompressedImages(tiers: Tier[]): Promise<void> {
    if (this.isServer) return;

    // Count images that need reconstruction
    let imageCount = 0;
    tiers.forEach(tier => {
      tier.items.forEach(item => {
        if (this.shouldReconstructImage(item.imageUrl)) {
          imageCount++;
        }
      });
    });

    if (imageCount === 0) return;

    console.log(`🔍 Reconstructing ${imageCount} compressed images for better quality...`);

    // Process images in parallel but with a reasonable concurrency limit
    const concurrency = 3; // Process 3 images at a time
    const tasks: (() => Promise<void>)[] = [];

    tiers.forEach(tier => {
      tier.items.forEach(item => {
        if (this.shouldReconstructImage(item.imageUrl)) {
          tasks.push(() => this.reconstructImage(item));
        }
      });
    });

    // Process in batches
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      await Promise.allSettled(batch.map(task => task()));
    }

    console.log(`✨ Enhanced ${imageCount} images with smart reconstruction`);
  }

  private shouldReconstructImage(imageUrl?: string): boolean {
    if (!imageUrl?.startsWith('data:image/')) return false;
    
    // Parse data URL to get actual dimensions if possible
    // For now, use a simple heuristic: if the Base64 string is relatively short,
    // it's likely a compressed image that would benefit from reconstruction
    const base64Length = imageUrl.split(',')[1]?.length || 0;
    
    // Images with Base64 < 20KB are likely compressed and would benefit from reconstruction
    // Larger Base64 strings are probably already high quality
    return base64Length > 1000 && base64Length < 30000;
  }

  private async reconstructImage(item: Item): Promise<void> {
    if (!item.imageUrl || !item.imageUrl.startsWith('data:image/')) return;

    try {
      // Create canvas from compressed Base64 image
      const sourceCanvas = await this.createCanvasFromDataUrl(item.imageUrl);
      
      // Only reconstruct if the image is small (indicating it was compressed)
      if (sourceCanvas.width <= 120 && sourceCanvas.height <= 120) {
        // Auto-detect image type and reconstruct
        const reconstructed = await ImageReconstructor.reconstruct(
          sourceCanvas,
          'auto', // Let it auto-detect the best algorithm
          200     // Target size for display
        );
        
        // Update the item with the reconstructed image
        item.imageUrl = reconstructed.toDataURL('image/webp', 0.9);
        
        // Force a small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (error) {
      console.warn('Image reconstruction failed for item:', item.id, error);
    }
  }

  private createCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  public addCustomItems(items: Item[]): void {
    if (this.isServer) return;

    const newItems = items.map(item => ({
      i: item.id,
      c: item.content,
      d: item.imageUrl ?? ''
    }));

    newItems.forEach(item => this.customItemsMap.set(item.i, item));

    const allItems = Array.from(this.customItemsMap.values());
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(allItems));
  }

  public getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
    if (initialState) {
      const decodedState = this.decodeTierStateFromURLSync(initialState);
      if (decodedState) return decodedState.tiers;
    }

    const initialTiers: Tier[] = JSON.parse(JSON.stringify(DEFAULT_TIER_TEMPLATE));

    if (initialItemSet) {
      const lastTierIndex = initialTiers.length - 1;

      initialTiers[lastTierIndex].items = initialItemSet.images.map((filename) => {
        const itemId = `${initialItemSet.packageName}-${filename}`;
        return this.packageItemLookup[itemId] || this.createPlaceholderItem(itemId, filename);
      });
    }

    return initialTiers;
  }

  public decodeTierStateFromURLSync(encodedState: string): { title?: string, tiers: Tier[] } | null {
    try {
      let jsonString: string | null = null;
      
      // Try LZ decompression first (for states without Base64 images)
      try {
        jsonString = LZString.decompressFromEncodedURIComponent(encodedState);
      } catch (lzError) {
        // LZ decompression failed, try direct URL decoding
      }
      
      // If LZ decompression failed, try direct URL decoding (for Base64 image states)
      if (!jsonString) {
        try {
          jsonString = decodeURIComponent(encodedState);
        } catch (directError) {
          throw new Error('Failed to decode state with any method');
        }
      }

      if (!jsonString) throw new Error('Failed to decompress state');

      const parsed = JSON.parse(jsonString);

      let title: string | undefined;
      let simplifiedTiers: SimplifiedTier[];

      if (Array.isArray(parsed)) {
        // Old format: array of tiers
        simplifiedTiers = parsed;
      } else if (typeof parsed === 'object' && Array.isArray(parsed.tiers)) {
        // New format: object with title and tiers
        title = parsed.title;
        simplifiedTiers = parsed.tiers;
      } else {
        throw new Error('Invalid state format');
      }

      const tiers = simplifiedTiers.map(simplifiedTier => ({
        id: simplifiedTier.i,
        name: simplifiedTier.n,
        items: simplifiedTier.t.map(item => this.resolveItem(item.i, item.c, item.d))
      }));

      return {title, tiers};
    } catch (error) {
      console.error('Failed to decode tier state from URL:', error);
      return null;
    }
  }

  public getOgSafeImageUrl(url: string): string {
    // Convert WebP to PNG
    if (url.toLowerCase().endsWith('.webp')) {
      url = url.substring(0, url.length - 5) + '.png';
    }

    // Make URL absolute if it's not already
    if (!url.startsWith('http')) {
      url = new URL(url, this.baseUrl).toString();
    }

    return url;
  }

  public getOgSafeItem(item: Item): Item {
    return {
      ...item,
      imageUrl: this.getOgSafeImageUrl(item.imageUrl ?? '')
    };
  }

  public resolveItemsFromPackage(packageName: string, filenames: string[]): Item[] {
    return filenames.map(filename => {
      const itemId = `${packageName}-${filename}`;
      return this.resolveItem(itemId, filename.split('.')[0]);
    });
  }

  public getAssetUrl(path: string): string {
    return this.getAbsoluteUrl(path);
  }

  private initializePackageItemLookup(): PackageItemLookup {
    let packageItemLookup: PackageItemLookup = {};
    for (const [packageName, packageData] of Object.entries(typedImageSetConfig.packages)) {
      for (const image of packageData.images) {
        const id = `${packageName}-${image.filename}`;
        packageItemLookup[id] = {
          id,
          content: image.label || image.filename.split('.')[0],
          imageUrl: `/images/${packageName}/${image.filename}`,
        };
      }
    }
    return packageItemLookup;
  }

  private initializeCustomItemsMap(): void {
    if (this.customItemsMap.size === 0) {
      const customItems = this.loadCustomItemsFromLocalStorage();
      customItems.forEach(item => this.customItemsMap.set(item.i, item));
    }
  }

  private resolveItem(itemId: string, content?: string, imageData?: string): Item {
    const packageItem = this.packageItemLookup[itemId];
    if (packageItem) return packageItem;

    // If we have embedded image data (from shared URL), use it directly
    if (imageData) {
      return {
        id: itemId,
        content: content || itemId,
        imageUrl: imageData, // Base64 data URL
      };
    }

    if (!this.isServer) {
      const customItem = this.customItemsMap.get(itemId);
      if (customItem) {
        return {
          id: customItem.i,
          content: content || customItem.c,
          imageUrl: customItem.d,
        };
      }
    }

    return this.createPlaceholderItem(itemId, content || '');
  }

  private createPlaceholderItem(itemId: string, content: string): Item {
    return {
      id: itemId,
      content,
      imageUrl: this.getAbsoluteUrl('/placeholder-image.png'),
    };
  }

  private loadCustomItemsFromLocalStorage(): StoredCustomItem[] {
    if (this.isServer) return [];

    const storedItems = localStorage.getItem(CUSTOM_ITEMS_KEY);
    if (!storedItems) return [];
    try {
      return JSON.parse(storedItems);
    } catch (error) {
      console.error('Failed to parse stored custom items:', error);
      return [];
    }
  }

  private getAbsoluteUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

export default TierCortex;
