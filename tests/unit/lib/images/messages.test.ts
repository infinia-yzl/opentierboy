import {describe, expect, it} from 'vitest';
import {LINK_IMAGE_REFUSALS} from '@/lib/images/linkImage';
import {DEVICE_IMAGE_REFUSAL_MESSAGES, IMAGE_CHECK_FAILURE_MESSAGES, LINK_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';

describe('image messages', () => {
  it('have a plain sentence for every reason code', () => {
    for (const reason of LINK_IMAGE_REFUSALS) {
      expect(LINK_IMAGE_REFUSAL_MESSAGES[reason], reason).toMatch(/^[A-Z].*\.$/);
    }
    for (const message of [...Object.values(IMAGE_CHECK_FAILURE_MESSAGES), ...Object.values(DEVICE_IMAGE_REFUSAL_MESSAGES)]) {
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
    expect(Object.keys(IMAGE_CHECK_FAILURE_MESSAGES).sort()).toEqual(['aborted', 'error', 'invalid-url', 'no-size', 'timeout', 'too-large', 'unsupported']);
  });
});
