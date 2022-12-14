import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        include: ['**/test/*-test.js'],
        testTimeout: 2500,
    },
});