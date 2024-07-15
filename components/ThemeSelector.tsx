'use client'

import React, {useEffect, useState} from 'react';
import {useTheme} from 'next-themes';
import {MoonIcon, SunIcon} from "@radix-ui/react-icons";
import {Button} from "@/components/ui/button";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,} from "@/components/ui/dropdown-menu";

const colorThemes = ['classic', 'ocean', 'forest'];

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const {setTheme} = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    const [newColorTheme, newMode] = newTheme.split('-');
    document.documentElement.classList.remove('theme-ocean', 'theme-forest');
    if (newColorTheme !== 'classic') {
      document.documentElement.classList.add(`theme-${newColorTheme}`);
    }
    setTheme(newMode);
  };

  if (!mounted) {
    return <Button variant="outline" size="icon"><SunIcon className="h-[1.2rem] w-[1.2rem]"/></Button>;
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
      <DropdownMenuContent className="w-48">
        {colorThemes.map((colorTheme) => (
          <DropdownMenuItem key={colorTheme}
                            className="flex items-center justify-between p-2"
                            onClick={() => handleThemeChange(colorTheme)}
          >
            <span className="flex-grow pl-2 text-sm">
              {colorTheme.charAt(0).toUpperCase() + colorTheme.slice(1)}
            </span>
            <div className="flex space-x-0.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  handleThemeChange(`${colorTheme}-light`);
                }}
              >
                <SunIcon className="h-4 w-4"/>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  handleThemeChange(`${colorTheme}-dark`);
                }}
              >
                <MoonIcon className="h-4 w-4"/>
              </Button>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
