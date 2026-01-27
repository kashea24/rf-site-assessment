import { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize2, Square, Wifi, Radio, Monitor, 
  Palette, Undo, Redo, XCircle, ChevronUp, ChevronDown, 
  CheckCircle, Tv, Activity, Trash2, Copy, Clipboard
} from 'lucide-react';
import { logger } from '../../logger';

export default function FloorPlanCanvas({ 
  floorPlanImage, 
  gridConfig,
  onGridGenerated,
  landmarks = [],
  onLandmarksChange,
  boundaries = [],
  onBoundariesChange,
  ledWalls = [],
  onLedWallsChange,
  showGrid = false,
  gridMeasurements = {},
  selectedGridCell = null,
  onGridCellClick,
  drawBoundaryMode = false,
  onDrawBoundaryModeChange,
  boundaryStrokeColor = '#06b6d4',
  onBoundaryColorChange,
  onDeleteBoundary,
  gridRows = 5,
  gridCols = 5,
  onGridRowsChange,
  onGridColsChange,
  onGenerateGrid,
  ledWallMode = false,
  onLedWallModeChange,
  ledWallColor = '#ef4444',
  onLedWallColorChange,
  onAddWifiAP,
  onAddCommsRx,
  onStartLedWall,
  onDeleteLandmark,
  onDeleteLedWall,
  onDeleteBoundaryByIndex,
  testingMode = false,
  contextMenu,
  onContextMenuChange,
  clipboard,
  onCopyItem,
  onPasteItem,
  onClearCellMeasurement,
  spectrumData = [],
  onTakeReading
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [viewState, setViewState] = useState({
    zoom: 1,
    panX: 0,
    panY: 0
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [drawMode, setDrawMode] = useState(null);
  const [drawingPath, setDrawingPath] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [ledWallDrawingPath, setLedWallDrawingPath] = useState([]);
  const [draggingLandmark, setDraggingLandmark] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [imageObj, setImageObj] = useState(null);
  const [isCapturingSamples, setIsCapturingSamples] = useState(false);
  const [samplingProgress, setSamplingProgress] = useState(0);

  // Load floor plan image
  useEffect(() => {
    if (!floorPlanImage) return;
    
    const img = new Image();
    img.onload = () => {
      setImageObj(img);
      logger.info('FloorPlanCanvas', 'Image loaded', img.width + 'x' + img.height);
      // Center and fit the image
      if (containerRef.current) {
        const container = containerRef.current;
        const fitZoom = Math.min(
          container.clientWidth / img.width,
          container.clientHeight / img.height
        );
        const scaledWidth = img.width * fitZoom;
        const scaledHeight = img.height * fitZoom;
        setViewState({
          zoom: fitZoom,
          panX: (container.clientWidth - scaledWidth) / 2,
          panY: (container.clientHeight - scaledHeight) / 2
        });
      }
    };
    img.src = floorPlanImage;
  }, [floorPlanImage]);

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;

    const ctx = canvas.getContext('2d');
    const { zoom, panX, panY } = viewState;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw floor plan image
    ctx.drawImage(imageObj, 0, 0);

    // Draw grid if enabled
    if (showGrid && gridConfig) {
      drawGrid(ctx, imageObj.width, imageObj.height, gridConfig);
    }

    // Draw landmarks
    landmarks.forEach(landmark => {
      drawLandmark(ctx, landmark);
    });

    // Draw boundaries
    boundaries.forEach(boundary => {
      drawBoundary(ctx, boundary);
    });

    // Draw LED walls
    ledWalls.forEach(wall => {
      drawLedWall(ctx, wall);
    });

    // Draw current boundary drawing path
    if (drawingPath.length > 0) {
      ctx.strokeStyle = boundaryStrokeColor;
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
      drawingPath.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw points
      ctx.fillStyle = boundaryStrokeColor;
      drawingPath.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw LED wall drawing path
    if (ledWallDrawingPath.length > 0) {
      ctx.strokeStyle = ledWallColor;
      ctx.lineWidth = 8 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(ledWallDrawingPath[0].x, ledWallDrawingPath[0].y);
      ledWallDrawingPath.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw points
      ctx.fillStyle = ledWallColor;
      ledWallDrawingPath.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Restore context
    ctx.restore();
  }, [imageObj, viewState, showGrid, gridConfig, landmarks, boundaries, ledWalls, drawingPath, ledWallDrawingPath, boundaryStrokeColor, ledWallColor, selectedGridCell, draggingLandmark]);

  // Redraw when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Draw grid
  const drawGrid = (ctx, width, height, config) => {
    if (!config || !config.boundary) {
      return;
    }

    const cellWidth = config.width / config.cols;
    const cellHeight = config.height / config.rows;
    const startX = config.offsetX;
    const startY = config.offsetY;

    // Save context and clip to boundary
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(config.boundary[0].x, config.boundary[0].y);
    config.boundary.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.clip();

    // Grid lines match boundary color
    const boundaryColor = boundaries[0]?.color || boundaryStrokeColor;
    ctx.strokeStyle = boundaryColor;
    ctx.lineWidth = 2 / viewState.zoom;

    // Draw vertical lines
    for (let col = 0; col <= config.cols; col++) {
      const x = startX + col * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + config.height);
      ctx.stroke();
    }

    // Draw horizontal lines
    for (let row = 0; row <= config.rows; row++) {
      const y = startY + row * cellHeight;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + config.width, y);
      ctx.stroke();
    }

    // Draw cell measurements and highlights
    ctx.font = `${14 / viewState.zoom}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        const cellX = startX + (col + 0.5) * cellWidth;
        const cellY = startY + (row + 0.5) * cellHeight;
        
        // Check if cell center is inside boundary
        if (!isPointInBoundary(cellX, cellY, { points: config.boundary })) {
          continue;
        }
        
        const cellKey = `${row}-${col}`;
        
        // Highlight if selected
        if (selectedGridCell && selectedGridCell.row === row && selectedGridCell.col === col) {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
          ctx.fillRect(startX + col * cellWidth, startY + row * cellHeight, cellWidth, cellHeight);
        }
        
        // Color based on measurement status
        const measurement = gridMeasurements[cellKey];
        if (measurement) {
          // Handle skipped cells - grey them out
          if (measurement.skipped) {
            ctx.fillStyle = 'rgba(107, 119, 133, 0.2)'; // Grey
            ctx.fillRect(startX + col * cellWidth, startY + row * cellHeight, cellWidth, cellHeight);
          } else if (measurement.average !== undefined) {
            // Calculate interference score based on 4800-6100 MHz band
            // Single band measurement (no band1/band2 split)
            const signalLevel = measurement.average;
            
            // Green > Yellow > Red scale:
            // More frequencies available without interference = greener
            // Less frequencies available = redder
            let color;
            if (signalLevel < -75) {
              // Strong green: Clear spectrum, many frequencies available
              color = 'rgba(34, 197, 94, 0.5)'; // Green
            } else if (signalLevel < -65) {
              // Light green: Good spectrum
              color = 'rgba(74, 222, 128, 0.4)'; // Light green
            } else if (signalLevel < -55) {
              // Yellow: Moderate interference, some frequencies available
              color = 'rgba(234, 179, 8, 0.5)'; // Yellow
            } else if (signalLevel < -45) {
              // Orange: High interference, few frequencies available
              color = 'rgba(251, 146, 60, 0.5)'; // Orange
            } else {
              // Red: Very high interference, very limited frequencies
              color = 'rgba(239, 68, 68, 0.6)'; // Red
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(startX + col * cellWidth, startY + row * cellHeight, cellWidth, cellHeight);
          }
        }
        // Note: Untested cells have no background color

        // Draw cell number
        if (measurement?.skipped) {
          // Skipped cells - grey background
          ctx.fillStyle = 'rgba(107, 119, 133, 0.4)';
          ctx.fillRect(startX + col * cellWidth, startY + row * cellHeight, cellWidth, cellHeight);
          ctx.fillStyle = '#e6edf3';
          ctx.fillText(`${row * config.cols + col + 1}`, cellX, cellY);
          // Add "SKIP" label
          ctx.font = `${10 / viewState.zoom}px system-ui`;
          ctx.fillText('SKIP', cellX, cellY + 12 / viewState.zoom);
          ctx.font = `${14 / viewState.zoom}px system-ui`; // Reset font
        } else {
          ctx.fillStyle = measurement ? '#e6edf3' : '#a1a1aa';
          ctx.fillText(`${row * config.cols + col + 1}`, cellX, cellY);
        }
      }
    }
    
    // Restore context to remove clipping
    ctx.restore();
  };

  // Draw landmark
  const drawLandmark = (ctx, landmark) => {
    const { x, y, type } = landmark;
    const size = 30 / viewState.zoom;

    ctx.save();
    ctx.translate(x, y);

    switch (type) {
      case 'led-wall':
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-size/2, -size/2, size, size);
        ctx.fillStyle = '#fff';
        ctx.font = `${12 / viewState.zoom}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LED', 0, 0);
        break;
      case 'wifi':
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(0, 0, size/2, 0, Math.PI * 2);
        ctx.fill();
        // WiFi symbol
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / viewState.zoom;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(0, size/4, size/4 * i, -Math.PI * 0.6, -Math.PI * 0.4, false);
          ctx.stroke();
        }
        break;
      case 'antenna':
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(0, -size/2);
        ctx.lineTo(size/2, size/2);
        ctx.lineTo(-size/2, size/2);
        ctx.closePath();
        ctx.fill();
        // Antenna symbol
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / viewState.zoom;
        ctx.beginPath();
        ctx.moveTo(0, -size/3);
        ctx.lineTo(0, size/3);
        ctx.stroke();
        break;
    }

    ctx.restore();
  };

  // Draw boundary
  const drawBoundary = (ctx, boundary) => {
    if (boundary.points.length < 2) return;

    const strokeColor = boundary.color || '#06b6d4';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3 / viewState.zoom;

    ctx.beginPath();
    ctx.moveTo(boundary.points[0].x, boundary.points[0].y);
    boundary.points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.stroke();
  };

  // Draw LED wall
  const drawLedWall = (ctx, wall) => {
    if (wall.points.length < 2) return;

    const strokeColor = wall.color || '#ef4444';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 8 / viewState.zoom;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(wall.points[0].x, wall.points[0].y);
    wall.points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  };

  // Check if point is inside boundary polygon
  const isPointInBoundary = (x, y, boundary) => {
    if (!boundary || boundary.points.length < 3) return true;
    
    let inside = false;
    const points = boundary.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Handle mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    
    if (!containerRef.current || !imageObj) return;
    
    const container = containerRef.current;
    const minZoom = Math.min(
      container.clientWidth / imageObj.width,
      container.clientHeight / imageObj.height
    );
    const maxZoom = 5;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, viewState.zoom * delta));
    
    // Zoom towards mouse position
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomRatio = newZoom / viewState.zoom;
    
    setViewState(prev => ({
      zoom: newZoom,
      panX: mouseX - (mouseX - prev.panX) * zoomRatio,
      panY: mouseY - (mouseY - prev.panY) * zoomRatio
    }));
  };

  // Handle mouse down
  const handleMouseDown = (e) => {
    if (e.button === 2) return; // Ignore right clicks - handled by onContextMenu
    
    // Close context menu if open
    if (contextMenu) {
      onContextMenuChange?.(null);
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom;

    if (drawBoundaryMode) {
      // Add point to boundary drawing path
      setDrawingPath(prev => [...prev, { x, y }]);
      logger.info('FloorPlanCanvas', 'Added boundary point:', x, y);
    } else if (ledWallMode) {
      // Add point to LED wall drawing path
      setLedWallDrawingPath(prev => [...prev, { x, y }]);
      logger.info('FloorPlanCanvas', 'Added LED wall point:', x, y);
    } else {
      // Check if clicking on a landmark or LED wall (only draggable if not in testing mode)
      if (!testingMode) {
        // Check landmarks first
        const clickedLandmark = landmarks.find(landmark => {
          const dx = x - landmark.x;
          const dy = y - landmark.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < 30 / viewState.zoom;
        });

        if (clickedLandmark) {
          // Start dragging landmark
          setDraggingLandmark(clickedLandmark.id);
          logger.info('FloorPlanCanvas', 'Started dragging landmark:', clickedLandmark.id);
          return;
        }

        // Check LED walls
        const clickedLedWall = ledWalls.find(wall => {
          // Check if click is near any point in the LED wall path
          if (!wall.points || wall.points.length === 0) return false;
          return wall.points.some(point => {
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < 20 / viewState.zoom;
          });
        });

        if (clickedLedWall) {
          setDraggingLandmark(`ledWall-${clickedLedWall.id}`);
          setDragStart({ x, y, wallPoints: JSON.parse(JSON.stringify(clickedLedWall.points)) });
          logger.info('FloorPlanCanvas', 'Started dragging LED wall:', clickedLedWall.id);
          return;
        }
      }

      // Check if clicking on grid cell - works in both edit and testing modes
      if (showGrid && gridConfig && onGridCellClick) {
        const cellWidth = gridConfig.width / gridConfig.cols;
        const cellHeight = gridConfig.height / gridConfig.rows;
        const relX = x - gridConfig.offsetX;
        const relY = y - gridConfig.offsetY;
        const col = Math.floor(relX / cellWidth);
        const row = Math.floor(relY / cellHeight);
        
        if (row >= 0 && row < gridConfig.rows && col >= 0 && col < gridConfig.cols) {
          const cellCenterX = gridConfig.offsetX + (col + 0.5) * cellWidth;
          const cellCenterY = gridConfig.offsetY + (row + 0.5) * cellHeight;
          
          // Check if cell center is inside boundary
          if (gridConfig.boundary && isPointInBoundary(cellCenterX, cellCenterY, { points: gridConfig.boundary })) {
            onGridCellClick({ row, col, centerX: cellCenterX, centerY: cellCenterY });
            return; // Don't start panning if we clicked a cell
          }
        }
      }
      
      // If no grid cell was clicked, start panning (allow at any zoom level)
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewState.panX, y: e.clientY - viewState.panY });
    }
  };

  // Handle mouse move
  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom;

    if (draggingLandmark) {
      if (typeof draggingLandmark === 'string' && draggingLandmark.startsWith('ledWall-')) {
        // Dragging an LED wall
        const ledWallId = parseInt(draggingLandmark.replace('ledWall-', ''));
        
        if (dragStart && dragStart.wallPoints) {
          const deltaX = x - dragStart.x;
          const deltaY = y - dragStart.y;
          
          // Update all points by the delta from start position
          const updatedWalls = ledWalls.map(w => {
            if (w.id === ledWallId) {
              return {
                ...w,
                points: dragStart.wallPoints.map(p => ({
                  x: p.x + deltaX,
                  y: p.y + deltaY
                }))
              };
            }
            return w;
          });
          onLedWallsChange?.(updatedWalls);
        }
      } else {
        // Dragging a regular landmark
        const updatedLandmarks = landmarks.map(landmark =>
          landmark.id === draggingLandmark
            ? { ...landmark, x, y }
            : landmark
        );
        onLandmarksChange(updatedLandmarks);
      }
    } else if (isPanning && containerRef.current && imageObj) {
      const container = containerRef.current;
      const minZoom = Math.min(
        container.clientWidth / imageObj.width,
        container.clientHeight / imageObj.height
      );
      
      let newPanX = e.clientX - panStart.x;
      let newPanY = e.clientY - panStart.y;
      
      const scaledWidth = imageObj.width * viewState.zoom;
      const scaledHeight = imageObj.height * viewState.zoom;
      
      // Constrain panning based on image size
      if (scaledWidth > container.clientWidth) {
        // Image wider than container - don't allow edges to come inside
        const minPanX = container.clientWidth - scaledWidth;
        const maxPanX = 0;
        newPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));
      } else if (viewState.zoom <= minZoom) {
        // Image narrower than container at min zoom - center it
        const maxPanX = 0;
        const minPanX = container.clientWidth - scaledWidth;
        newPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));
      }
      
      if (scaledHeight > container.clientHeight) {
        // Image taller than container - don't allow edges to come inside
        const minPanY = container.clientHeight - scaledHeight;
        const maxPanY = 0;
        newPanY = Math.max(minPanY, Math.min(maxPanY, newPanY));
      } else if (viewState.zoom <= minZoom) {
        // Image shorter than container at min zoom - center it
        const maxPanY = 0;
        const minPanY = container.clientHeight - scaledHeight;
        newPanY = Math.max(minPanY, Math.min(maxPanY, newPanY));
      }
      
      setViewState(prev => ({
        ...prev,
        panX: newPanX,
        panY: newPanY
      }));
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    if (draggingLandmark) {
      logger.info('FloorPlanCanvas', 'Stopped dragging landmark:', draggingLandmark);
      setDraggingLandmark(null);
      setDragStart(null);
    }
    setIsPanning(false);
  };

  // Handle double click - delete landmark
  const handleDoubleClick = (e) => {
    if (testingMode) return;
    
    // Complete LED wall drawing on double click
    if (ledWallMode && ledWallDrawingPath.length > 1) {
      const newLedWall = {
        id: Date.now(),
        type: 'ledWall',
        points: [...ledWallDrawingPath],
        color: ledWallColor
      };
      onLedWallsChange?.([...ledWalls, newLedWall]);
      setLedWallDrawingPath([]);
      onLedWallModeChange?.(false);
      logger.info('FloorPlanCanvas', 'LED wall completed on double-click', newLedWall);
      return;
    }
    
    if (drawBoundaryMode) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom;

    const clickedLandmark = landmarks.find(landmark => {
      const dx = x - landmark.x;
      const dy = y - landmark.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < 30 / viewState.zoom;
    });

    if (clickedLandmark) {
      onDeleteLandmark?.(clickedLandmark.id);
      logger.info('FloorPlanCanvas', 'Deleted landmark:', clickedLandmark.id);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    
    if (drawBoundaryMode || ledWallMode) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom;

    // In test mode, only show menu for grid cells
    if (testingMode) {
      if (showGrid && gridConfig) {
        const cellWidth = gridConfig.width / gridConfig.cols;
        const cellHeight = gridConfig.height / gridConfig.rows;
        const relX = x - gridConfig.offsetX;
        const relY = y - gridConfig.offsetY;
        const col = Math.floor(relX / cellWidth);
        const row = Math.floor(relY / cellHeight);
        
        if (row >= 0 && row < gridConfig.rows && col >= 0 && col < gridConfig.cols) {
          const cellCenterX = gridConfig.offsetX + (col + 0.5) * cellWidth;
          const cellCenterY = gridConfig.offsetY + (row + 0.5) * cellHeight;
          
          onContextMenuChange?.({
            x: e.clientX,
            y: e.clientY,
            item: { row, col, centerX: cellCenterX, centerY: cellCenterY },
            itemType: 'gridCell',
            canvasX: x,
            canvasY: y
          });
        }
      }
      return;
    }

    // Edit mode - check for landmarks, LED walls, boundaries

    // Check for landmark
    const clickedLandmark = landmarks.find(landmark => {
      const dx = x - landmark.x;
      const dy = y - landmark.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < 30 / viewState.zoom;
    });

    if (clickedLandmark) {
      onContextMenuChange?.({
        x: e.clientX,
        y: e.clientY,
        item: clickedLandmark,
        itemType: 'landmark',
        canvasX: x,
        canvasY: y
      });
      return;
    }

    // Check for LED wall
    const clickedLedWall = ledWalls.find(wall => {
      return wall.points && wall.points.some(point => {
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 20 / viewState.zoom;
      });
    });

    if (clickedLedWall) {
      onContextMenuChange?.({
        x: e.clientX,
        y: e.clientY,
        item: clickedLedWall,
        itemType: 'ledWall',
        canvasX: x,
        canvasY: y
      });
      return;
    }

    // Check for boundary
    let foundBoundary = false;
    boundaries.forEach((boundary, index) => {
      if (foundBoundary || !boundary.points || boundary.points.length < 2) return;
      
      // Check if click is near any segment of the boundary
      for (let i = 0; i < boundary.points.length; i++) {
        const p1 = boundary.points[i];
        const p2 = boundary.points[(i + 1) % boundary.points.length];
        
        // Calculate distance from point to line segment
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length > 0) {
          const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (length * length)));
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          const distance = Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
          
          if (distance < 10 / viewState.zoom) {
            onContextMenuChange?.({
              x: e.clientX,
              y: e.clientY,
              item: { ...boundary, index },
              itemType: 'boundary',
              canvasX: x,
              canvasY: y
            });
            foundBoundary = true;
            return;
          }
        }
      }
    });

    // If nothing was clicked, show paste-only menu if clipboard has content
    if (!foundBoundary && clipboard) {
      onContextMenuChange?.({
        x: e.clientX,
        y: e.clientY,
        item: null,
        itemType: 'empty',
        canvasX: x,
        canvasY: y
      });
    }
  };

  // Complete boundary drawing
  const completeBoundary = (type) => {
    if (drawingPath.length < 3) {
      logger.warn('FloorPlanCanvas', 'Need at least 3 points for boundary');
      return;
    }

    // Preserve current viewState
    const currentViewState = { ...viewState };

    const newBoundary = {
      id: Date.now(),
      type,
      color: boundaryStrokeColor,
      points: [...drawingPath]
    };

    onBoundariesChange([...boundaries, newBoundary]);
    setDrawingPath([]);
    setDrawMode(null);
    
    // Restore viewState after state updates complete
    requestAnimationFrame(() => {
      setViewState(currentViewState);
    });
    
    logger.info('FloorPlanCanvas', 'Boundary created:', type, drawingPath.length + ' points');
  };

  // Close stroke - connect last to first and complete
  const closeStroke = () => {
    if (drawBoundaryMode && drawingPath.length >= 2) {
      const newBoundary = {
        id: Date.now(),
        type: 'boundary',
        color: boundaryStrokeColor,
        points: [...drawingPath]
      };
      
      onBoundariesChange([...boundaries, newBoundary]);
      setDrawingPath([]);
      onDrawBoundaryModeChange?.(false);
      
      // Auto-generate grid after closing boundary
      // Pass the boundary directly to avoid async state issues
      setTimeout(() => {
        onGenerateGrid?.(newBoundary);
      }, 100);
      
      logger.info('FloorPlanCanvas', 'Boundary closed with', drawingPath.length, 'points');
    }
  };

  // Undo last point
  const undoLastPoint = () => {
    if (drawingPath.length > 0) {
      setDrawingPath(prev => prev.slice(0, -1));
      logger.info('FloorPlanCanvas', 'Undid last boundary point');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Undo last point in boundary mode
      if (drawBoundaryMode && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastPoint();
      }
      // Clear drawing path on Escape in boundary mode
      if (drawBoundaryMode && e.key === 'Escape') {
        e.preventDefault();
        setDrawingPath([]);
      }
      // Undo last point in LED wall mode
      if (ledWallMode && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (ledWallDrawingPath.length > 0) {
          setLedWallDrawingPath(prev => prev.slice(0, -1));
          logger.info('FloorPlanCanvas', 'Undid last LED wall point');
        }
      }
      // Clear LED wall drawing path on Escape
      if (ledWallMode && e.key === 'Escape') {
        e.preventDefault();
        setLedWallDrawingPath([]);
        onLedWallModeChange?.(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawBoundaryMode, ledWallMode, drawingPath, ledWallDrawingPath]);

  // Cancel drawing
  const cancelDrawing = () => {
    setDrawingPath([]);
    setDrawMode(null);
  };

  // Zoom controls
  const zoomIn = () => {
    if (!containerRef.current || !imageObj) return;
    
    const container = containerRef.current;
    const zoomFactor = 1.2;
    
    // Determine zoom center point
    let centerX, centerY;
    if (selectedGridCell && gridConfig) {
      // Zoom around selected cell center
      centerX = selectedGridCell.centerX;
      centerY = selectedGridCell.centerY;
    } else {
      // Zoom around canvas center
      centerX = imageObj.width / 2;
      centerY = imageObj.height / 2;
    }
    
    setViewState(prev => {
      const newZoom = Math.min(5, prev.zoom * zoomFactor);
      // Adjust pan to keep center point in same screen position
      const dx = centerX * (newZoom - prev.zoom);
      const dy = centerY * (newZoom - prev.zoom);
      return {
        zoom: newZoom,
        panX: prev.panX - dx,
        panY: prev.panY - dy
      };
    });
  };

  const zoomOut = () => {
    if (!containerRef.current || !imageObj) return;
    
    const container = containerRef.current;
    const zoomFactor = 1.2;
    const minZoom = Math.min(
      container.clientWidth / imageObj.width,
      container.clientHeight / imageObj.height
    );
    
    // Determine zoom center point
    let centerX, centerY;
    if (selectedGridCell && gridConfig) {
      // Zoom around selected cell center
      centerX = selectedGridCell.centerX;
      centerY = selectedGridCell.centerY;
    } else {
      // Zoom around canvas center
      centerX = imageObj.width / 2;
      centerY = imageObj.height / 2;
    }
    
    setViewState(prev => {
      const newZoom = Math.max(minZoom, prev.zoom / zoomFactor);
      // Adjust pan to keep center point in same screen position
      const dx = centerX * (newZoom - prev.zoom);
      const dy = centerY * (newZoom - prev.zoom);
      return {
        zoom: newZoom,
        panX: prev.panX - dx,
        panY: prev.panY - dy
      };
    });
  };

  // Fit to view - optimally fit to height or width
  const fitToView = () => {
    if (containerRef.current && imageObj) {
      const container = containerRef.current;
      const fitZoom = Math.min(
        container.clientWidth / imageObj.width,
        container.clientHeight / imageObj.height
      );
      const scaledWidth = imageObj.width * fitZoom;
      const scaledHeight = imageObj.height * fitZoom;
      setViewState({
        zoom: fitZoom,
        panX: (container.clientWidth - scaledWidth) / 2,
        panY: (container.clientHeight - scaledHeight) / 2
      });
      logger.info('FloorPlanCanvas', 'Fit to view', fitZoom);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#0a0e14',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          cursor: (drawBoundaryMode || ledWallMode) ? 'crosshair' : (isPanning ? 'grabbing' : 'grab')
        }}
      >
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{ 
            display: 'block',
            cursor: (drawBoundaryMode || ledWallMode) ? 'crosshair' : (isPanning ? 'grabbing' : 'grab')
          }}
        />
      </div>

      {/* Toolbar */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <button
          onClick={zoomIn}
          style={{
            padding: '10px',
            backgroundColor: '#1a2332',
            border: '1px solid #2d3748',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ZoomIn size={20} color="#06b6d4" />
        </button>
        <button
          onClick={zoomOut}
          style={{
            padding: '10px',
            backgroundColor: '#1a2332',
            border: '1px solid #2d3748',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ZoomOut size={20} color="#06b6d4" />
        </button>
        <button
          onClick={fitToView}
          title="Fit to View"
          style={{
            padding: '10px',
            backgroundColor: '#1a2332',
            border: '1px solid #2d3748',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Maximize2 size={20} color="#06b6d4" />
        </button>
      </div>

      {/* Zoom level indicator */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        padding: '6px 12px',
        backgroundColor: '#1a2332',
        border: '1px solid #2d3748',
        borderRadius: '6px',
        color: '#6b7785',
        fontSize: '12px',
        fontWeight: '600'
      }}>
        {Math.round(viewState.zoom * 100)}%
      </div>

      {/* Left Toolbar - Drawing & Grid Controls */}
      {!testingMode && (
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: '#1a2332',
        border: '2px solid #2d3748',
        borderRadius: '8px',
        padding: '6px'
      }}>
        <input
          type="color"
          value={drawBoundaryMode ? boundaryStrokeColor : ledWallColor}
          onChange={(e) => drawBoundaryMode ? onBoundaryColorChange?.(e.target.value) : onLedWallColorChange?.(e.target.value)}
          disabled={!drawBoundaryMode && !ledWallMode}
          title="Stroke Color"
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '4px',
            cursor: drawBoundaryMode || ledWallMode ? 'pointer' : 'not-allowed',
            opacity: drawBoundaryMode || ledWallMode ? 1 : 0.4
          }}
        />
        <button
          onClick={undoLastPoint}
          disabled={!drawBoundaryMode && !ledWallMode}
          title="Undo Last Point (Ctrl+Z)"
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: (!drawBoundaryMode && !ledWallMode) ? 'not-allowed' : 'pointer',
            opacity: (!drawBoundaryMode && !ledWallMode) ? 0.4 : 1
          }}
        >
          <Undo size={18} color={(!drawBoundaryMode && !ledWallMode) ? '#6b7785' : '#f59e0b'} />
        </button>
        <button
          disabled={true}
          title="Redo (Not available)"
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'not-allowed',
            opacity: 0.4
          }}
        >
          <Redo size={18} color="#6b7785" />
        </button>
        <button
          onClick={closeStroke}
          disabled={!drawBoundaryMode || drawingPath.length < 2}
          title="Close Stroke"
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: (!drawBoundaryMode || drawingPath.length < 2) ? 'not-allowed' : 'pointer',
            opacity: (!drawBoundaryMode || drawingPath.length < 2) ? 0.4 : 1
          }}
        >
          <XCircle size={18} color={(!drawBoundaryMode || drawingPath.length < 2) ? '#6b7785' : '#22c55e'} />
        </button>
        <div style={{ height: '1px', backgroundColor: '#2d3748', margin: '2px 0' }} />
        <button
          onClick={() => {
            onGridRowsChange?.(gridRows + 1);
            // Regenerate grid after state update
            setTimeout(() => onGenerateGrid?.(), 50);
          }}
          title={`Grid Rows: ${gridRows} (Increase)`}
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          <ChevronUp size={18} color="#06b6d4" />
        </button>
        <button
          onClick={() => {
            onGridRowsChange?.(Math.max(1, gridRows - 1));
            // Regenerate grid after state update
            setTimeout(() => onGenerateGrid?.(), 50);
          }}
          disabled={gridRows <= 1}
          title={`Grid Rows: ${gridRows} (Decrease)`}
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: gridRows <= 1 ? 'not-allowed' : 'pointer',
            opacity: gridRows <= 1 ? 0.4 : 1
          }}
        >
          <ChevronDown size={18} color="#06b6d4" />
        </button>
        <button
          onClick={() => {
            onGridColsChange?.(gridCols + 1);
            // Regenerate grid after state update
            setTimeout(() => onGenerateGrid?.(), 50);
          }}
          title={`Grid Columns: ${gridCols} (Increase)`}
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          <ChevronUp size={18} color="#06b6d4" style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button
          onClick={() => {
            onGridColsChange?.(Math.max(1, gridCols - 1));
            // Regenerate grid after state update
            setTimeout(() => onGenerateGrid?.(), 50);
          }}
          disabled={gridCols <= 1}
          title={`Grid Columns: ${gridCols} (Decrease)`}
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: gridCols <= 1 ? 'not-allowed' : 'pointer',
            opacity: gridCols <= 1 ? 0.4 : 1
          }}
        >
          <ChevronDown size={18} color="#06b6d4" style={{ transform: 'rotate(90deg)' }} />
        </button>
        <div style={{ height: '1px', backgroundColor: '#2d3748', margin: '2px 0' }} />
        <button
          onClick={() => {
            if (ledWallMode && ledWallDrawingPath.length > 1) {
              // Convert LED wall drawing to a draggable object
              const newLedWall = {
                id: Date.now(),
                type: 'ledWall',
                points: [...ledWallDrawingPath],
                color: ledWallColor
              };
              onLedWallsChange?.([...ledWalls, newLedWall]);
              setLedWallDrawingPath([]);
              onLedWallModeChange?.(false);
              logger.info('FloorPlanCanvas', 'Finished LED wall drawing', newLedWall);
            } else if (drawBoundaryMode) {
              onDrawBoundaryModeChange?.(false);
              setDrawingPath([]);
            }
          }}
          disabled={(!drawBoundaryMode && !ledWallMode)}
          title="Finish Drawing"
          style={{
            padding: '6px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: (!drawBoundaryMode && !ledWallMode) ? 'not-allowed' : 'pointer',
            opacity: (!drawBoundaryMode && !ledWallMode) ? 0.4 : 1
          }}
        >
          <CheckCircle size={18} color={(!drawBoundaryMode && !ledWallMode) ? '#6b7785' : '#22c55e'} />
        </button>
      </div>
      )}

      {/* Bottom Toolbar - Landmark Tools */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '8px',
        backgroundColor: '#1a2332',
        border: '2px solid #2d3748',
        borderRadius: '8px',
        padding: '8px 12px'
      }}>
        {testingMode ? (
          // Testing mode tools
          <>
            <button
              onClick={async () => {
                if (!selectedGridCell) {
                  logger.warn('FloorPlanCanvas', 'No cell selected for reading');
                  return;
                }
                if (!onTakeReading) {
                  logger.error('FloorPlanCanvas', 'onTakeReading callback not provided');
                  return;
                }
                if (!spectrumData || spectrumData.length === 0) {
                  logger.warn('FloorPlanCanvas', 'No spectrum data available');
                  return;
                }
                
                // Start sampling process
                setIsCapturingSamples(true);
                setSamplingProgress(0);
                logger.info('FloorPlanCanvas', 'Starting 5-sample reading for cell', { 
                  row: selectedGridCell.row, 
                  col: selectedGridCell.col 
                });
                
                const samples = [];
                
                // Collect 5 samples at 1-second intervals
                for (let i = 0; i < 5; i++) {
                  // Capture current spectrum data
                  if (spectrumData && spectrumData.length > 0) {
                    samples.push([...spectrumData]);
                  }
                  setSamplingProgress(i + 1);
                  
                  // Wait 1 second before next sample (except after last sample)
                  if (i < 4) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
                
                // Average the samples
                if (samples.length > 0) {
                  const dataPointCount = samples[0].length;
                  const averagedData = [];
                  
                  // For each data point position, average across all samples
                  for (let i = 0; i < dataPointCount; i++) {
                    let sum = 0;
                    for (let j = 0; j < samples.length; j++) {
                      sum += samples[j][i];
                    }
                    averagedData.push(sum / samples.length);
                  }
                  
                  logger.info('FloorPlanCanvas', 'Completed averaging', { 
                    samplesCollected: samples.length,
                    dataPoints: averagedData.length 
                  });
                  
                  onTakeReading(selectedGridCell.row, selectedGridCell.col, averagedData);
                }
                
                setIsCapturingSamples(false);
                setSamplingProgress(0);
              }}
              disabled={!selectedGridCell || !spectrumData || spectrumData.length === 0 || isCapturingSamples}
              title={
                isCapturingSamples 
                  ? `Capturing sample ${samplingProgress}/5...`
                  : !selectedGridCell 
                    ? "Select a grid cell first" 
                    : (!spectrumData || spectrumData.length === 0) 
                      ? "No spectrum data available" 
                      : "Take 5 averaged readings (5 seconds)"
              }
              style={{
                padding: '8px 16px',
                backgroundColor: '#1a2332',
                border: 'none',
                borderRadius: '4px',
                cursor: (!selectedGridCell || !spectrumData || spectrumData.length === 0 || isCapturingSamples) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#e6edf3',
                fontSize: '13px',
                fontWeight: '600',
                opacity: (!selectedGridCell || !spectrumData || spectrumData.length === 0 || isCapturingSamples) ? 0.5 : 1
              }}
            >
              <Activity size={18} color={(!selectedGridCell || !spectrumData || spectrumData.length === 0) ? '#6b7785' : isCapturingSamples ? '#f59e0b' : '#22c55e'} />
              {isCapturingSamples ? `Sampling ${samplingProgress}/5...` : 'Take a Reading'}
            </button>
            <button
              onClick={() => {
                if (!selectedGridCell) {
                  logger.warn('FloorPlanCanvas', 'No cell selected for deletion');
                  return;
                }
                if (!onClearCellMeasurement) {
                  logger.error('FloorPlanCanvas', 'onClearCellMeasurement callback not provided');
                  return;
                }
                logger.info('FloorPlanCanvas', 'Deleting reading for cell', { row: selectedGridCell.row, col: selectedGridCell.col });
                onClearCellMeasurement(selectedGridCell.row, selectedGridCell.col);
              }}
              disabled={!selectedGridCell}
              title={!selectedGridCell ? "Select a grid cell first" : "Delete Reading"}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1a2332',
                border: 'none',
                borderRadius: '4px',
                cursor: !selectedGridCell ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#e6edf3',
                fontSize: '13px',
                fontWeight: '600',
                opacity: !selectedGridCell ? 0.5 : 1
              }}
            >
              <Trash2 size={18} color={!selectedGridCell ? '#6b7785' : '#ef4444'} />
              Delete Reading
            </button>
          </>
        ) : (
          // Drawing mode tools
          <>
        <button
          onClick={() => {
            onDrawBoundaryModeChange?.(!drawBoundaryMode);
            if (ledWallMode) onLedWallModeChange?.(false);
          }}
          title="Draw Boundary"
          style={{
            padding: '8px 16px',
            backgroundColor: drawBoundaryMode ? '#06b6d4' : '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#e6edf3',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          <Square size={18} color={drawBoundaryMode ? '#fff' : '#06b6d4'} />
          Boundary {drawBoundaryMode && '(Drawing...)'}
        </button>
        <button
          onClick={() => {
            if (imageObj) {
              onAddWifiAP?.({ x: imageObj.width / 2, y: imageObj.height / 2 });
            }
          }}
          title="Add WiFi AP at Center"
          style={{
            padding: '8px 16px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#e6edf3',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          <Wifi size={18} color="#3b82f6" />
          WiFi AP
        </button>
        <button
          onClick={() => {
            if (imageObj) {
              onAddCommsRx?.({ x: imageObj.width / 2, y: imageObj.height / 2 });
            }
          }}
          title="Add Comms Rx at Center"
          style={{
            padding: '8px 16px',
            backgroundColor: '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#e6edf3',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          <Radio size={18} color="#22c55e" />
          Comms Rx
        </button>
        <button
          onClick={() => {
            onLedWallModeChange?.(!ledWallMode);
            if (drawBoundaryMode) onDrawBoundaryModeChange?.(false);
          }}
          title="Draw LED Wall"
          style={{
            padding: '8px 16px',
            backgroundColor: ledWallMode ? '#ef4444' : '#1a2332',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#e6edf3',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          <Tv size={18} color={ledWallMode ? '#fff' : '#ef4444'} />
          LED Wall {ledWallMode && '(Drawing...)'}
        </button>
        </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: '#1a2332',
            border: '2px solid #2d3748',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            minWidth: '150px'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Test mode - grid cell menu */}
          {contextMenu.itemType === 'gridCell' && (
            <>
              <button
                onClick={() => {
                  onGridCellClick?.(contextMenu.item);
                  onContextMenuChange?.(null);
                  // Trigger test for this cell
                  logger.info('FloorPlanCanvas', 'Run test for cell:', contextMenu.item);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#22c55e',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <Activity size={16} />
                Run Test
              </button>
              <button
                onClick={() => {
                  // Mark cell as skipped
                  const cellKey = `${contextMenu.item.row}-${contextMenu.item.col}`;
                  onGridCellClick?.({ 
                    ...contextMenu.item, 
                    skipCell: true 
                  });
                  onContextMenuChange?.(null);
                  logger.info('FloorPlanCanvas', 'Skip region:', contextMenu.item);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#f59e0b',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <XCircle size={16} />
                Skip Region
              </button>
              <button
                onClick={() => {
                  onClearCellMeasurement?.(contextMenu.item.row, contextMenu.item.col);
                  onContextMenuChange?.(null);
                  logger.info('FloorPlanCanvas', 'Clear result for cell:', contextMenu.item);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <Trash2 size={16} />
                Clear Result
              </button>
            </>
          )}
          
          {/* Edit mode - object menu */}
          {contextMenu.itemType !== 'gridCell' && (
            <>
          {/* Copy - only for landmarks and LED walls */}
          {(contextMenu.itemType === 'landmark' || contextMenu.itemType === 'ledWall') && (
            <button
              onClick={() => {
                onCopyItem?.(contextMenu.item);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: '#e6edf3',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'left',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              <Copy size={16} />
              Copy
            </button>
          )}
          
          {/* Paste - available anywhere if clipboard has content */}
          {clipboard && (
            <button
              onClick={() => {
                // Update clipboard item position to where user right-clicked
                const updatedClipboard = {
                  ...clipboard,
                  x: contextMenu.canvasX,
                  y: contextMenu.canvasY
                };
                const newItem = {
                  ...updatedClipboard,
                  id: Date.now()
                };
                
                if (updatedClipboard.type === 'ledWall') {
                  onLedWallsChange?.([...ledWalls, newItem]);
                } else {
                  onLandmarksChange?.([...landmarks, newItem]);
                }
                onContextMenuChange?.(null);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: '#e6edf3',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'left',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              <Clipboard size={16} />
              Paste
            </button>
          )}
          
          {/* Delete - only for items that exist (landmarks, LED walls, boundaries) */}
          {contextMenu.itemType !== 'empty' && (
            <button
              onClick={() => {
                if (contextMenu.itemType === 'landmark') {
                  onDeleteLandmark?.(contextMenu.item.id);
                } else if (contextMenu.itemType === 'ledWall') {
                  onDeleteLedWall?.(contextMenu.item.id);
                } else if (contextMenu.itemType === 'boundary') {
                  onDeleteBoundaryByIndex?.(contextMenu.item.index);
                }
                onContextMenuChange?.(null);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: '#ef4444',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'left',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#2d3748'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
