const ignorePaths = ['/node_modules/', '/build/', '/integration-testing/'];

module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  coveragePathIgnorePatterns: [...ignorePaths],
  testPathIgnorePatterns: [...ignorePaths],
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['<rootDir>/jestSetup.ts'],
};
