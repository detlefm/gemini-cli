/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

// Mock the `open` package.
vi.mock('open', () => ({
  default: vi.fn(),
}));
