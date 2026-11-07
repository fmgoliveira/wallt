/// <reference types="nativewind/types" />

// nativewind ships an empty `.d.ts` for its Tailwind preset; declare the shape we use.
declare module "nativewind/preset" {
  const preset: import("tailwindcss").Config;
  export default preset;
}
