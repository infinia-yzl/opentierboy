import React from 'react';
import Link from 'next/link';
import {Button} from "@/components/ui/button";
import {Card, CardHeader, CardTitle, CardContent} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {cn} from "@/lib/utils";
import {getFont, FontName} from '@/lib/fonts';
import {gameColourKey} from '@/lib/appearance';
import type {TemplateButton} from '@/lib/templateButtons';

interface PackageCardProps {
  packageName: string;
  packageData: {
    displayName: string;
    googleFont?: FontName;
    backgroundImage?: string;
  };
  /** The card's template buttons (lib/templateButtons.ts: templateButton), in order. */
  templates: TemplateButton[];
}

const PackageCard: React.FC<PackageCardProps> = ({packageName, packageData, templates}) => {
  const font = packageData.googleFont ? getFont(packageData.googleFont) : null;
  const titleId = `set-${packageName}`;

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      data-game-card={gameColourKey(packageName)}
      className="group relative overflow-hidden transition-all"
    >
      {/* Background image (visible on hover) */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{
          backgroundImage: packageData.backgroundImage ? `url(${packageData.backgroundImage})` : undefined,
        }}
      />
      {/* Gradient overlay (visible on hover) */}
      <div className="absolute inset-0 bg-linear-to-b/srgb from-black/60 via-black/30 to-transparent opacity-0
        group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"/>

      {/* Card content */}
      <div className="relative z-10">
        <CardHeader className="p-5 pb-0">
          <CardTitle id={titleId} className={cn(
            font ? font.className : '',
            // The game's colour (app/globals.css, --game-title), or the text colour when game
            // colours are off.
            "text-[22px] leading-tight text-[hsl(var(--game-title,var(--card-foreground)))]",
            // Tailwind 3's drop-shadow-lg (Tailwind 4 changed the values of that class).
            "transition-colors duration-300 group-hover:text-white group-hover:drop-shadow-[0_10px_8px_rgb(0_0_0/0.04),0_4px_3px_rgb(0_0_0/0.1)]"
          )}>
            {packageData.displayName}
          </CardTitle>
          <Separator
            style={{
              backgroundImage: packageData.backgroundImage ? `url(${packageData.backgroundImage})` : undefined,
            }}
          />
        </CardHeader>
        <CardContent className="p-5 pt-3.5">
          <nav aria-label={`${packageData.displayName} templates`} className="space-y-2">
            {templates.map((template) => (
              <Button
                key={template.tag}
                asChild
                variant="outline"
                className={cn(
                  "w-full justify-start gap-2.5 pl-1.5 pr-3 transition-all duration-300",
                  "group-hover:bg-white/10 group-hover:text-white group-hover:border-white/20 group-hover:backdrop-blur-md",
                  "hover:bg-white/20 hover:text-white",
                  "hover:group-hover:bg-white/30"  // Additional hover effect when card is hovered
                )}
              >
                <Link href={template.href} aria-label={template.ariaLabel}>
                  {template.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a plain 24 px picture from public/images/, loaded lazily
                    <img
                      src={template.preview.src}
                      alt={template.preview.alt}
                      width={24}
                      height={24}
                      loading="lazy"
                      className="size-6 shrink-0 rounded-[4px] bg-muted object-cover"
                    />
                  ) : (
                    <span aria-hidden="true" className="size-6 shrink-0 rounded-[4px] bg-muted"/>
                  )}
                  <span className="min-w-0 grow truncate">{template.title}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[13px] font-normal tabular-nums text-muted-foreground transition-colors duration-300 group-hover:text-white/70"
                  >
                    {template.countText}
                  </span>
                </Link>
              </Button>
            ))}
          </nav>
        </CardContent>
      </div>
    </Card>
  );
};

export default PackageCard;
