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
} from "@/components/ui/dropdown-menu";

const colorThemes = ['classic', 'ocean', 'forest'];

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const {theme, setTheme} = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newColorTheme: string, forcedMode?: 'light' | 'dark') => {
    const currentMode = isDarkTheme() ? 'dark' : 'light';
    const newMode = forcedMode || currentMode;

    if (newColorTheme === 'classic') {
      setTheme(newMode);
    } else {
      setTheme(`${newColorTheme}-${newMode}`);
    }
  };

  const isDarkTheme = () => {
    return theme?.includes('dark') || theme?.endsWith('-dark');
  };

  if (!mounted) {
    return <Button variant="outline" size="icon"><SunIcon className="h-[1.2rem] w-[1.2rem]"/></Button>;
  }

  const isCurrentDark = isDarkTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <SunIcon
            className={`h-[1.2rem] w-[1.2rem] transition-all ${isCurrentDark ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}/>
          <MoonIcon
            className={`absolute h-[1.2rem] w-[1.2rem] transition-all ${isCurrentDark ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}/>
          <span className="sr-only">Select theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        {colorThemes.map((colorTheme) => (
          <DropdownMenuItem
            key={colorTheme}
            className="flex items-center justify-between p-2"
            onClick={() => handleThemeChange(colorTheme)}
          >
            <span className="flex-grow pl-2 text-sm">
              {colorTheme.charAt(0).toUpperCase() + colorTheme.slice(1)}
            </span>
            <div className="flex space-x-0.5" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleThemeChange(colorTheme, 'light')}
                aria-label={`Set ${colorTheme} light theme`}
              >
                <SunIcon className="h-4 w-4"/>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleThemeChange(colorTheme, 'dark')}
                aria-label={`Set ${colorTheme} dark theme`}
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
