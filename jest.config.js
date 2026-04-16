module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  // Exclude integration tests from default run (they require real API tokens)
  testPathIgnorePatterns: ['/node_modules/', '/integration/'],
  transform: {
    // Compile with module: commonjs so dynamic `await import(...)` calls in
    // src/ are emitted as `Promise.resolve().then(() => require(...))`, which
    // goes through jest's module registry and respects jest.mock(). The
    // production tsconfig uses "Node16" which preserves native dynamic
    // imports and would bypass mocks.
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/types.ts'],
  moduleFileExtensions: ['ts', 'js'],
  verbose: true,
};
