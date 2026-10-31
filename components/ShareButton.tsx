import React, {useState, useRef, useCallback} from 'react';
import {createPortal, flushSync} from 'react-dom';
import html2canvas from 'html2canvas';
import html2canvasPro from 'html2canvas-pro';
import Image from 'next/image';
import {Button} from "@/components/ui/button"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover"
import {Share1Icon, QuestionMarkCircledIcon, ImageIcon, CameraIcon, DownloadIcon} from '@radix-ui/react-icons';
import {toast} from 'sonner';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {Skeleton} from "@/components/ui/skeleton";
import {FaFacebookF, FaMarkdown, FaXTwitter} from "react-icons/fa6";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {useTierContext} from "@/contexts/TierContext";
import {checkImage} from "@/lib/images/imageCheck";
import {type Capture, useSnapshotDownload} from "@/components/useSnapshotDownload";
import {usePathname} from "next/navigation";
import {ListCard} from "@/components/ListCard";
import {listCardFont} from "@/components/listCardFont";
import {useListCardData} from "@/components/useListCardData";
import type {ListCardData} from "@/lib/listCard/model";

/**
 * Link images come from other sites, and a canvas that draws them without the site's consent
 * (CORS) cannot be exported. html2canvas draws them with CORS (useCORS) where the site allows
 * it. Images from sites that do not become label tiles in the copy of the page that html2canvas
 * draws, so the capture always works.
 */
async function prepareLinkImagesForCapture(): Promise<(clonedDocument: Document) => void> {
  const urls = Array.from(new Set(Array.from(document.querySelectorAll<HTMLImageElement>('img[data-link-image]'))
    .map((image) => image.dataset.linkImage ?? '')
    .filter((url) => url !== '')));
  const results = await Promise.all(urls.map((url) => checkImage(url, {crossOrigin: 'anonymous', limits: {timeoutMs: 5_000}})));
  const withoutCors = new Set(urls.filter((_, index) => !results[index].ok));
  return (clonedDocument: Document) => {
    clonedDocument.querySelectorAll<HTMLImageElement>('img[data-link-image]').forEach((image) => {
      if (!withoutCors.has(image.dataset.linkImage ?? '')) return;
      const tile = clonedDocument.createElement('div');
      tile.textContent = image.alt;
      tile.setAttribute('style', 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:12px;line-height:1.2;text-align:center;overflow:hidden;');
      image.replaceWith(tile);
    });
  };
}

/** The wordmark on the list card. */
const CARD_LOGO = '/brand/otb-logo-wide.png';

/**
 * Pixels per CSS pixel for the picture. Twice the size on screens with dense pixels keeps text
 * and images sharp, while the picture stays within what browsers allow for one canvas (about
 * 16.7 million pixels in Safari); a taller card is drawn at its own size.
 */
const MAX_CANVAS_PIXELS = 16_000_000;
function captureScale(width: number, height: number): number {
  const wanted = window.devicePixelRatio >= 2 ? 2 : 1;
  return width * height * wanted * wanted <= MAX_CANVAS_PIXELS ? wanted : 1;
}

/**
 * How long Freeze Frame waits for one card image. A server that never answers would otherwise
 * keep the capture waiting; after this time the image draws as it stands (html2canvas has its own
 * image timeout, and link images without CORS become label tiles).
 */
const IMAGE_WAIT_MS = 5_000;

/** Resolves when the promise settles or after `ms`, whichever comes first. */
function settledWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); },
    );
  });
}

/** Waits until the card's fonts and images are ready to draw, or until each wait times out. */
async function cardReady(element: HTMLElement): Promise<void> {
  const family = listCardFont.style.fontFamily;
  await Promise.all(['400', '600', '900'].map((weight) => settledWithin(document.fonts.load(`${weight} 24px ${family}`), IMAGE_WAIT_MS)));
  await Promise.all(Array.from(element.querySelectorAll('img')).map((image) =>
    image.complete ? Promise.resolve() : settledWithin(image.decode(), IMAGE_WAIT_MS)));
}

type SocialPlatform = 'facebook' | 'twitter';
type CaptureMethod = 'original' | 'pro';

