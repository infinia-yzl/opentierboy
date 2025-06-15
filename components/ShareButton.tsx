import React, {useCallback, useRef, useState} from 'react';
import html2canvas from 'html2canvas';
import html2canvasPro from 'html2canvas-pro';
import Image from 'next/image';
import {Button} from "@/components/ui/button"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover"
import {CameraIcon, ImageIcon, QuestionMarkCircledIcon, Share1Icon} from '@radix-ui/react-icons';
import {toast} from 'sonner';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {Skeleton} from "@/components/ui/skeleton";
import {FaFacebookF, FaMarkdown, FaXTwitter} from "react-icons/fa6";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {useTierContext} from "@/contexts/TierContext";
import {TierCortex, TierWithSimplifiedItems} from "@/lib/TierCortex";
import {usePathname} from "next/navigation";

type SocialPlatform = 'facebook' | 'twitter';
type CaptureMethod = 'original' | 'pro';

interface ShareButtonProps {
  title: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({title}) => {
  const {tiers, tierCortex} = useTierContext();
  const pathname = usePathname();

  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>('pro');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isGeneratingShareUrl, setIsGeneratingShareUrl] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Check if there are custom images that need Base64 encoding
  const hasCustomImages = tiers.some(tier =>
    tier.items.some(item => tierCortex.isCustomItem(item.id))
  );

  const generateShareUrlWithImages = useCallback(async () => {
    if (!hasCustomImages) {
      // No custom images, just copy current URL
      navigator.clipboard.writeText(window.location.href);
      toast.success('URL copied to clipboard');
      return;
    }

    setIsGeneratingShareUrl(true);
    try {
      // Convert custom images to Base64
      const tiersWithBase64: TierWithSimplifiedItems[] = await Promise.all(
        tiers.map(async (tier) => ({
          ...tier,
          items: await Promise.all(
            tier.items.map(async (item) => {
              if (tierCortex.isCustomItem(item.id) && item.imageUrl?.startsWith('blob:')) {
                try {
                  // Convert blob URL to Base64
                  const response = await fetch(item.imageUrl);
                  const blob = await response.blob();

                  // Create canvas to resize and compress
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d')!;
                  const img = document.createElement('img');

                  const base64 = await new Promise<string>((resolve, reject) => {
                    img.onload = () => {
                      // Resize to reasonable dimensions
                      const maxSize = 100;
                      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
                      canvas.width = img.width * ratio;
                      canvas.height = img.height * ratio;

                      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                      // Convert to WebP with compression
                      const dataUrl = canvas.toDataURL('image/webp', 0.6);
                      resolve(dataUrl);
                    };
                    img.onerror = reject;
                    img.src = URL.createObjectURL(blob);
                  });

                  return {
                    i: item.id,
                    c: item.content,
                    d: base64
                  };
                } catch (error) {
                  console.error('Failed to convert image to Base64:', error);
                  return {
                    i: item.id,
                    c: item.content
                  };
                }
              } else {
                return {
                  i: item.id,
                  c: tierCortex.isCustomItem(item.id) ? item.content : undefined,
                  d: tierCortex.isCustomItem(item.id) && item.imageUrl?.startsWith('data:') ? item.imageUrl : undefined
                };
              }
            })
          )
        }))
      );

      const shareState = TierCortex.encodeTierStateForURL(title, tiersWithBase64);
      const shareUrl = `${window.location.origin}${pathname}?state=${shareState}`;

      navigator.clipboard.writeText(shareUrl);
      toast.success('Shareable URL copied!', {
        description: `This URL includes your custom images and works on any device. (${Math.round(shareUrl.length / 1024)}KB)`
      });

    } catch (error) {
      console.error('Failed to generate share URL:', error);
      toast.error('Failed to generate shareable URL');
    } finally {
      setIsGeneratingShareUrl(false);
    }
  }, [tiers, tierCortex, title, pathname, hasCustomImages]);

