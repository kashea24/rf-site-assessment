import { logger } from '../logger';

/**
 * Inverse Distance Weighting (IDW) interpolation for heatmap generation
 * @param {Array} measurements - Array of {x, y, value} points
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} power - Power parameter (default 2)
 * @param {number} resolution - Pixel resolution for interpolation (default 5)
 * @returns {Array<Array>} 2D array of interpolated values
 */
export function generateHeatmap(measurements, width, height, power = 2, resolution = 5) {
  if (measurements.length === 0) {
    logger.warn('HeatmapInterpolation', 'No measurements provided');
    return [];
  }

  const heatmapData = [];
  const step = resolution;
  
  logger.info('HeatmapInterpolation', `Generating ${Math.ceil(width/step)}x${Math.ceil(height/step)} heatmap from ${measurements.length} points`);
  
  for (let y = 0; y < height; y += step) {
    const row = [];
    for (let x = 0; x < width; x += step) {
      row.push(interpolatePoint(x, y, measurements, power));
    }
    heatmapData.push(row);
  }
  
  return heatmapData;
}

/**
 * Interpolate value at a point using IDW
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array} measurements - Measurement points
 * @param {number} power - IDW power parameter
 * @returns {number} Interpolated value
 */
function interpolatePoint(x, y, measurements, power) {
  let weightedSum = 0;
  let weightSum = 0;
  
  for (const point of measurements) {
    const distance = Math.sqrt(
      Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2)
    );
    
    // If point is exactly at a measurement, return that measurement
    if (distance < 0.1) {
      return point.value;
    }
    
    const weight = 1 / Math.pow(distance, power);
    weightedSum += point.value * weight;
    weightSum += weight;
  }
  
  return weightedSum / weightSum;
}

/**
 * Apply Gaussian blur to heatmap for smoothing
 * @param {Array<Array>} heatmapData - 2D heatmap array
 * @param {number} radius - Blur radius (default 2)
 * @returns {Array<Array>} Blurred heatmap data
 */
export function gaussianBlur(heatmapData, radius = 2) {
  const kernel = generateGaussianKernel(radius);
  const result = [];
  
  for (let y = 0; y < heatmapData.length; y++) {
    const row = [];
    for (let x = 0; x < heatmapData[0].length; x++) {
      row.push(applyKernel(heatmapData, x, y, kernel, radius));
    }
    result.push(row);
  }
  
  return result;
}

/**
 * Generate Gaussian kernel
 */
function generateGaussianKernel(radius) {
  const size = radius * 2 + 1;
  const kernel = [];
  const sigma = radius / 2;
  let sum = 0;
  
  for (let y = -radius; y <= radius; y++) {
    const row = [];
    for (let x = -radius; x <= radius; x++) {
      const value = Math.exp(-(x*x + y*y) / (2 * sigma * sigma));
      row.push(value);
      sum += value;
    }
    kernel.push(row);
  }
  
  // Normalize kernel
  for (let y = 0; y < kernel.length; y++) {
    for (let x = 0; x < kernel[0].length; x++) {
      kernel[y][x] /= sum;
    }
  }
  
  return kernel;
}

/**
 * Apply convolution kernel at a point
 */
function applyKernel(data, x, y, kernel, radius) {
  let sum = 0;
  
  for (let ky = -radius; ky <= radius; ky++) {
    for (let kx = -radius; kx <= radius; kx++) {
      const dataY = Math.max(0, Math.min(data.length - 1, y + ky));
      const dataX = Math.max(0, Math.min(data[0].length - 1, x + kx));
      sum += data[dataY][dataX] * kernel[ky + radius][kx + radius];
    }
  }
  
  return sum;
}

/**
 * Convert heatmap data to color gradient
 * @param {number} value - Signal value (dBm)
 * @returns {string} RGBA color string
 */
export function valueToColor(value) {
  // Signal thresholds (dBm)
  const excellent = -70; // < -70 is excellent
  const acceptable = -60; // -70 to -60 is acceptable
  const caution = -50;    // -60 to -50 is caution
  // > -50 is interference
  
  let r, g, b, a = 0.6;
  
  if (value < excellent) {
    // Green - excellent signal
    r = 34; g = 197; b = 94;
  } else if (value < acceptable) {
    // Yellow-green gradient
    const t = (value - excellent) / (acceptable - excellent);
    r = Math.round(34 + (234 - 34) * t);
    g = Math.round(197 + (179 - 197) * t);
    b = Math.round(94 + (8 - 94) * t);
  } else if (value < caution) {
    // Yellow-orange gradient
    const t = (value - acceptable) / (caution - acceptable);
    r = Math.round(234 + (245 - 234) * t);
    g = Math.round(179 + (158 - 179) * t);
    b = Math.round(8 + (11 - 8) * t);
  } else {
    // Orange-red gradient
    const t = Math.min(1, (value - caution) / 10);
    r = Math.round(245 + (239 - 245) * t);
    g = Math.round(158 + (68 - 158) * t);
    b = Math.round(11 + (68 - 11) * t);
  }
  
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Render heatmap to canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<Array>} heatmapData - 2D heatmap array
 * @param {number} cellSize - Size of each heatmap cell in pixels
 */
export function renderHeatmap(ctx, heatmapData, cellSize) {
  for (let y = 0; y < heatmapData.length; y++) {
    for (let x = 0; x < heatmapData[y].length; x++) {
      const value = heatmapData[y][x];
      ctx.fillStyle = valueToColor(value);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}
