// Shared viewport scale for screen-sized point sprites: the Engine refreshes it on start and on resize,
// and the systems that size gl_PointSize read it each frame so flames and stars match the real resolution.
/** Device-pixel scale of the current view; pxPerMetre is pixels per metre at 1 m from the camera. */
export const viewport = {
  pxPerMetre: 500,
  pixelRatio: 1,
};
