/**
 * What the editor tells people when an image cannot be added. One plain sentence per reason
 * code, so the wording lives in one place (the owner reviews it).
 */
import type {DevicePutRefusal} from './deviceStore';
import type {ImageCheckFailure} from './imageCheck';
import type {LinkImageRefusal} from './linkImage';

/** Why an image address was refused (lib/images/linkImage.ts). */
export const LINK_IMAGE_REFUSAL_MESSAGES: Readonly<Record<LinkImageRefusal, string>> = {
  'not-a-string': 'Enter the address of an image.',
  empty: 'Enter the address of an image.',
  'too-long': 'This address is too long. Use an address of up to 2,000 characters.',
  'invalid-url': 'This is not a complete web address. It should start with https://.',
  'not-https': 'Use an address that starts with https://. Images from http:// addresses are not allowed.',
  'unsupported-scheme': 'Use an image address that starts with https://.',
  credentials: 'Remove the user name or password from the address.',
  port: 'Use an address without a port number (such as :8080).',
  'ip-address': 'Use an address with a site name. Number addresses (IP addresses) are not allowed.',
  localhost: 'Addresses on your own computer (localhost) are not allowed.',
  'private-name': 'This address points to a private or local network. Use a public image address.',
  'invalid-host': 'The site name in this address is not valid.',
};

/** Why an image did not load (lib/images/imageCheck.ts). */
export const IMAGE_CHECK_FAILURE_MESSAGES: Readonly<Record<ImageCheckFailure, string>> = {
  'invalid-url': 'This address cannot be used for an image.',
  unsupported: 'This browser cannot check the image.',
  error: 'The image did not load. The address may not point to an image, or the site may not share it.',
  timeout: 'The image took too long to load.',
  'too-large': 'The image is too large: more than 8,192 pixels wide or tall, or more than 32 megapixels.',
  'no-size': 'The image has no size, so it cannot be shown.',
  aborted: 'The check was stopped.',
};

/** Why an image from the device could not be kept (lib/images/deviceStore.ts and lib/images/prepareImage.ts). */
export const DEVICE_IMAGE_REFUSAL_MESSAGES: Readonly<Record<DevicePutRefusal | 'unreadable', string>> = {
  'not-a-blob': 'This is not an image file.',
  empty: 'The file is empty.',
  'too-large': 'The image is too large, even after making it smaller.',
  'unsupported-type': 'This file type is not supported. Use a PNG, JPEG, WebP, GIF or AVIF image.',
  'invalid-id': 'The image could not be saved.',
  'storage-full': 'Your browser has no room left for more images. Remove some items with images first.',
  'storage-error': 'Your browser could not save the image.',
  unreadable: 'This file could not be read as an image.',
};
