/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'integration',
      rootDir: 'test',
      testRegex: '.*\\.int-spec\\.ts$',
      setupFiles: ['<rootDir>/setup-env.ts'],
      globalSetup: '<rootDir>/global-setup.ts',
      testTimeout: 30000,
    },
  ],
};
