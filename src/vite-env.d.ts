/// <reference types="vite/client" />

declare module '*.woff?base64' {
  const src: string;
  export default src;
}
