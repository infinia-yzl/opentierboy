import {createMachine} from 'xstate';

export const shareScribblesMachine = createMachine({
  id: 'shareScribbles',
  description: 'The URL tab of the Share panel on a list with scribbles: the group “Include scribbles” with its switch, Copy link and Copy Markdown, and whether the link in the clipboard has the ink value of the address. The model draws one note in Zen, with the panel closed. The switch is a setting of the page: it stays when the panel closes and opens, and it changes neither the list nor the address.',
  type: 'parallel',
  states: {
    panel: {
      description: 'The Share panel, a popover under the Share button. It opens on the URL tab.',
      initial: 'closed',
      states: {
        closed: {
          description: 'Only the Share button shows.',
          on: {OPEN_SHARE_PANEL: {target: 'open'}},
        },
        open: {
          description: 'The URL tab of the panel “Share Your Rankings”.',
          on: {CLOSE_WITH_SHARE_BUTTON: {target: 'closed'}},
        },
      },
    },
    scribbles: {
      description: 'Scribbles on the list, the switch “Include scribbles”, and the ink value in the copied link.',
      initial: 'none',
      states: {
        none: {
          description: 'The list has no scribbles and the address no ink value: the URL tab has no group, no switch and no Copy link.',
          on: {DRAW_SCRIBBLE: {target: 'included'}},
        },
        included: {
          description: 'One note is on the list. The switch is on, with the line “Every button below shares your scribbles too”.',
          initial: 'clipboardWithout',
          on: {
            COPY_MARKDOWN: {target: '.clipboardWith'},
            COPY_LINK: {target: '.clipboardWith'},
          },
          states: {
            clipboardWithout: {
              description: 'The clipboard is empty, or its link has no ink value.',
              on: {SWITCH_SCRIBBLES_OFF: {target: '#shareScribbles.scribbles.leftOut.clipboardWithout'}},
            },
            clipboardWith: {
              description: 'The link in the clipboard has the ink value of the address.',
              on: {SWITCH_SCRIBBLES_OFF: {target: '#shareScribbles.scribbles.leftOut.clipboardWith'}},
            },
          },
        },
        leftOut: {
          description: 'One note is on the list. The switch is off, with the line “Every button below shares the list without your scribbles”. The note stays on the list and in the address.',
          initial: 'clipboardWithout',
          on: {
            COPY_MARKDOWN: {target: '.clipboardWithout'},
            COPY_LINK: {target: '.clipboardWithout'},
          },
          states: {
            clipboardWithout: {
              description: 'The clipboard is empty, or its link has no ink value.',
              on: {SWITCH_SCRIBBLES_ON: {target: '#shareScribbles.scribbles.included.clipboardWithout'}},
            },
            clipboardWith: {
              description: 'The link in the clipboard has the ink value, from a copy made while the switch was on.',
              on: {SWITCH_SCRIBBLES_ON: {target: '#shareScribbles.scribbles.included.clipboardWith'}},
            },
          },
        },
      },
    },
  },
});
