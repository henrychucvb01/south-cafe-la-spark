let libraryPromise;
export function loadPdfLibrary() {
  if (!libraryPromise) libraryPromise = import(/* webpackIgnore: true */ '/pdfjs/pdf.mjs').then(pdf => {
    pdf.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
    return pdf;
  }).catch(error => { libraryPromise = null; throw error; });
  return libraryPromise;
}
