import React from 'react';
import Link from 'next/link';
import {Button} from "@/components/ui/button";
import {Card, CardHeader, CardTitle, CardContent} from "@/components/ui/card";
import {Separator} from "@/components/ui/separator";
import {slugify, cn, createSEOFriendlyTagSlug} from "@/lib/utils";
import {getFont, FontName} from '@/lib/fonts';

interface PackageCardProps {
  packageData: {
    displayName: string;
    googleFont?: FontName;
    backgroundImage?: string;
    tags: Record<string, { title: string }>;
  };
  tags: string[];
}

const PackageCard: React.FC<PackageCardProps> = ({packageData, tags}) => {
  const font = packageData.googleFont ? getFont(packageData.googleFont) : null;

  return (
    <Card className="group relative overflow-hidden transition-all">
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
        <CardHeader>
          <CardTitle className={cn(
            font ? font.className : '',
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
        <CardContent className="space-y-2">
          {tags.map((tagName) => (
            <Button
              key={tagName}
              asChild
              variant="outline"
              className={cn(
                "w-full justify-start transition-all duration-300",
                "group-hover:bg-white/10 group-hover:text-white group-hover:border-white/20 group-hover:backdrop-blur-md",
                "hover:bg-white/20 hover:text-white",
                "hover:group-hover:bg-white/30"  // Additional hover effect when card is hovered
              )}
            >
              <Link href={`/rank/${slugify(packageData.displayName)}/${createSEOFriendlyTagSlug(tagName)}`}>
                {tagName === 'all' ? 'All Items' : packageData.tags[tagName]?.title || tagName}
              </Link>
            </Button>
          ))}
        </CardContent>
      </div>
    </Card>
  );
};

export default PackageCard;
