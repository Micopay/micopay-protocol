import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}
