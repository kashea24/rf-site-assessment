export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.svg$': '<rootDir>/src/__mocks__/fileMock.js',
    '^pdfjs-dist$': '<rootDir>/src/__mocks__/pdfMock.js',
    '^pdfjs-dist/build/pdf.worker.mjs\\?url$': '<rootDir>/src/__mocks__/pdfMock.js'
  },
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { 
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }]
      ]
    }]
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
    '!src/main.jsx',
    '!src/setupTests.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  transformIgnorePatterns: [
    'node_modules/(?!(pdfjs-dist|react-window)/)'
  ]
};