  const captureImage = useCallback(async () => {
    setIsCapturing(true);
    const element = document.body;
    const popover = popoverRef.current;
    const toastContainer = document.querySelector('[data-sonner-toaster]');

    // Temporarily hide the popover and toast container
    if (popover) popover.style.visibility = 'hidden';
    if (toastContainer) (toastContainer as HTMLElement).style.display = 'none';

    try {
      let canvas;
      if (captureMethod === 'original') {
        const scale = window.devicePixelRatio;
        canvas = document.createElement("canvas");
        canvas.width = element.offsetWidth * scale;
        canvas.height = element.offsetHeight * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Unable to get 2D context");
        }

        const originalDrawImage = ctx.drawImage.bind(ctx);
        // @ts-ignore
        ctx.drawImage = function (image, sx, sy, sw, sh, dx, dy, dw, dh) {
          if (image instanceof HTMLImageElement && sw && sh && dw && dh) {
            if (sw / dw < sh / dh) {
              const _dh = dh;
              dh = sh * (dw / sw);
              dy = dy + (_dh - dh) / 2;
            } else {
              const _dw = dw;
              dw = sw * (dh / sh);
              dx = dx + (_dw - dw) / 2;
            }
          }
          return originalDrawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        };

        await html2canvas(element, {canvas, scale});
      } else {
        canvas = await html2canvasPro(element, {});
      }

      canvas.toBlob((blob: Blob | null) => {
        if (blob) setImageBlob(blob);
      }, 'image/png');

      toast.success('Image captured successfully');
    } catch (error) {
      console.error(`Error capturing image with ${captureMethod} method:`, error);
      toast.error(`Failed to capture image with ${captureMethod} method`);
    } finally {
      // Restore the popover and toast container
      if (popover) popover.style.visibility = 'visible';
      if (toastContainer) (toastContainer as HTMLElement).style.display = '';
      setIsCapturing(false);
    }
  }, [captureMethod]);

  const copyImage = () => {
    if (imageBlob) {
      navigator.clipboard.write([
        new ClipboardItem({'image/png': imageBlob})
      ]).then(() => {
        toast.success('Image copied to clipboard');
      }).catch(err => {
        console.error('Error copying image: ', err);
        toast.error('Failed to copy image');
      });
    }
  };

  const shareToSocial = (platform: SocialPlatform) => {
    const shareText = `I've just ranked "${title}" on OpenTierBoy. What do you think? 🤔`;
    const currentUrl = hasCustomImages
      ? 'javascript:void(0)' // Don't auto-share if custom images need processing
      : window.location.href;

    if (hasCustomImages) {
      toast.info('Generate shareable URL first', {
        description: 'Click "Copy Shareable URL" to create a link with your custom images.'
      });
      return;
    }

    const url = platform === 'facebook'
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}&quote=${encodeURIComponent(shareText)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(currentUrl)}`;

    window.open(url, '_blank');
  };

  const copyAsMarkdown = () => {
    const shareText = `I've just ranked **${title}** on OpenTierBoy.
What do you think? 🤔
[Check it out on OpenTierBoy!](${window.location.href})
-# The link is shortened for brevity. Always double-check before clicking! It should start with \`https://www.opentierboy.com/\`.
`;
    navigator.clipboard.writeText(shareText).then(() => {
      toast.success('Markdown copied to clipboard', {
        description: 'Share it on Discord or Telegram, or any other platform that supports markdown!'
      });
    }).catch(err => {
      console.error('Error copying markdown: ', err);
      toast.error('Failed to copy markdown');
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" disabled={isCapturing}>
          <Share1Icon className="h-4 w-4"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" ref={popoverRef}>
        <h2 className="scroll-m-20 text-xl font-semibold tracking-tight mb-4">
          Share Your Rankings
        </h2>
        <Tabs defaultValue="url">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
          </TabsList>
          <TabsContent value="url">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg space-x-2">
                  <span>As URL</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <QuestionMarkCircledIcon className="h-4 w-4"/>
                      </TooltipTrigger>
                      <TooltipContent>
                        {hasCustomImages
                          ? "Custom images will be encoded for sharing across devices"
                          : "Consider using URL shorteners for ease of sharing"
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {hasCustomImages ? (
                    <>
                      <strong>📸 Custom images detected!</strong><br/>
                      Generate a shareable URL that includes your custom images.
                    </>
                  ) : (
                    <>
                      You may also copy the URL directly from your browser address bar to share your tier
                      list. <br/>
                      <i>Copy-jutsu!</i>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={generateShareUrlWithImages}
                    disabled={isGeneratingShareUrl}
                  >
                    {isGeneratingShareUrl ? (
                      'Generating...'
                    ) : hasCustomImages ? (
                      '🔗 Copy Shareable URL'
                    ) : (
                      '🔗 Copy URL'
                    )}
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Button variant="outline" onClick={copyAsMarkdown}>
                    <FaMarkdown className="mr-2"/> Copy Markdown
                  </Button>
                </div>
                <div className="flex justify-center text-sm text-muted-foreground">
                  OR
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-row space-x-2">
                    <Button variant="outline" size="icon" onClick={() => shareToSocial('facebook')}>
                      <FaFacebookF className="h-4 w-4"/>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => shareToSocial('twitter')}>
                      <FaXTwitter className="h-4 w-4"/>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="image">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">As Image</CardTitle>
                <Collapsible>
                  <CollapsibleTrigger className="text-[10px] underline underline-offset-1 decoration-dotted">
                    Options
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground">
                      Capturing images might be buggy. Please try one of the following methods or take a screenshot
                      manually.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select value={captureMethod} onValueChange={(value: CaptureMethod) => setCaptureMethod(value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select capture method"/>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">Original html2canvas</SelectItem>
                          <SelectItem value="pro">html2canvas-pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <Button onClick={captureImage} disabled={isCapturing} className="sm:w-auto">
                    <CameraIcon className="mr-2"/>
                    {isCapturing ? 'Capturing...' : 'Capture Preview'}
                  </Button>
                </div>

                {imageBlob && (
                  <div className="relative w-full h-48">
                    <Image
                      src={URL.createObjectURL(imageBlob)}
                      alt="Captured tier list"
                      fill
                      style={{objectFit: "contain"}}
                    />
                  </div>
                )}

                {isCapturing && (
                  <div className="flex items-center">
                    <div className="space-y-2 w-full">
                      <p className="text-center italic">Freeze frame!</p>
                      <Skeleton className="h-6 w-full"/>
                      <Skeleton className="h-6 w-full"/>
                      <Skeleton className="h-6 w-full"/>
                    </div>
                  </div>
                )}

                {imageBlob ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={copyImage} disabled={!imageBlob}>
                      <ImageIcon className="mr-2"/>
                      Copy Image
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center text-sm text-muted-foreground">
                    Capture an image to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

export default ShareButton;
