// Mock for pdfjs-dist library
export default {
  GlobalWorkerOptions: {
    workerSrc: 'mock-worker.js'
  },
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: jest.fn(() => Promise.resolve({
        getViewport: jest.fn(() => ({ width: 800, height: 600 })),
        render: jest.fn(() => ({ promise: Promise.resolve() }))
      }))
    })
  }))
};
