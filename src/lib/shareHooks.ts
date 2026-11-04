/**
 * Set by ShareCleanup (ShareLink.tsx), which has the platform client: the
 * store calls it when documents or shared companies are deleted, so a link
 * never outlives what it points at.
 */
export const shareHooks: { deleted?: (ids: string[]) => void; companiesDeleted?: (ids: string[]) => void } = {};
