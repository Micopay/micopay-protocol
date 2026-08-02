import '@testing-library/jest-dom';

// Polyfill crypto.getRandomValues for jsdom environment
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
      subtle: {} as SubtleCrypto,
    } as Crypto,
    writable: true,
    configurable: true,
  });
}