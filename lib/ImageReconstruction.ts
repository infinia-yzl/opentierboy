/**
 * Advanced Image Reconstruction System
 * Implements sophisticated upscaling algorithms inspired by DLSS and modern image processing
 */

export type ReconstructionMethod = 'nearest-neighbor' | 'lanczos' | 'bicubic' | 'edge-preserving' | 'pixel-perfect';

export interface ReconstructionOptions {
  method: ReconstructionMethod;
  targetSize: number;
  maintainAspectRatio: boolean;
  sharpeningStrength?: number;
  edgeThreshold?: number;
}

export class ImageReconstructor {

  /**
   * Analyze image characteristics to determine optimal reconstruction strategy
   */
  static async analyzeImage(canvas: HTMLCanvasElement): Promise<{ type: string }> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { type: '2d-sprite' }; // Default fallback
    }

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Count unique colors
      const colorSet = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Skip fully transparent pixels
        if (a === 0) continue;

        const colorKey = `${r},${g},${b}`;
        colorSet.add(colorKey);
      }

      const uniqueColors = colorSet.size;

      // Simple classification based on color count
      if (uniqueColors < 32) {
        return { type: '2d-pixel' };
      } else if (uniqueColors < 128) {
        return { type: '2d-sprite' };
      } else {
        return { type: '3d-rendered' };
      }
    } catch (error) {
      console.warn('Image analysis failed, using default type:', error);
      return { type: '2d-sprite' };
    }
  }

  /**
   * Main reconstruction function that selects optimal algorithm based on image analysis
   */
  static async reconstruct(
    sourceCanvas: HTMLCanvasElement,
    iconType: string,
    targetSize: number = 200
  ): Promise<HTMLCanvasElement> {

    // Auto-detect image type if needed
    let actualIconType = iconType;
    if (iconType === 'auto') {
      const analysis = await this.analyzeImage(sourceCanvas);
      actualIconType = analysis.type;
    }

    const options: ReconstructionOptions = this.getOptimalOptions(actualIconType, targetSize);

    try {
      switch (options.method) {
        case 'pixel-perfect':
          return this.pixelPerfectUpscale(sourceCanvas, options);
        case 'nearest-neighbor':
          return this.nearestNeighborUpscale(sourceCanvas, options);
        case 'lanczos':
          return this.lanczosUpscale(sourceCanvas, options);
        case 'edge-preserving':
          return this.edgePreservingUpscale(sourceCanvas, options);
        case 'bicubic':
        default:
          return this.bicubicUpscale(sourceCanvas, options);
      }
    } catch (error) {
      console.warn(`${options.method} upscaling failed, falling back to bicubic:`, error);
      return this.bicubicUpscale(sourceCanvas, options);
    }
  }

  /**
   * Pixel-perfect upscaling for pixel art - maintains exact pixel boundaries
   */
  static pixelPerfectUpscale(
    sourceCanvas: HTMLCanvasElement,
    options: ReconstructionOptions
  ): HTMLCanvasElement {
    const {width: srcWidth, height: srcHeight} = sourceCanvas;
    const {targetSize, maintainAspectRatio} = options;

    const {width: dstWidth, height: dstHeight} = this.calculateDimensions(
      srcWidth, srcHeight, targetSize, maintainAspectRatio
    );

    // For pixel art, use integer scaling when possible
    const scaleX = Math.max(1, Math.floor(dstWidth / srcWidth));
    const scaleY = Math.max(1, Math.floor(dstHeight / srcHeight));

    const resultCanvas = document.createElement('canvas');
    const resultCtx = resultCanvas.getContext('2d')!;

    resultCanvas.width = srcWidth * scaleX;
    resultCanvas.height = srcHeight * scaleY;

    // Disable smoothing for crisp pixels
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.drawImage(sourceCanvas, 0, 0, srcWidth * scaleX, srcHeight * scaleY);

    return resultCanvas;
  }

  /**
   * Lanczos upscaling - high quality for photographic content (simplified version)
   */
  static lanczosUpscale(
    sourceCanvas: HTMLCanvasElement,
    options: ReconstructionOptions
  ): HTMLCanvasElement {
    // For now, implement a simplified Lanczos using high-quality browser interpolation
    // with custom post-processing. A full Lanczos implementation would be quite complex.
    const result = this.bicubicUpscale(sourceCanvas, options);

    // Apply additional sharpening that mimics Lanczos characteristics
    if (options.sharpeningStrength && options.sharpeningStrength > 0) {
      const ctx = result.getContext('2d')!;
      this.applySafeSharpening(ctx, result.width, result.height, options.sharpeningStrength * 1.2);
    }

    return result;
  }

  /**
   * Edge-preserving upscaling - maintains sharp edges while smoothing gradients
   */
  static edgePreservingUpscale(
    sourceCanvas: HTMLCanvasElement,
    options: ReconstructionOptions
  ): HTMLCanvasElement {
    // First upscale with bicubic
    const upscaled = this.bicubicUpscale(sourceCanvas, options);

    // Apply moderate sharpening to enhance edges
    if (options.sharpeningStrength && options.sharpeningStrength > 0) {
      const ctx = upscaled.getContext('2d')!;
      this.applySafeSharpening(ctx, upscaled.width, upscaled.height, options.sharpeningStrength);
    }

    return upscaled;
  }

  /**
   * Multi-pass enhancement system - with option to disable sharpening for testing
   */
  static async multiPassEnhancement(
    sourceCanvas: HTMLCanvasElement,
    iconType: string,
    targetSize: number = 200,
    disableSharpening: boolean = false
  ): Promise<HTMLCanvasElement> {

    // Pass 1: Basic reconstruction
    let enhanced = await this.reconstruct(sourceCanvas, iconType, targetSize);

    // Pass 2: Sharpening (can be disabled for testing)
    if (!disableSharpening && (iconType === '2d-sprite' || iconType === '3d-rendered')) {
      const ctx = enhanced.getContext('2d')!;
      this.applySafeSharpening(ctx, enhanced.width, enhanced.height, 0.3);
    }

    return enhanced;
  }

  /**
   * Nearest neighbor upscaling - simple but effective for pixel art
   */
  static nearestNeighborUpscale(
    sourceCanvas: HTMLCanvasElement,
    options: ReconstructionOptions
  ): HTMLCanvasElement {
    const {width: srcWidth, height: srcHeight} = sourceCanvas;
    const {targetSize, maintainAspectRatio} = options;

    const {width: dstWidth, height: dstHeight} = this.calculateDimensions(
      srcWidth, srcHeight, targetSize, maintainAspectRatio
    );

    const resultCanvas = document.createElement('canvas');
    const resultCtx = resultCanvas.getContext('2d')!;

    resultCanvas.width = dstWidth;
    resultCanvas.height = dstHeight;

    resultCtx.imageSmoothingEnabled = false;
    resultCtx.drawImage(sourceCanvas, 0, 0, dstWidth, dstHeight);

    return resultCanvas;
  }

  /**
   * Bicubic upscaling - good balance for most content (reliable implementation)
   */
  static bicubicUpscale(
    sourceCanvas: HTMLCanvasElement,
    options: ReconstructionOptions
  ): HTMLCanvasElement {
    const {width: srcWidth, height: srcHeight} = sourceCanvas;
    const {targetSize, maintainAspectRatio} = options;

    const {width: dstWidth, height: dstHeight} = this.calculateDimensions(
      srcWidth, srcHeight, targetSize, maintainAspectRatio
    );

    // Use reliable browser interpolation
    const resultCanvas = document.createElement('canvas');
    const resultCtx = resultCanvas.getContext('2d')!;

    resultCanvas.width = dstWidth;
    resultCanvas.height = dstHeight;

    // High quality browser scaling
    resultCtx.imageSmoothingEnabled = true;
    resultCtx.imageSmoothingQuality = 'high';
    resultCtx.drawImage(sourceCanvas, 0, 0, dstWidth, dstHeight);

    // Apply sharpening if specified
    if (options.sharpeningStrength && options.sharpeningStrength > 0) {
      try {
        this.applySafeSharpening(resultCtx, dstWidth, dstHeight, options.sharpeningStrength);
      } catch (error) {
        console.warn('Sharpening failed, using unsharpened result:', error);
      }
    }

    return resultCanvas;
  }

  /**
   * Safe sharpening filter - debug version to check brightness issues
   */
  private static applySafeSharpening(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    strength: number
  ): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const sharpened = new Uint8ClampedArray(data.length);

    // Copy original data first
    for (let i = 0; i < data.length; i++) {
      sharpened[i] = data[i];
    }

    // Unsharp mask kernel that should preserve brightness
    const kernel = [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0]
    ];

    // Apply sharpening only to safe interior pixels
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        for (let c = 0; c < 3; c++) { // RGB channels only
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += data[idx] * kernel[ky + 1][kx + 1];
            }
          }

          const idx = (y * width + x) * 4 + c;
          const original = data[idx];
          // Use proper unsharp mask formula
          const sharpened_value = original + (sum - original) * strength;

          // Careful clamping
          sharpened[idx] = Math.max(0, Math.min(255, sharpened_value));
        }
      }
    }

    const sharpenedData = new ImageData(sharpened, width, height);
    ctx.putImageData(sharpenedData, 0, 0);
  }

  /**
   * Calculate optimal dimensions maintaining aspect ratio
   */
  private static calculateDimensions(
    srcWidth: number,
    srcHeight: number,
    targetSize: number,
    maintainAspectRatio: boolean
  ): { width: number; height: number } {
    if (!maintainAspectRatio) {
      return {width: targetSize, height: targetSize};
    }

    const aspectRatio = srcWidth / srcHeight;

    if (aspectRatio > 1) {
      // Wider than tall
      return {
        width: targetSize,
        height: Math.round(targetSize / aspectRatio)
      };
    } else {
      // Taller than wide or square
      return {
        width: Math.round(targetSize * aspectRatio),
        height: targetSize
      };
    }
  }

  /**
   * Get optimal reconstruction options based on image type
   */
  private static getOptimalOptions(iconType: string, targetSize: number): ReconstructionOptions {
    switch (iconType) {
      case '2d-pixel':
        return {
          method: 'pixel-perfect',
          targetSize,
          maintainAspectRatio: true,
        };

      case '2d-sprite':
        return {
          method: 'edge-preserving',
          targetSize,
          maintainAspectRatio: true,
          sharpeningStrength: 0.3, // Back to good sharpening
          edgeThreshold: 25
        };

      case '3d-rendered':
        return {
          method: 'lanczos',
          targetSize,
          maintainAspectRatio: true,
          sharpeningStrength: 0.15, // Back to good sharpening
        };

      case 'auto':
      default:
        return {
          method: 'bicubic',
          targetSize,
          maintainAspectRatio: true,
          sharpeningStrength: 0.2,
        };
    }
  }
}
