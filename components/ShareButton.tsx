import React, {useState, useRef, useCallback} from 'react';
import html2canvas from 'html2canvas';
// @ts-ignore
import html2canvasPro from 'html2canvas-pro';
import Image from 'next/image';
import {Button} from "@/components/ui/button"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover"
import {Share1Icon, CopyIcon, TwitterLogoIcon} from '@radix-ui/react-icons';
import {toast} from 'sonner';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"

type SocialPlatform = 'facebook' | 'twitter';
type CaptureMethod = 'original' | 'pro';

const ShareButton: React.FC = () => {
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>('pro');
  const [isCapturing, setIsCapturing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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

      canvas.toBlob((blob: React.SetStateAction<Blob | null>) => {
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
    copyImage();
    const shareText = "Check out my tier list! [Paste image here]";
    const url = platform === 'facebook'
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(shareText)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.href)}`;

    window.open(url, '_blank');
    toast.success(`Sharing to ${platform}`, {
      description: "Image copied. Please paste it into your post on the opened page."
    });
  };

  const handleCaptureMethodChange = (value: string) => {
    setCaptureMethod(value as CaptureMethod);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={captureImage}
          disabled={isCapturing}
        >
          <Share1Icon className="h-4 w-4"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" ref={popoverRef}>
        <div className="grid gap-4">
          <h4 className="font-medium leading-none">Share Tier List</h4>
          <p className="text-sm text-muted-foreground">
            Capturing images might be buggy. Please try one of the following methods or take a screenshot manually.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={captureMethod} onValueChange={handleCaptureMethodChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select capture method"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original html2canvas</SelectItem>
                <SelectItem value="pro">html2canvas-pro</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={captureImage} disabled={isCapturing} className="sm:w-auto">
              {isCapturing ? 'Capturing...' : 'Recapture'}
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
          <div className="flex justify-end space-x-1">
            <Button variant="outline" size="icon" onClick={copyImage} disabled={!imageBlob}>
              <CopyIcon className="h-4 w-4"/>
            </Button>
            <a href="#" onClick={(e) => {
              e.preventDefault();
              shareToSocial('facebook');
            }}>
              <Button variant="outline" size="icon" disabled={!imageBlob}>
                FB
              </Button>
            </a>
            <a href="#" onClick={(e) => {
              e.preventDefault();
              shareToSocial('twitter');
            }}>
              <Button variant="outline" size="icon" disabled={!imageBlob}>
                <TwitterLogoIcon className="h-4 w-4"/>
              </Button>
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ShareButton;
