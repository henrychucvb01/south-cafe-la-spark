import { PDFDocument, degrees } from 'pdf-lib';

export function rotatePoint([x, y], angle = 0) {
  switch ((angle % 360 + 360) % 360) {
    case 90: return [1 - y, x];
    case 180: return [1 - x, 1 - y];
    case 270: return [y, 1 - x];
    default: return [x, y];
  }
}
export function rotateAnnotations(annotations, rotations) {
  return annotations.map(a => {
    const angle = rotations[a.page] || 0;
    if (a.type === 'draw') return { ...a, points: a.points.map(p => rotatePoint(p, angle)) };
    const [x, y] = rotatePoint([a.x, a.y], angle);
    return { ...a, x, y };
  });
}
export function validateRotations(rotations, pageCount) {
  if (!rotations || typeof rotations !== 'object' || Array.isArray(rotations) || Object.keys(rotations).length > pageCount) throw Error('Invalid PDF rotations.');
  for (const [page, angle] of Object.entries(rotations)) {
    if (!/^[1-9][0-9]*$/.test(page) || Number(page) > pageCount || ![0, 90, 180, 270].includes(angle)) throw Error('Choose a valid PDF page and quarter-turn rotation.');
  }
}
export async function rotatePdf(bytes, rotations) {
  const pdf = await PDFDocument.load(bytes);
  validateRotations(rotations, pdf.getPageCount());
  for (const [page, angle] of Object.entries(rotations)) {
    const item = pdf.getPage(Number(page) - 1);
    item.setRotation(degrees((item.getRotation().angle + angle) % 360));
  }
  // Preserve original page content, form fields and image quality; no rasterizing.
  return pdf.save();
}
