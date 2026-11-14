import {toast as sonnerToast, type ExternalToast} from 'sonner';
import {pageBusy} from '@/lib/busy';

/** What a toast says: its title (toast()) or its message (toast.success(), toast.error()). */
type Title = Parameters<typeof sonnerToast>[0];
type Message = Parameters<typeof sonnerToast.success>[0];
type ToastId = string | number;

/**
 * Shows a toast and counts the page as busy until it is on screen (lib/busy.ts).
 *
 * sonner renders a toast one task after the call: inside the call, its Toaster sets a timer
 * (setTimeout with no delay) whose callback renders the toast with flushSync. Timers with the
 * same delay run in the order they were set, so the timer set here, after the call, runs after
 * sonner's, when the toast is already on screen. Ending busy right after the call would let the
 * page say it is not busy one task before the toast shows.
 */
const counted = (show: () => ToastId): ToastId => {
  const end = pageBusy.begin();
  try {
    return show();
  } finally {
    setTimeout(end, 0);
  }
};

/**
 * sonner's toast, with the parts the app uses. Import it from here, never from sonner
 * (eslint.config.mjs): every toast it shows counts the page as busy until it is on screen.
 */
export const toast = Object.freeze(Object.assign(
  (title: Title, data?: ExternalToast): ToastId => counted(() => sonnerToast(title, data)),
  {
    success: (message: Message, data?: ExternalToast): ToastId => counted(() => sonnerToast.success(message, data)),
    error: (message: Message, data?: ExternalToast): ToastId => counted(() => sonnerToast.error(message, data)),
    /** Closes a toast, or every toast. It shows nothing, so it does not count as busy. */
    dismiss: (id?: ToastId): ToastId | undefined => sonnerToast.dismiss(id),
  },
));
