export interface PaintingDocument {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface FrameSource {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}

export function framePainted(page: PaintingDocument, frames: FrameSource): Promise<void> {
  if (page.visibilityState === 'hidden') return Promise.resolve();
  return new Promise((resolve) => {
    let frame = 0;
    const settle = () => {
      page.removeEventListener('visibilitychange', onVisibilityChange);
      frames.cancelAnimationFrame(frame);
      resolve();
    };
    const onVisibilityChange = () => {
      if (page.visibilityState === 'hidden') settle();
    };
    page.addEventListener('visibilitychange', onVisibilityChange);
    frame = frames.requestAnimationFrame(() => {
      frame = frames.requestAnimationFrame(settle);
    });
  });
}
