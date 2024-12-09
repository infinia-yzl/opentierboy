import {Saira, Cinzel, Russo_One, Chakra_Petch} from 'next/font/google';

const sairaFont = Saira({subsets: ['latin'], display: 'swap'});
const cinzelFont = Cinzel({subsets: ['latin'], display: 'swap'});
const russoOne = Russo_One({subsets: ['latin'], display: 'swap', weight: ['400']});
const chakraPetch = Chakra_Petch({subsets: ['latin'], display: 'swap', weight: ['700']})

const fontDefinitions = {
  'Saira': sairaFont,
  'Cinzel': cinzelFont,
  'Russo One': russoOne,
  'Chakra Petch': chakraPetch,
};

export type FontName = keyof typeof fontDefinitions;

export function getFont(name: FontName) {
  return fontDefinitions[name];
}
