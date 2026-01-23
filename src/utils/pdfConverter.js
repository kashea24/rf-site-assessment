import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker using local package
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Convert PDF file to image data URL
 * @param {File} file - PDF file object
 * @param {number} maxWidth - Maximum width in pixels (default 2000)
 * @param {number} maxHeight - Maximum height in pixels (default 2000)
 * @returns {Promise<string>} - Base64 image data URL
 */
export async function pdfToImage(file, maxWidth = 2000, maxHeight = 2000) {
  try {
    console.log('Starting PDF conversion...', file.name, file.size);
    
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer loaded, size:', arrayBuffer.byteLength);
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    console.log('Loading PDF document...');
    const pdf = await loadingTask.promise;
    console.log('PDF loaded, pages:', pdf.numPages);
  
    // Get first page
    const page = await pdf.getPage(1);
    console.log('Page loaded');
    
    // Calculate scale to fit within max dimensions
    const viewport = page.getViewport({ scale: 1.0 });
    console.log('Original viewport:', viewport.width, 'x', viewport.height);
    
    const scale = Math.min(
      maxWidth / viewport.width,
      maxHeight / viewport.height,
      2.0 // Don't exceed 2x scale for quality
    );
    console.log('Calculated scale:', scale);
    
    const scaledViewport = page.getViewport({ scale });
    console.log('Scaled viewport:', scaledViewport.width, 'x', scaledViewport.height);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    console.log('Canvas created');
    
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport
    };
    
    console.log('Starting render...');
    await page.render(renderContext).promise;
    console.log('Render complete');
    
    // Convert canvas to data URL
    const imageData = canvas.toDataURL('image/png');
    console.log('Image data URL created, length:', imageData.length);
    
    return imageData;
  } catch (error) {
    console.error('Error in pdfToImage:', error);
    throw error;
  }
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
