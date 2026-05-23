import type { MilaBridge } from '../preload';

declare global {
  interface Window {
    mila: MilaBridge;
  }
}

export {};
