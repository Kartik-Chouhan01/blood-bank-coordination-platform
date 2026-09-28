/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_EMERGENCY_HOTLINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
