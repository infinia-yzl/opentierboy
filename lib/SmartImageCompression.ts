/**
 * Smart Image Compression for Game Icons
 * Detects image type and applies optimal compression strategy
 */

export type IconType = '2d-pixel' | '2d-sprite' | '3d-rendered';

export interface ImageAnalysis {
  type: IconType;
  uniqueColors: number;
  sharpEdgeRatio: number;
  dominantColors: string[];
}

export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export class SmartImageCompressor {

  /**
   * Analyze image characteristics to determine optimal compression strategy
   */
  static async analyzeImage(canvas: HTMLCanvasElement): Promise<ImageAnalysis> {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Count unique colors
    const colorSet = new Set<string>();
    const colorCounts = new Map<string, number>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip fully transparent pixels
      if (a === 0) continue;

      const colorKey = `${r},${g},${b}`;
      colorSet.add(colorKey);
      colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
    }

    const uniqueColors = colorSet.size;

    // Calculate sharp edge ratio (simplified edge detection)
    const sharpEdgeRatio = this.calculateSharpEdgeRatio(imageData);

    // Get dominant colors
    const dominantColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => `rgb(${color})`);

    // Determine image type based on characteristics
    let type: IconType;
    if (uniqueColors < 32 && sharpEdgeRatio > 0.7) {
      type = '2d-pixel';
    } else if (uniqueColors < 128 && sharpEdgeRatio > 0.4) {
      type = '2d-sprite';
    } else {
      type = '3d-rendered';
    }

    return {
      type,
      uniqueColors,
      sharpEdgeRatio,
      dominantColors
    };
  }

  /**
   * Progressive compression - try different quality levels until target size is met
   */
  static async compressToTargetSize(
    canvas: HTMLCanvasElement,
    maxSizeBytes: number = 12288, // 12KB default for demo
    targetDimensions: number = 120, // 120px default for demo
    forUrlSharing: boolean = false // New parameter for aggressive URL compression
  ): Promise<CompressionResult> {
    const analysis = await this.analyzeImage(canvas);

    // Use different quality levels based on use case
    const qualityLevels = forUrlSharing
      ? this.getUrlQualityLevels(analysis.type)  // More aggressive for URLs
      : this.getQualityLevels(analysis.type);     // Conservative for demo

    const dimensionLevels = [targetDimensions, targetDimensions * 0.9, targetDimensions * 0.8, targetDimensions * 0.7];

    let bestResult: CompressionResult | null = null;

    // Try different dimension sizes
    for (const dimension of dimensionLevels) {
      const scaledCanvas = this.resizeCanvas(canvas, dimension);

      // Try different quality levels for current dimension
      for (const quality of qualityLevels) {
        const dataUrl = scaledCanvas.toDataURL('image/webp', quality);
        const size = this.estimateBase64Size(dataUrl);

        if (size <= maxSizeBytes) {
          const originalSize = this.estimateCanvasSize(canvas);
          bestResult = {
            dataUrl,
            originalSize,
            compressedSize: size,
            compressionRatio: originalSize / size
          };
          break;
        }
      }

      if (bestResult) break;
    }

    // If we couldn't meet the target, return the best quality we can achieve
    if (!bestResult) {
      const fallbackCanvas = this.resizeCanvas(canvas, dimensionLevels[dimensionLevels.length - 1]);
      const dataUrl = fallbackCanvas.toDataURL('image/webp', qualityLevels[qualityLevels.length - 1]);
      const originalSize = this.estimateCanvasSize(canvas);
      const compressedSize = this.estimateBase64Size(dataUrl);

      bestResult = {
        dataUrl,
        originalSize,
        compressedSize,
        compressionRatio: originalSize / compressedSize
      };
    }

    return bestResult;
  }

  /**
   * Resize canvas maintaining aspect ratio
   */
  private static resizeCanvas(sourceCanvas: HTMLCanvasElement, maxSize: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const ratio = Math.min(maxSize / sourceCanvas.width, maxSize / sourceCanvas.height);
    canvas.width = sourceCanvas.width * ratio;
    canvas.height = sourceCanvas.height * ratio;

    // Use different interpolation based on content
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /**
   * Calculate sharp edge ratio for edge detection
   */
  private static calculateSharpEdgeRatio(imageData: ImageData): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    let edgePixels = 0;
    let totalPixels = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = (y * width + x) * 4;

        // Skip transparent pixels
        if (data[index + 3] === 0) continue;

        totalPixels++;

        // Simple edge detection using Sobel operator
        const gx =
          -1 * this.getGrayscale(data, (y - 1) * width + (x - 1)) +
          this.getGrayscale(data, (y - 1) * width + (x + 1)) +
          -2 * this.getGrayscale(data, y * width + (x - 1)) +
          2 * this.getGrayscale(data, y * width + (x + 1)) +
          -1 * this.getGrayscale(data, (y + 1) * width + (x - 1)) +
          this.getGrayscale(data, (y + 1) * width + (x + 1));

        const gy =
          -1 * this.getGrayscale(data, (y - 1) * width + (x - 1)) +
          -2 * this.getGrayscale(data, (y - 1) * width + x) +
          -1 * this.getGrayscale(data, (y - 1) * width + (x + 1)) +
          this.getGrayscale(data, (y + 1) * width + (x - 1)) +
          2 * this.getGrayscale(data, (y + 1) * width + x) +
          this.getGrayscale(data, (y + 1) * width + (x + 1));

        const magnitude = Math.sqrt(gx * gx + gy * gy);

        // Consider it an edge if magnitude is above threshold
        if (magnitude > 50) {
          edgePixels++;
        }
      }
    }

    return totalPixels > 0 ? edgePixels / totalPixels : 0;
  }

  /**
   * Get grayscale value for a pixel
   */
  private static getGrayscale(data: Uint8ClampedArray, pixelIndex: number): number {
    const i = pixelIndex * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  /**
   * Get quality levels based on image type - more conservative to preserve detail
   */
  private static getQualityLevels(type: IconType): number[] {
    switch (type) {
      case '2d-pixel':
        return [0.95, 0.9, 0.85, 0.8, 0.7]; // Higher quality for pixel art
      case '2d-sprite':
        return [0.85, 0.8, 0.7, 0.6, 0.5]; // Balanced for sprites
      case '3d-rendered':
        return [0.7, 0.6, 0.5, 0.4, 0.3]; // Can handle more compression
    }
  }

  /**
   * Get aggressive quality levels for URL sharing - prioritize small size
   */
  private static getUrlQualityLevels(type: IconType): number[] {
    switch (type) {
      case '2d-pixel':
        return [0.8, 0.7, 0.6, 0.5, 0.4]; // More aggressive for URLs
      case '2d-sprite':
        return [0.6, 0.5, 0.4, 0.3, 0.2]; // Much more aggressive
      case '3d-rendered':
        return [0.4, 0.3, 0.2, 0.15, 0.1]; // Very aggressive for photos
    }
  }

  /**
   * Estimate canvas size in bytes
   */
  private static estimateCanvasSize(canvas: HTMLCanvasElement): number {
    return canvas.width * canvas.height * 4; // RGBA
  }

  /**
   * Estimate Base64 string size in bytes - more accurate calculation
   */
  private static estimateBase64Size(dataUrl: string): number {
    // Remove data URL prefix and calculate actual data size
    const base64String = dataUrl.split(',')[1];
    // Base64 to binary ratio is 4:3, but we also need to account for URL encoding
    return Math.floor(base64String.length * 0.75);
  }
}
