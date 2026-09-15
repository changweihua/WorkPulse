/**
 * Augment Window.ai with cancel method added in streaming resilience improvements.
 * This supplements the preload/index.d.ts declaration for the renderer tsconfig.
 */
export {};

declare global {
  interface Window {
    ai: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
      cancel: (requestId: string) => Promise<void>;
      saveLLMToken: (modelId: string, token: string) => Promise<boolean>;
      getLLMToken: (modelId: string) => Promise<string | null>;
      deleteLLMToken: (modelId: string) => Promise<boolean>;
    };
  }
}
