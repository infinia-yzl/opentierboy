import {MetadataRoute} from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenTierBoy',
    short_name: 'OTB',
    description: "Craft, rank, and share your passion with OpenTierBoy",
    start_url: '/',
    display: 'standalone',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon-16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        src: '/icon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
    shortcuts: [
      {
        "name": "Create New Tier List",
        "url": "/rank",
        "description": "Start crafting a new tier list from a blank slate"
      },
      {
        "name": "Rank The Finals Equipment",
        "url": "/rank/the-finals/all",
        "description": "Rank equipments and specializations from The Finals in your own tier list and share it with the community"
      },
      {
        "name": "Rank Wuthering Waves Resonators",
        "url": "/rank/wuthering-waves/c-all",
        "description": "Rank Wuthering Waves Resonators in your own tier list and share it with the community"
      },
      {
        "name": "Rank Overwatch Heroes",
        "url": "/rank/overwatch/h-all",
        "description": "Rank Overwatch Heroes in your own tier list and share it with the community"
      },
    ],
    categories: ["productivity", "utilities"],
  }
}
