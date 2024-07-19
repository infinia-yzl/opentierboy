import {Saira, Cinzel, Russo_One} from 'next/font/google';

const sairaFont = Saira({subsets: ['latin'], display: 'swap'});
const cinzelFont = Cinzel({subsets: ['latin'], display: 'swap'});
const russoOne = Russo_One({subsets: ['latin'], display: 'swap', weight: ['400']});

const fontDefinitions = {
  'Saira': sairaFont,
  'Cinzel': cinzelFont,
  'Russo One': russoOne,
};

export type FontName = keyof typeof fontDefinitions;

export function getFont(name: FontName) {
  return fontDefinitions[name];
}
