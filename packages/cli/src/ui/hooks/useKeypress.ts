/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  sequence: string;
}

const PASTE_TIMEOUT = 10;

/**
 * A hook that listens for keypress events from stdin, providing a
 * key object that mirrors the one from Node's `readline` module,
 * adding a 'paste' flag for characters input as part of a bracketed
 * paste (when enabled).
 *
 * Pastes are currently sent as a single key event where the full paste
 * is in the sequence field.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 */
export function useKeypress(
  onKeypress: (key: Key) => void,
  { isActive }: { isActive: boolean },
) {
  const { stdin, setRawMode } = useStdin();
  const onKeypressRef = useRef(onKeypress);

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive || !stdin.isTTY) {
      return;
    }

    setRawMode(true);
    // Enable bracketed paste mode. This will cause the terminal to send
    // special escape codes before and after pasted text.
    // See: https://cirw.in/blog/bracketed-paste
    process.stdout.write('\x1b[?2004h');

    const rl = readline.createInterface({ input: stdin });
    readline.emitKeypressEvents(stdin, rl);

    let isPaste = false;
    let pasteBuffer = '';

    let keyBuffer: Key[] = [];
    let bufferTimeout: NodeJS.Timeout | null = null;

    const flushKeyBuffer = () => {
      if (bufferTimeout) {
        clearTimeout(bufferTimeout);
      }

      if (!keyBuffer.length) {
        return;
      }

      if (keyBuffer.length > 1) {
        const sequence = keyBuffer.map((k) => k.sequence).join('');
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence,
        });
      } else {
        // Handle special keys
        const key = keyBuffer[0];
        if (key.name === 'return' && key.sequence === '\x1B\r') {
          key.meta = true;
        }
        onKeypressRef.current(key);
      }
      keyBuffer = [];
    };

    const handleKeypress = (_: unknown, key: Key) => {
      // When bracketed paste mode is enabled, the terminal will send
      // paste-start and paste-end events.
      if (key.name === 'paste-start') {
        flushKeyBuffer();
        isPaste = true;
        return;
      }

      if (key.name === 'paste-end') {
        isPaste = false;
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer,
        });
        pasteBuffer = '';
        return;
      }

      if (isPaste) {
        pasteBuffer += key.sequence;
        return;
      }

      // Fallback for terminals that don't support bracketed paste.
      // We buffer keypresses for a short time and if more than one
      // arrives, we assume it's a paste.
      if (bufferTimeout) {
        clearTimeout(bufferTimeout);
      }

      keyBuffer.push({ ...key, paste: false });

      bufferTimeout = setTimeout(() => {
        flushKeyBuffer();
        bufferTimeout = null;
      }, PASTE_TIMEOUT);
    };

    stdin.on('keypress', handleKeypress);

    return () => {
      stdin.removeListener('keypress', handleKeypress);
      rl.close();

      // Disable bracketed paste mode.
      process.stdout.write('\x1b[?2004l');
      setRawMode(false);

      // Flush any pending buffers.
      if (bufferTimeout) {
        clearTimeout(bufferTimeout);
      }
      flushKeyBuffer();

      if (isPaste) {
        onKeypressRef.current({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: true,
          sequence: pasteBuffer,
        });
      }
    };
  }, [isActive, stdin, setRawMode]);
}
