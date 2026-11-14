import {createMachine} from 'xstate';

export const linkImagesMachine = createMachine({
  id: 'linkImages',
  description: 'Images from links in the editor, from a new browser. Images from a trusted site (i.imgur.com) load at once. Images from images.example.org, a site OpenTierBoy does not know, wait behind the notice “Images from other sites” until the visitor allows the site: Load allows it for this page, and Always allow these sites keeps it in this browser. Once allowed, the page asks the site for each image once per page load, and the image shows when the site has answered with a picture. The site here answers Green, the image the visitor adds, at once. It holds its answers for Blue and Navy, the images that come with the lists, until it answers with the picture or with something that is not a picture. The page gives up on an image that the site has not answered after 10 seconds (IMAGE_CHECK_TIMES_OUT); time on the page moves only then.',
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
        greenAdded: {description: 'The visitor added Green from images.example.org with “From a link”. The link holds it, so it stays after a reload. Green shows its picture wherever the site is allowed.'},
        other: {description: 'Another list, opened from its link: Navy from images.example.org.'},
      },
    },
    site: {
      description: 'What the page allows for images.example.org, and how the site answered for Blue and Navy on this page.',
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
          description: 'Load, or adding an image from the site, allowed it for this page only. No notice. A new page load forgets it.',
          initial: 'answering',
          on: {
            RELOAD: {target: 'waiting'},
            OPEN_OTHER_LIST: {target: 'waiting'},
          },
          states: {
            answering: {
              description: 'The page asked the site for Blue (or Navy) and the site has not answered: the image shows as a label tile with the site’s name, and the page is busy.',
              on: {
                IMAGE_SITE_ANSWERS: {target: 'answered'},
                IMAGE_SITE_FAILS: {target: 'failed'},
                IMAGE_CHECK_TIMES_OUT: {target: 'gaveUp'},
              },
            },
            answered: {description: 'The site answered with the picture: every image from the site shows its picture.'},
            failed: {description: 'The site answered with something that is not a picture: Blue (or Navy) stays a label tile with the site’s name, and the page is no longer busy.'},
            gaveUp: {description: 'The site had not answered after 10 seconds, so the page gave up: Blue (or Navy) stays a label tile with the site’s name, and the page is no longer busy. A late answer changes nothing.'},
          },
        },
        alwaysAllowed: {
          description: 'This browser keeps the site as allowed. No notice, also after a reload and in other lists, and each page load asks the site again.',
          initial: 'answering',
          on: {
            RELOAD: {target: '.answering'},
            OPEN_OTHER_LIST: {target: '.answering'},
          },
          states: {
            answering: {
              description: 'The page asked the site for Blue (or Navy) and the site has not answered: the image shows as a label tile with the site’s name, and the page is busy.',
              on: {
                IMAGE_SITE_ANSWERS: {target: 'answered'},
                IMAGE_SITE_FAILS: {target: 'failed'},
                IMAGE_CHECK_TIMES_OUT: {target: 'gaveUp'},
              },
            },
            answered: {description: 'The site answered with the picture: every image from the site shows its picture.'},
            failed: {description: 'The site answered with something that is not a picture: Blue (or Navy) stays a label tile with the site’s name, and the page is no longer busy.'},
            gaveUp: {description: 'The site had not answered after 10 seconds, so the page gave up: Blue (or Navy) stays a label tile with the site’s name, and the page is no longer busy. A late answer changes nothing.'},
          },
        },
      },
    },
  },
});
