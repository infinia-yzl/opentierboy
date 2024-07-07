'use client'

import React, {useEffect, useState} from 'react';
import {useTheme} from 'next-themes';
import {MoonIcon, SunIcon} from "@radix-ui/react-icons";
import {Button} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const colorThemes = ['default', 'ocean', 'forest'];

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const {setTheme} = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    const [newColorTheme, newMode] = newTheme.split('-');
    document.documentElement.classList.remove('theme-ocean', 'theme-forest');
    if (newColorTheme !== 'default') {
      document.documentElement.classList.add(`theme-${newColorTheme}`);
    }
    setTheme(newMode || newColorTheme);
  };

  if (!mounted) {
    return <Button variant="outline" size="icon"><SunIcon className="h-4 w-4"/></Button>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"/>
          <MoonIcon
            className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"/>
          <span className="sr-only">Select theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {colorThemes.map((t) => (
          <React.Fragment key={t}>
            <DropdownMenuItem onClick={() => handleThemeChange(`${t}-light`)}>
              {t.charAt(0).toUpperCase() + t.slice(1)} (Light)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleThemeChange(`${t}-dark`)}>
              {t.charAt(0).toUpperCase() + t.slice(1)} (Dark)
            </DropdownMenuItem>
            {t !== colorThemes[colorThemes.length - 1] && <DropdownMenuSeparator/>}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
