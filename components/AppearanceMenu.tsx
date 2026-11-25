'use client'

import React, {useSyncExternalStore} from 'react';
import {useTheme} from 'next-themes';
import {MoonIcon, SunIcon} from '@radix-ui/react-icons';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {modeOf, showsDark, type FontChoice, type Mode} from '@/lib/appearance';
import {useFontChoice, useGameColours} from '@/components/useAppearance';

const MODE_LABELS: Record<Mode, string> = {light: 'Light', dark: 'Dark', system: 'System'};

const subscribeToNothing = () => () => {};

/** Keeps the menu open after a choice, so people can try the options one after another. */
const stayOpen = (event: Event) => event.preventDefault();

/**
 * The site header's Appearance menu (owner decision, 2026-10-28): Mode, Game colours and Font.
 * The button's icon shows the mode the page is in: a sun in light, a moon in dark.
 */
export function AppearanceMenu() {
  // The mode is known only in the browser: render the plain button on the server and while
  // hydrating, then the real menu.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const {theme, setTheme, resolvedTheme} = useTheme();
  const [font, setFont] = useFontChoice();
  const [gameColours, setGameColours] = useGameColours();

  const icon = (dark: boolean) => (
    <>
      <SunIcon className={`h-[1.2rem] w-[1.2rem] transition-all ${dark ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}/>
      <MoonIcon className={`absolute h-[1.2rem] w-[1.2rem] transition-all ${dark ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}/>
    </>
  );

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" aria-label="Appearance">
        {icon(false)}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Appearance">
          {icon(showsDark(theme, resolvedTheme))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={modeOf(theme)} onValueChange={(value) => setTheme(value)}>
          {(Object.keys(MODE_LABELS) as Mode[]).map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode} onSelect={stayOpen}>
              {MODE_LABELS[mode]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator/>
        <DropdownMenuCheckboxItem checked={gameColours} onCheckedChange={setGameColours} onSelect={stayOpen}>
          Game colours
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator/>
        <DropdownMenuLabel>Font</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={font} onValueChange={(value) => setFont(value as FontChoice)}>
          <DropdownMenuRadioItem value="modern" onSelect={stayOpen} style={{fontFamily: 'var(--font-geologica)'}}>
            Modern
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="classic" onSelect={stayOpen} style={{fontFamily: 'var(--font-nunito)'}}>
            Classic
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
