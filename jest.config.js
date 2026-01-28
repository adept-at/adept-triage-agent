module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  // Exclude integration tests from default run (they require real API tokens)
  testPathIgnorePatterns: ['/node_modules/', '/integration/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/types.ts'],
  moduleFileExtensions: ['ts', 'js'],
  verbose: true,
};
