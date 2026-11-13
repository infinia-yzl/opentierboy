import {createMachine} from 'xstate';

export const linkImagesMachine = createMachine({
  id: 'linkImages',
  description: 'Images from links in the editor, from a new browser. Images from a trusted site (i.imgur.com) load at once. Images from images.example.org, a site OpenTierBoy does not know, wait behind the notice “Images from other sites” until the visitor allows the site: Load allows it for this page, and Always allow these sites keeps it in this browser.',
  type: 'parallel',
  states: {
    list: {
      description: 'The list on screen.',
      initial: 'first',
      on: {OPEN_OTHER_LIST: {target: '.other'}},
      states: {
        first: {
          description: 'The list as opened: Blue from images.example.org and Red from i.imgur.com in Unranked.',
          on: {ADD_IMAGE_FROM_LINK: {target: 'greenAdded'}},
        },
        greenAdded: {description: 'The visitor added Green from images.example.org with “From a link”. The link holds it, so it stays after a reload.'},
        other: {description: 'Another list, opened from its link: Navy from images.example.org.'},
      },
    },
    site: {
      description: 'What the page allows for images.example.org.',
      initial: 'waiting',
      states: {
        waiting: {
          description: 'The notice lists images.example.org. The site’s images show as label tiles with its name, and the page sent no request to it since it loaded.',
          on: {
            LOAD_IMAGES: {target: 'allowedHere'},
            ALWAYS_ALLOW_SITES: {target: 'alwaysAllowed'},
            ADD_IMAGE_FROM_LINK: {target: 'allowedHere'},
          },
        },
        allowedHere: {
          description: 'Load, or adding an image from the site, allowed it for this page only. No notice, and every image from the site loads. A new page load forgets it.',
          on: {
            RELOAD: {target: 'waiting'},
            OPEN_OTHER_LIST: {target: 'waiting'},
          },
        },
        alwaysAllowed: {description: 'This browser keeps the site as allowed. No notice, and its images load, also after a reload and in other lists.'},
      },
    },
  },
});
