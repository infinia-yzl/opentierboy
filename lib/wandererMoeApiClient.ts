import ky from 'ky';

const API_BASE_URL = 'https://api.wanderer.moe';

const api = ky.create({
  prefixUrl: API_BASE_URL,
});

export interface MoeGame {
  name: string;
  path: string;
  tags: string[];
  totalFiles: number;
  lastUploaded: string;
  subfolders: MoeSubfolder[];
}

export interface MoeSubfolder {
  name: string;
  path: string;
  fileCount: number;
  lastUploaded: string;
}

export interface MoeAsset {
  name: string;
  nameWithExtension: string;
  path: string;
  uploaded: string;
  size: number;
}

export interface MoeGameAssetResponse {
  success: boolean;
  status: string;
  path: string;
  game: string;
  asset: string;
  lastUploaded: MoeAsset;
  images: MoeAsset[];
}

export const wandererMoeApiClient = {
  async getAllGames(): Promise<MoeGame[]> {
    const response = await api.get('games').json<{ games: MoeGame[] }>();
    return response.games;
  },

  async getGameAssetData(gameName: string, assetType: string): Promise<MoeGameAssetResponse> {
    return api.get(`game/${gameName}/${assetType}`).json<MoeGameAssetResponse>();
  },
};

export function FormatGameName(name: string) {
  return name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function FormatCategoryName(name: string) {
  return name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// export function bytesToFileSize(bytes: number) {
//   const sizes = ["B", "KB", "MB", "GB", "TB"];
//   if (bytes === 0) return "0 B";
//   const i = Math.floor(Math.log2(bytes) / 10);
//   const formatter = new Intl.NumberFormat("default", {
//     maximumFractionDigits: 1,
//   });
//   const size = formatter.format(bytes / 1024 ** i);
//   return `${size} ${sizes[i]}`;
// }

export const API_PREFIX_MOE = 'am3-';

export function encodeMoeApiItemId(gameName: string, assetType: string, assetName: string): string {
  return `${API_PREFIX_MOE}${gameName}/${assetType}/${assetName}`;
}

export function extractMoeApiItemInfo(itemId: string): {
  gameName: string,
  assetType: string,
  assetName: string
} | null {
  if (!itemId.startsWith(API_PREFIX_MOE)) {
    return null;
  }

  const parts = itemId.slice(API_PREFIX_MOE.length).split('/');
  if (parts.length !== 3) {
    return null;
  }

  const [gameName, assetType, assetName] = parts;
  return {gameName, assetType, assetName};
}

interface ApiMoeItemCache {
  [key: string]: {
    imageUrl: string;
    expiresAt: number;
  };
}

export const apiMoeItemCache: ApiMoeItemCache = {};