interface ShareButtonProps {
  title: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({title}) => {
  const {shareLink} = useTierContext();
  const pathname = usePathname();
  // The picture and the list it shows, taken together: Download embeds that list, even when the
  // list on screen has changed since.
  const [capture, setCapture] = useState<Capture | null>(null);
  const imageBlob = capture?.picture ?? null;
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>('pro');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const downloadSnapshot = useSnapshotDownload();
  const listCard = useListCardData();
  // The list card that Freeze Frame draws: rendered hidden while a capture runs.
  const [card, setCard] = useState<ListCardData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /** Downloads the picture with the list inside (a snapshot file that OpenTierBoy can open again). */
  const downloadImage = async () => {
    if (!capture) return;
    setIsSaving(true);
    try {
      await downloadSnapshot(capture);
    } finally {
      setIsSaving(false);
    }
  };

  const captureImage = useCallback(async () => {
    setIsCapturing(true);
    // The list the picture shows: the card is built from the list on screen right now.
    const shown = {state: shareLink, path: pathname, title};
    const data = listCard();

    try {
      // The card renders hidden at the top of the page (components/ListCard.tsx); the copy of
      // the page that html2canvas draws shows it.
      flushSync(() => setCard(data));
      const element = cardRef.current;
      if (!element) throw new Error('The list card did not render');
      await cardReady(element);
      const prepareLinkImages = await prepareLinkImagesForCapture();
      const onclone = (clonedDocument: Document) => {
        prepareLinkImages(clonedDocument);
        const clonedCard = clonedDocument.querySelector<HTMLElement>('[data-list-card]');
        if (clonedCard) clonedCard.style.visibility = 'visible';
      };
      const scale = captureScale(data.width, data.height);
      const area = {
        x: 0, y: 0, width: data.width, height: data.height, scrollX: -window.scrollX, scrollY: -window.scrollY,
        windowWidth: Math.max(data.width, window.innerWidth), windowHeight: Math.max(data.height, window.innerHeight),
      };
      let canvas;
      if (captureMethod === 'original') {
        canvas = document.createElement("canvas");
        canvas.width = data.width * scale;
        canvas.height = data.height * scale;

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

        await html2canvas(element, {canvas, scale, useCORS: true, onclone, ...area});
      } else {
        canvas = await html2canvasPro(element, {scale, useCORS: true, onclone, ...area});
      }

      canvas.toBlob((blob: Blob | null) => {
        if (blob) setCapture({picture: blob, ...shown});
      }, 'image/png');

      toast.success('Image captured successfully');
    } catch (error) {
      console.error(`Error capturing image with ${captureMethod} method:`, error);
      toast.error(`Failed to capture image with ${captureMethod} method`);
    } finally {
      setCard(null);
      setIsCapturing(false);
    }
  }, [captureMethod, shareLink, pathname, title, listCard]);

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

  /**
   * The link to share: the list and layout on screen, from the store (A46). The address can lag
   * behind (the editor writes one link at a time) or hold older label settings after Back.
   */
  const shareUrl = () => `${window.location.origin}${window.location.pathname}?state=${shareLink}`;

  const shareToSocial = (platform: SocialPlatform) => {
    const shareText = `I've just ranked "${title}" on OpenTierBoy. What do you think? 🤔`;
    const url = platform === 'facebook'
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}&quote=${encodeURIComponent(shareText)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl())}`;

    window.open(url, '_blank');
  };

  const copyAsMarkdown = () => {
    const shareText = `I've just ranked **${title}** on OpenTierBoy.
What do you think? 🤔
[Check it out on OpenTierBoy!](${shareUrl()})
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
    <>
    {card && createPortal(
      <div ref={cardRef} data-list-card="" aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 0, width: card.width, height: card.height, visibility: 'hidden', pointerEvents: 'none',
      }}>
        <ListCard card={card} logoSrc={CARD_LOGO} fontFamily={listCardFont.style.fontFamily}/>
      </div>,
      document.body,
    )}
    <Popover>
      <PopoverTrigger asChild>
        <Button className="gap-2" disabled={isCapturing}>
          <Share1Icon className="h-4 w-4"/>
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]">
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
                        Consider using URL shorteners for ease of sharing.
                        Images added from your device will be replaced with placeholders.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  You may also copy the URL directly from your browser address bar to share your tier
                  list. <br/>
                  <i>Copy-jutsu!</i>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={copyImage} disabled={!imageBlob}>
                      <ImageIcon className="mr-2"/>
                      Copy Image
                    </Button>
                    <Button variant="outline" onClick={downloadImage} disabled={!imageBlob || isSaving}>
                      <DownloadIcon className="mr-2"/>
                      Download
                    </Button>
                    <p className="w-full text-center text-xs text-muted-foreground">
                      The file keeps your list and your own pictures. Anyone you send it to can open it here and edit the list.
                    </p>
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
    </>
  );
};

export default ShareButton;
