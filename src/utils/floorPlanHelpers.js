import { logger } from '../logger';

/**
 * Generate grid configuration from floor plan dimensions
 * @param {number} width - Floor plan width in pixels
 * @param {number} height - Floor plan height in pixels
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @returns {object} Grid configuration with cell dimensions
 */
export function generateGrid(width, height, rows, cols) {
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        row,
        col,
        key: `${row}-${col}`,
        centerX: (col + 0.5) * cellWidth,
        centerY: (row + 0.5) * cellHeight,
        bounds: {
          x: col * cellWidth,
          y: row * cellHeight,
          width: cellWidth,
          height: cellHeight
        }
      });
    }
  }
  
  logger.info('GridHelpers', `Generated ${rows}x${cols} grid (${cells.length} cells)`);
  
  return {
    rows,
    cols,
    cellWidth,
    cellHeight,
    cells,
    totalCells: cells.length
  };
}

/**
 * Calculate recommended grid size based on venue area
 * @param {number} width - Venue width in feet
 * @param {number} height - Venue height in feet
 * @param {number} cellSize - Desired cell size in feet (default 10)
 * @returns {object} Recommended rows and columns
 */
export function recommendGridSize(width, height, cellSize = 10) {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  
  return { rows, cols };
}

/**
 * Get grid cell from pixel coordinates
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @param {object} gridConfig - Grid configuration
 * @returns {object|null} Cell info or null if outside grid
 */
export function getGridCellAtPoint(x, y, gridConfig) {
  const col = Math.floor(x / gridConfig.cellWidth);
  const row = Math.floor(y / gridConfig.cellHeight);
  
  if (row < 0 || row >= gridConfig.rows || col < 0 || col >= gridConfig.cols) {
    return null;
  }
  
  return gridConfig.cells.find(cell => cell.row === row && cell.col === col);
}

/**
 * Calculate measurement progress
 * @param {object} gridMeasurements - Object with measurements keyed by cell key
 * @param {number} totalCells - Total number of cells in grid
 * @returns {object} Progress statistics
 */
export function calculateProgress(gridMeasurements, totalCells) {
  const measured = Object.keys(gridMeasurements).length;
  const percentage = (measured / totalCells) * 100;
  
  return {
    measured,
    total: totalCells,
    remaining: totalCells - measured,
    percentage: Math.round(percentage)
  };
}
