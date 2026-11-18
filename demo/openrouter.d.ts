export const ENDPOINT: string;
export const MAX_STEPS: number;
export const MODELS: { id: string; label: string }[];
export const DEFAULT_MODEL: string;
export const STORAGE_KEY: string;
export function createKeyStore(storage: Storage | undefined): {
  get(): string;
  remembered(): boolean;
  set(key: string, remember: boolean): void;
  forget(): void;
};
export class OpenRouterError extends Error {
  status: number;
  kind?: "tools" | "format";
}
