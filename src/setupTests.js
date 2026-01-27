import '@testing-library/jest-dom';

// Mock Web Serial API
global.navigator.serial = {
  requestPort: jest.fn(),
  getPorts: jest.fn(() => Promise.resolve([]))
};

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen && this.onopen();
    }, 0);
  }
  send(data) {}
  close() {
    this.readyState = 3;
    this.onclose && this.onclose();
  }
};

// Mock IndexedDB
global.indexedDB = {
  open: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          add: jest.fn(),
          put: jest.fn(),
          get: jest.fn(),
          getAll: jest.fn(),
          delete: jest.fn()
        }))
      }))
    }
  }))
};

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();
