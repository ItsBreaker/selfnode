/**
 * Single source of truth for product naming. The product name may change
 * before submission; change it here and nowhere else.
 */
export const brand = {
  name: "Selfnode",
  tagline: "A private, verified Ethereum wallet, explorer and swap — on your own node.",
  repoUrl: "https://github.com/ItsBreaker/selfnode",
  license: "MIT",
} as const;

export type Brand = typeof brand;
