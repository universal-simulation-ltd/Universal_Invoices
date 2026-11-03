/**
 * Set by ShareCleanup (ShareLink.tsx), which has the platform client: the
 * store calls it when documents are deleted, so a link never outlives its
 * document.
 */
export const shareHooks: { deleted?: (ids: string[]) => void } = {};
