/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_OWNER_ADMIN_USER_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}