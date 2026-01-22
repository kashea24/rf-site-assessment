import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Convert PDF file to image data URL
 * @param {File} file - PDF file object
 * @param {number} maxWidth - Maximum width in pixels (default 2000)
 * @param {number} maxHeight - Maximum height in pixels (default 2000)
 * @returns {Promise<string>} - Base64 image data URL
 */
export async function pdfToImage(file, maxWidth = 2000, maxHeight = 2000) {
  // Read file as array buffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Load PDF document
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  // Get first page
  const page = await pdf.getPage(1);
  
  // Calculate scale to fit within max dimensions
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(
    maxWidth / viewport.width,
    maxHeight / viewport.height,
    2.0 // Don't exceed 2x scale for quality
  );
  
  const scaledViewport = page.getViewport({ scale });
  
  // Create canvas
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  // Render PDF page to canvas
  const renderContext = {
    canvasContext: context,
    viewport: scaledViewport
  };
  
  await page.render(renderContext).promise;
  
  // Convert canvas to data URL
  const imageData = canvas.toDataURL('image/png');
  
  return imageData;
}

/**
 * Get PDF dimensions without rendering
 * @param {File} file - PDF file object
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getPDFDimensions(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  
  return {
    width: viewport.width,
    height: viewport.height
  };
}
