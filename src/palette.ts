/**
 * One set of colours for both views. The top-down renderer fills polygons with them; the
 * first-person scene tints materials with them, so a fietspad is the same red from above as it is
 * from the saddle.
 */
export const PALETTE = {
  grass: '#7d9c66',
  asphalt: '#4c4d51',
  fietspad: '#a04a3f',
  fietspadEdge: '#b3564a',
  kerb: '#b7b3a9',
  // Paving slabs, a shade darker than the band that edges them so the two do not merge into one
  // grey strip when seen down a long street.
  trottoir: '#a8a49b',
  lamp: '#5b6068',
  guardrail: '#8b9099',
  hectometerPost: '#1f6b3a',
  tree: '#3f6b42',
  paint: '#eceae3',
  house: '#c3ab93',
  houseAlt: '#b09a86',
  roof: '#7d5a4a',
  hedge: '#5f7f4d',
  sky: '#8fb3d4',

  // Road signs. RVV colours rather than picked ones: a Dutch A1 is a red ring on white, a B1 is
  // yellow, and bewegwijzering is that particular blue. Both renderers read these, so a sign
  // cannot be one colour from the saddle and another from above.
  signPost: '#8a8f96',
  signWhite: '#f4f3ef',
  signRed: '#c8102e',
  signYellow: '#f2c218',
  signBlue: '#12559c',
};
