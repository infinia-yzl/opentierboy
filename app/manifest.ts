import {MetadataRoute} from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenTierBoy',
    short_name: 'OpenTierBoy',
    description: "OpenTierBoy: The free, open-source tier list creator that helps you craft, rank and share your passion! No ads, no logins, no sign-ups. Create and share your tier lists instantly simply by copying the URL to your tier list.",
    start_url: '/',
    display: 'standalone',
    icons: [
      {
        src: '/icon16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        src: '/icon32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/icon150.png',
        sizes: '150x150',
        type: 'image/png',
      },
      {
        src: '/icon192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon256.png',
        sizes: '256x256',
        type: 'image/png',
      },
      {
        src: '/icon512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/safari-pinned-tab.svg',
        purpose: 'maskable',
      }
    ],
    shortcuts: [
      {
        "name": "About",
        "url": "/about",
        "description": "Learn more about OpenTierBoy"
      },
      {
        "name": "Blog",
        "url": "/blog",
        "description": "Read the latest blog posts from OpenTierBoy"
      },
      {
        "name": "Create New Blank Tier List",
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
    categories: ["productivity", "utilities", "entertainment"],
  }
}
