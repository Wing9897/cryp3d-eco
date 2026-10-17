/// <reference types="vite/client" />

declare module 'virtual:logo-manifest' {
  const manifest: Readonly<Record<string, string>>;
  export default manifest;
}

