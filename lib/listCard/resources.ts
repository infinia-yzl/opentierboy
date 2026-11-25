export type ResourceState = 'loaded' | 'failed';

type Listener = () => void;

interface LoadEvents {
  addEventListener(type: 'load' | 'error', listener: Listener): void;
  removeEventListener(type: 'load' | 'error', listener: Listener): void;
}

export interface ImageResource extends LoadEvents {
  readonly complete: boolean;
  readonly naturalWidth: number;
}

export interface StyleSheetResource extends LoadEvents {
  readonly sheet: unknown;
}

export interface FontFaceResource {
  readonly family: string;
  load(): Promise<unknown>;
}

function settledByEvent(target: LoadEvents): Promise<ResourceState> {
  return new Promise((resolve) => {
    const settle = (state: ResourceState) => {
      target.removeEventListener('load', onLoad);
      target.removeEventListener('error', onError);
      resolve(state);
    };
    const onLoad = () => settle('loaded');
    const onError = () => settle('failed');
    target.addEventListener('load', onLoad);
    target.addEventListener('error', onError);
  });
}

export function imageSettled(image: ImageResource): Promise<ResourceState> {
  if (image.complete) return Promise.resolve(image.naturalWidth > 0 ? 'loaded' : 'failed');
  return settledByEvent(image);
}

export function styleSheetSettled(link: StyleSheetResource): Promise<ResourceState> {
  if (link.sheet) return Promise.resolve('loaded');
  return settledByEvent(link);
}

const unquoted = (name: string) => name.trim().replace(/^(["'])(.*)\1$/, '$2');

export function firstFontFamily(fontFamily: string): string {
  return unquoted(fontFamily.split(',')[0] ?? '');
}

export function fontFacesSettled(faces: Iterable<FontFaceResource>, fontFamily: string): Promise<ResourceState[]> {
  const family = firstFontFamily(fontFamily);
  const own = Array.from(faces).filter((face) => unquoted(face.family) === family);
  return Promise.all(own.map((face) => face.load().then((): ResourceState => 'loaded', (): ResourceState => 'failed')));
}
