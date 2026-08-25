/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "estatico" (GitHub Pages, datos en archivos JSON) o "api" (servidor Node en vivo). */
  readonly VITE_DATA_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
