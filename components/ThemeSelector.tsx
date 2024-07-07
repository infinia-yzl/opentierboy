'use client'

import React, {useEffect, useState} from 'react';
import {useTheme} from 'next-themes';
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
  const {setTheme, theme, resolvedTheme} = useTheme();

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
    return <Button variant="outline">Theme</Button>;
  }

  const currentColorTheme = colorThemes.find(t => document.documentElement.classList.contains(`theme-${t}`)) || 'default';
  const currentMode = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {`${currentColorTheme} (${currentMode})`}
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
        <DropdownMenuSeparator/>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
