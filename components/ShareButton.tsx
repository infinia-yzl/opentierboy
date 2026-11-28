import React, {useState, useRef, useCallback, useEffect, useId} from 'react';
import {createPortal, flushSync} from 'react-dom';
import html2canvas from 'html2canvas';
import html2canvasPro from 'html2canvas-pro';
import Image from 'next/image';
import {Button} from "@/components/ui/button"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover"
import {Share1Icon, QuestionMarkCircledIcon, ImageIcon, CameraIcon, DownloadIcon, InfoCircledIcon, Link2Icon} from '@radix-ui/react-icons';
import {toast} from 'sonner';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {FaFacebookF, FaMarkdown, FaXTwitter} from "react-icons/fa6";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Label} from "@/components/ui/label";
import {useTierContext} from "@/contexts/TierContext";
import {useCustomImages} from "@/contexts/CustomImagesContext";
import {linkImageCounts} from "@/lib/images/listImages";
import {checkImage} from "@/lib/images/imageCheck";
import {type Capture, useSnapshotDownload} from "@/components/useSnapshotDownload";
import {usePathname} from "next/navigation";
import {ListCard} from "@/components/ListCard";
import {listCardFont} from "@/components/listCardFont";
import {useListCardData} from "@/components/useListCardData";
import {type ListCardData, PICTURE_FRAMES, type PictureFrameName} from "@/lib/listCard/model";
import {markdownText} from "@/lib/markdownText";
import {onOpenSharePanel, useTips} from "@/components/useTips";
import {cn} from "@/lib/utils";
import {fontFacesSettled, imageSettled, styleSheetSettled} from "@/lib/listCard/resources";
import {framePainted} from "@/lib/framePainted";
import {type CapturePhase, CaptureSteps} from "@/components/CaptureSteps";
import {Switch} from "@/components/ui/switch";
import {ScribbleIcon} from "@/components/ScribbleIcon";
import {saveScribbleNotes, useScribble} from "@/components/useScribble";

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

async function cardSettled(card: HTMLElement): Promise<void> {
  const images = Array.from(card.querySelectorAll('img')).filter((image) => image.dataset.linkImage === undefined);
  await Promise.all([fontFacesSettled(document.fonts, listCardFont.style.fontFamily), ...images.map(imageSettled)]);
}

async function cloneSettled(clonedDocument: Document): Promise<void> {
  const links = Array.from(clonedDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]:not([disabled])'));
  await Promise.all(links.map(styleSheetSettled));
  await fontFacesSettled(clonedDocument.fonts, listCardFont.style.fontFamily);
}

async function phasePainted(setPhase: (phase: CapturePhase) => void, phase: CapturePhase): Promise<void> {
  flushSync(() => setPhase(phase));
  await framePainted(document, window);
}

