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
        src: '/favicon.ico',
        sizes: 'any',
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
        "url": "/rank/wuthering-waves/c_all",
        "description": "Rank Wuthering Waves Resonators in your own tier list and share it with the community"
      }
    ],
    categories: ["productivity", "utilities"],
  }
}
