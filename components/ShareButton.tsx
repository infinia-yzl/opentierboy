import React, {useState} from 'react';
import html2canvas from 'html2canvas';
import Image from 'next/image';
import {Button} from "@/components/ui/button"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover"
import {Share1Icon, CopyIcon, TwitterLogoIcon} from '@radix-ui/react-icons';
import {toast} from 'sonner';

type SocialPlatform = 'facebook' | 'twitter';

const ShareButton: React.FC = () => {
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  const captureImage = async () => {
    // Uses a custom override https://github.com/niklasvh/html2canvas/issues/1064#issuecomment-1829552577
    const root = document.body;

    // Get the device pixel ratio
    const scale = window.devicePixelRatio;

    // Create a custom canvas
    const canvas = document.createElement("canvas");
    canvas.width = root.offsetWidth * scale;
    canvas.height = root.offsetHeight * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Unable to get 2D context");
      return;
    }

    // Store the original drawImage function
    const originalDrawImage = ctx.drawImage.bind(ctx);

    // Override the drawImage function
    // @ts-ignore
    ctx.drawImage = function (image, sx, sy, sw, sh, dx, dy, dw, dh) {
      if (image instanceof HTMLImageElement) {
        if (sw && sh && dw && dh) {
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
      }

      return originalDrawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    try {
      // Capture the image using html2canvas
      await html2canvas(root, {
        canvas,
        scale,
      });

      // Convert canvas to blob
      canvas.toBlob((blob) => {
        if (blob) {
          setImageBlob(blob);
        }
      }, 'image/png');
    } catch (error) {
      console.error("Error capturing image:", error);
      toast.error("Failed to capture image");
    }
  };


  const copyImage = () => {
    if (imageBlob) {
      navigator.clipboard.write([
        new ClipboardItem({'image/png': imageBlob})
      ]).then(() => {
        toast.success('Image copied to clipboard');
      })
        .catch(err => {
          console.error('Error copying image: ', err);
          toast.error('Failed to copy image');
        });
    }
  };

  const shareToSocial = (platform: SocialPlatform) => {
    copyImage();
    const shareText = "Check out my tier list! [Paste image here]";
    let url: string;

    if (platform === 'facebook') {
      url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(shareText)}`;
    } else {
      url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.href)}`;
    }

    window.open(url, '_blank');
    toast.success(`Sharing to ${platform}`, {
      description: "Image copied. Please paste it into your post on the opened page."
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" onClick={captureImage}>
          <Share1Icon className="h-4 w-4"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400]">
        <div className="grid gap-4">
          <h4 className="font-medium leading-none">Share Tier List</h4>
          {imageBlob && (
            <div className="relative w-full h-64">
              <Image
                src={URL.createObjectURL(imageBlob)}
                alt="Captured tier list"
                fill
                style={{
                  objectFit: "contain"
                }}
              />
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" size="icon" onClick={copyImage}>
              <CopyIcon className="h-4 w-4"/>
            </Button>
            <Button variant="outline" size="icon" onClick={() => shareToSocial('facebook')}>
              F
            </Button>
            <Button variant="outline" size="icon" onClick={() => shareToSocial('twitter')}>
              <TwitterLogoIcon className="h-4 w-4"/>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ShareButton;