function pngOf(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

type SocialPlatform = 'facebook' | 'twitter';
type CaptureMethod = 'original' | 'pro';

/**
 * The picture Freeze Frame captures: the whole list (the card that grows with the list, as before
 * the picture frames), or a picture frame of a fixed size (the canvas boards "Picture",
 * "PictureSquare" and "PicturePortrait").
 */
type FrameChoice = 'whole' | PictureFrameName;

const frameName = (name: PictureFrameName, label: string) =>
  `${label} ${PICTURE_FRAMES[name].width}×${PICTURE_FRAMES[name].height}`;

const FRAME_CHOICES: readonly {value: FrameChoice; label: string}[] = [
  {value: 'whole', label: 'Whole list'},
  {value: 'landscape', label: frameName('landscape', 'Landscape')},
  {value: 'square', label: frameName('square', 'Square')},
  {value: 'portrait', label: frameName('portrait', 'Portrait')},
];

/**
 * Which images the link carries (the board "SharePanel"): link images travel in the link, device
 * images stay in this browser, and Freeze Frame's Download keeps them in the file. Download is on
 * the Image tab, after Capture Preview. Link images from sites outside the trusted list show as
 * label tiles until the viewer chooses Load (components/LinkImageNotice.tsx).
 */
function LinkImageNotes({link, device}: {link: number; device: number}) {
  if (link === 0 && device === 0) return null;
  return (
    <div className="flex flex-col gap-2 mb-4">
      {device > 0 && (
        <Alert role="note">
          <InfoCircledIcon className="h-4 w-4"/>
          <AlertDescription>
            {device === 1 ? '1 device image shows as a placeholder.' : `${device} device images show as placeholders.`}
          </AlertDescription>
        </Alert>
      )}
      {link > 0 && (
        <Alert role="note">
          <InfoCircledIcon className="h-4 w-4"/>
          <AlertDescription>
            {link === 1 ? (
              <><strong>1 image from the web is in the link.</strong> People who open the link see it too. Some sites
                need their OK first: until they press Load, they see the image&apos;s name.</>
            ) : (
              <><strong>{link} images from the web are in the link.</strong> People who open the link see them too. Some
                sites need their OK first: until they press Load, they see the images&apos; names.</>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface ShareButtonProps {
  title: string;
}

const SCRIBBLES_INCLUDED = 'Every button below shares your scribbles too';
const SCRIBBLES_LEFT_OUT = 'Every button below shares the list without your scribbles';

const ShareButton: React.FC<ShareButtonProps> = ({title}) => {
  const {shareLink, tiers} = useTierContext();
  const {ink} = useScribble();
  const [includeScribbles, setIncludeScribbles] = useState(true);
  const scribblesLabelId = useId();
  const scribblesSwitchId = useId();
  const scribblesHintId = useId();
  const {isPackageItem} = useCustomImages();
  const imageCounts = linkImageCounts(tiers, isPackageItem);
  const pathname = usePathname();
  const [capture, setCapture] = useState<(Capture & {previewUrl: string}) | null>(null);
  const imageBlob = capture?.picture ?? null;
  const previewUrl = capture?.previewUrl ?? null;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>('pro');
  const [frame, setFrame] = useState<FrameChoice>('whole');
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const isCapturing = phase !== 'idle';
  const [isSaving, setIsSaving] = useState(false);
  const downloadSnapshot = useSnapshotDownload();
  const [panelOpen, setPanelOpen] = useState(false);
  const showPanel = useCallback((open: boolean) => {
    if (open) saveScribbleNotes();
    setPanelOpen(open);
  }, []);
  useEffect(() => onOpenSharePanel(() => showPanel(true)), [showPanel]);
  const tipRing = useTips().current === 'link-save';
  const listCard = useListCardData();
  const [card, setCard] = useState<ListCardData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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
    const shown = {state: shareLink, path: pathname, title};
    const data = listCard(frame === 'whole' ? undefined : frame);

    try {
      await phasePainted(setPhase, 'preparing');
      flushSync(() => setCard(data));
      const element = cardRef.current;
      if (!element) throw new Error('The list card did not render');
      const [prepareLinkImages] = await Promise.all([prepareLinkImagesForCapture(), cardSettled(element)]);

      await phasePainted(setPhase, 'drawing');
      const onclone = async (clonedDocument: Document) => {
        prepareLinkImages(clonedDocument);
        const clonedCard = clonedDocument.querySelector<HTMLElement>('[data-list-card]');
        if (clonedCard) clonedCard.style.visibility = 'visible';
        await cloneSettled(clonedDocument);
      };
      const ignoreElements = (node: Element) => node.parentElement === document.body && node !== element;
      const scale = data.frame ? 1 : captureScale(data.width, data.height);
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

        await html2canvas(element, {canvas, scale, useCORS: true, onclone, ignoreElements, ...area});
      } else {
        canvas = await html2canvasPro(element, {scale, useCORS: true, onclone, ignoreElements, ...area});
      }

      await phasePainted(setPhase, 'encoding');
      const blob = await pngOf(canvas);
      if (blob) {
        setCapture({picture: blob, previewUrl: URL.createObjectURL(blob), ...shown});
        toast.success('Image captured successfully');
      } else {
        toast.error(`Failed to capture image with ${captureMethod} method`);
      }
    } catch (error) {
      console.error(`Error capturing image with ${captureMethod} method:`, error);
      toast.error(`Failed to capture image with ${captureMethod} method`);
    } finally {
      setCard(null);
      setPhase('idle');
    }
  }, [captureMethod, frame, shareLink, pathname, title, listCard]);

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

  const shareUrl = () => {
    const link = `${window.location.origin}${window.location.pathname}?state=${shareLink}`;
    return ink !== null && includeScribbles ? `${link}&ink=${ink}` : link;
  };

  const shareToSocial = (platform: SocialPlatform) => {
    const shareText = `I've just ranked "${title}" on OpenTierBoy. What do you think? 🤔`;
    const url = platform === 'facebook'
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}&quote=${encodeURIComponent(shareText)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl())}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAsMarkdown = () => {
    const shareText = `I've just ranked **${markdownText(title)}** on OpenTierBoy.
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

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl()).then(() => {
      toast.success('Link copied to clipboard', {
        description: includeScribbles ? 'It shares your scribbles too.' : 'It shares the list without your scribbles.',
      });
    }).catch(err => {
      console.error('Error copying link: ', err);
      toast.error('Failed to copy link');
    });
  };

  const shareButtons = (
    <>
      <div className={ink !== null ? 'flex flex-wrap justify-center gap-2' : 'flex justify-center'}>
        {ink !== null && (
          <Button variant="outline" onClick={copyLink}>
            <Link2Icon className="mr-2"/> Copy link
          </Button>
        )}
        <Button variant="outline" onClick={copyAsMarkdown}>
          <FaMarkdown className="mr-2"/> Copy Markdown
        </Button>
      </div>
      <div className="flex justify-center text-sm text-muted-foreground">
        OR
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-row space-x-2">
          <Button variant="outline" size="icon" aria-label="Share on Facebook" onClick={() => shareToSocial('facebook')}>
            <FaFacebookF aria-hidden="true" className="h-4 w-4"/>
          </Button>
          <Button variant="outline" size="icon" aria-label="Share on X" onClick={() => shareToSocial('twitter')}>
            <FaXTwitter aria-hidden="true" className="h-4 w-4"/>
          </Button>
        </div>
      </div>
    </>
  );

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
    <Popover open={panelOpen} onOpenChange={showPanel}>
      <PopoverTrigger asChild>
        <Button className={cn('gap-2', tipRing && 'ring-2 ring-ring ring-offset-2 ring-offset-background')} disabled={isCapturing}>
          <Share1Icon className="h-4 w-4"/>
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(512px,calc(100vw-1rem))] max-h-(--radix-popover-content-available-height) overflow-y-auto p-6">
        <h2 className="scroll-m-20 text-lg font-semibold tracking-tight mb-4">
          Share Your Rankings
        </h2>
        <LinkImageNotes link={imageCounts.link} device={imageCounts.device}/>
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
                      <TooltipTrigger aria-label="Tips for sharing the link">
                        <QuestionMarkCircledIcon aria-hidden="true" className="h-4 w-4"/>
                      </TooltipTrigger>
                      <TooltipContent>
                        Consider using URL shorteners for ease of sharing.
                        Device images show as placeholders.
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
                {ink === null ? shareButtons : (
                  <div role="group" aria-labelledby={scribblesLabelId} className="rounded-lg border">
                    <div className="flex items-center gap-3 border-b p-3">
                      <ScribbleIcon className="h-5 w-5 shrink-0"/>
                      <div className="grow">
                        <Label id={scribblesLabelId} htmlFor={scribblesSwitchId}>Include scribbles</Label>
                        <p id={scribblesHintId} className="mt-1 text-[13px] text-muted-foreground">
                          {includeScribbles ? SCRIBBLES_INCLUDED : SCRIBBLES_LEFT_OUT}
                        </p>
                      </div>
                      <Switch
                        id={scribblesSwitchId}
                        checked={includeScribbles}
                        onCheckedChange={setIncludeScribbles}
                        aria-describedby={scribblesHintId}
                      />
                    </div>
                    <div className="space-y-4 p-3">{shareButtons}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="image">
            <Card className="flex flex-col gap-3 p-4">
              <CardTitle className="text-lg">As Image</CardTitle>
              {ink !== null && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <ScribbleIcon className="h-4 w-4 shrink-0"/>
                  Scribbles are not in the picture.
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5 grow min-w-[180px]">
                  <Label htmlFor="freeze-frame-frame">Frame</Label>
                  <Select value={frame} onValueChange={(value: FrameChoice) => setFrame(value)}>
                    <SelectTrigger id="freeze-frame-frame" aria-label="Frame">
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      {FRAME_CHOICES.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={captureImage} disabled={isCapturing}>
                  <CameraIcon className="mr-2"/>
                  {isCapturing ? 'Capturing...' : 'Capture Preview'}
                </Button>
              </div>
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
                      <SelectTrigger aria-label="Capture method">
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

              {previewUrl && (
                <div className="relative w-full h-[200px] rounded-md overflow-hidden bg-muted">
                  <Image
                    src={previewUrl}
                    alt="Captured tier list"
                    fill
                    style={{objectFit: "contain"}}
                  />
                </div>
              )}

              {isCapturing && (
                <div className="space-y-2 w-full">
                  <p className="text-center italic">Freeze frame!</p>
                  <CaptureSteps phase={phase}/>
                </div>
              )}

              {imageBlob ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={copyImage} disabled={!imageBlob}>
                      <ImageIcon className="mr-2"/>
                      Copy Image
                    </Button>
                    <Button variant="outline" onClick={downloadImage} disabled={!imageBlob || isSaving}>
                      <DownloadIcon className="mr-2"/>
                      Download
                    </Button>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    The file keeps your list and your own pictures. Anyone you send it to can open it here and edit the list.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Capture an image to get started.
                </p>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
    </>
  );
};

export default ShareButton;
