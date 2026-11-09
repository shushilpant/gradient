import { defineConfig } from 'vitest/config';

// The official Canvas checkout is a separately built application with its own
// dependencies and tests. Only OffCanvas's tests belong to this test run.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
