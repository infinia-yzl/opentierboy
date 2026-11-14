import {createMachine} from 'xstate';

export const zenStepsMachine = createMachine({
  id: 'zenSteps',
  description: 'The Zen bar’s Back and Forward and its step count “n / m”, over three versions of the list: the list as opened and two changes, made in Zen. The count says which version is on screen, out of the versions of this list in the tab’s history. Back is off on the first version, so it never leaves the list, and Forward is off on the latest. The bar’s buttons and the browser’s own Back and Forward step through the same history entries, and a change after Back drops the later versions.',
  initial: 'step1of1',
  states: {
    step1of1: {
      description: 'The list as opened: 1 / 1. Back and Forward are off. The browser’s Forward changes nothing.',
      on: {CHANGE_LIST: {target: 'step2of2'}},
    },
    step1of2: {
      description: 'The list as opened, one version behind the latest: 1 / 2. Back is off, Forward is on.',
      on: {
        CHANGE_LIST: {target: 'step2of2'},
        ZEN_FORWARD: {target: 'step2of2'},
        BROWSER_FORWARD: {target: 'step2of2'},
      },
    },
    step2of2: {
      description: 'The first change, the latest version: 2 / 2. Back is on, Forward is off. The browser’s Forward changes nothing.',
      on: {
        CHANGE_LIST: {target: 'step3of3'},
        ZEN_BACK: {target: 'step1of2'},
        BROWSER_BACK: {target: 'step1of2'},
      },
    },
    step1of3: {
      description: 'The list as opened, two versions behind the latest: 1 / 3. Back is off, Forward is on.',
      on: {
        CHANGE_LIST: {target: 'step2of2'},
        ZEN_FORWARD: {target: 'step2of3'},
        BROWSER_FORWARD: {target: 'step2of3'},
      },
    },
    step2of3: {
      description: 'The first change, one version behind the latest: 2 / 3. Back and Forward are on.',
      on: {
        CHANGE_LIST: {target: 'step3of3'},
        ZEN_BACK: {target: 'step1of3'},
        BROWSER_BACK: {target: 'step1of3'},
        ZEN_FORWARD: {target: 'step3of3'},
        BROWSER_FORWARD: {target: 'step3of3'},
      },
    },
    step3of3: {
      description: 'The second change, the latest version: 3 / 3. Every Unranked item is ranked, so no change is left to make. Back is on, Forward is off. The browser’s Forward changes nothing.',
      on: {
        ZEN_BACK: {target: 'step2of3'},
        BROWSER_BACK: {target: 'step2of3'},
      },
    },
  },
});
