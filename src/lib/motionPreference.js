export const MOTION_STORAGE_KEY = 'dd_motion_paused';

export function resolveMotionPaused(saved, systemReduced) {
  return Boolean(systemReduced || saved === true);
}

export function readSavedMotionPause() {
  try { return JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)) === true; } catch { return false; }
}
