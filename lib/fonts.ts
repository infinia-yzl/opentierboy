import {Saira, Cinzel} from 'next/font/google';

const sairaFont = Saira({subsets: ['latin'], display: 'swap'});
const cinzelFont = Cinzel({subsets: ['latin'], display: 'swap'});

const fontDefinitions = {
  'Saira': sairaFont,
  'Cinzel': cinzelFont,
};

export type FontName = keyof typeof fontDefinitions;

export function getFont(name: FontName) {
  return fontDefinitions[name];
}
