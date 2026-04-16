/// <reference types="vite/client" />

declare module "canvas-confetti" {
  type ConfettiOptions = Record<string, unknown>;
  const confetti: (options?: ConfettiOptions) => Promise<null> | null;
  export default confetti;
}
