import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Move, Square, Circle, Wifi, Radio, Monitor } from 'lucide-react';
import { logger } from '../../logger';

export default function FloorPlanCanvas({ 
  floorPlanImage, 
  gridConfig,
  onGridGenerated,
  landmarks = [],
  onLandmarksChange,
  boundaries = [],
  onBoundariesChange,
  showGrid = false,
  gridMeasurements = {},
  selectedGridCell = null,
  onGridCellClick
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
  const [drawMode, setDrawMode] = useState(null); // 'boundary', 'led-wall', 'wifi', 'antenna'
  const [drawingPath, setDrawingPath] = useState([]);
  const [imageObj, setImageObj] = useState(null);

  // Load floor plan image
  useEffect(() => {
    if (!floorPlanImage) return;
    
    const img = new Image();
    img.onload = () => {
      setImageObj(img);
      logger.info('FloorPlanCanvas', 'Image loaded', img.width + 'x' + img.height);
      // Center the image
      if (containerRef.current) {
        const container = containerRef.current;
        setViewState({
          zoom: Math.min(
            container.clientWidth / img.width,
            container.clientHeight / img.height,
            1
          ),
          panX: (container.clientWidth - img.width) / 2,
          panY: (container.clientHeight - img.height) / 2
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

    // Draw current drawing path
    if (drawingPath.length > 0) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
      drawingPath.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Restore context
    ctx.restore();
  }, [imageObj, viewState, showGrid, gridConfig, landmarks, boundaries, drawingPath]);

  // Redraw when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Draw grid
  const drawGrid = (ctx, width, height, config) => {
    const { rows, cols } = config;
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 1 / viewState.zoom;

    for (let row = 0; row <= rows; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * cellHeight);
      ctx.lineTo(width, row * cellHeight);
      ctx.stroke();
    }

    for (let col = 0; col <= cols; col++) {
      ctx.beginPath();
      ctx.moveTo(col * cellWidth, 0);
      ctx.lineTo(col * cellWidth, height);
      ctx.stroke();
    }

    // Draw cell labels and measurement status
    ctx.font = `${14 / viewState.zoom}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellKey = `${row}-${col}`;
        const centerX = (col + 0.5) * cellWidth;
        const centerY = (row + 0.5) * cellHeight;
        
        // Highlight if selected
        if (selectedGridCell && selectedGridCell.row === row && selectedGridCell.col === col) {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }

        // Color based on measurement status
        const measurement = gridMeasurements[cellKey];
        if (measurement) {
          // Cell has measurement - color code by signal quality
          const avgSignal = (measurement.band1?.average + measurement.band2?.average) / 2;
          let color;
          if (avgSignal < -70) color = 'rgba(34, 197, 94, 0.3)'; // Green - excellent
          else if (avgSignal < -60) color = 'rgba(234, 179, 8, 0.3)'; // Yellow - acceptable
          else if (avgSignal < -50) color = 'rgba(245, 158, 11, 0.3)'; // Orange - caution
          else color = 'rgba(239, 68, 68, 0.3)'; // Red - interference
          
          ctx.fillStyle = color;
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }

        // Draw cell number
        ctx.fillStyle = measurement ? '#e6edf3' : '#6b7785';
        ctx.fillText(`${row * cols + col + 1}`, centerX, centerY);
      }
    }
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

    ctx.strokeStyle = boundary.type === 'transmit' ? '#22c55e' : '#06b6d4';
    ctx.fillStyle = boundary.type === 'transmit' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 3 / viewState.zoom;

    ctx.beginPath();
    ctx.moveTo(boundary.points[0].x, boundary.points[0].y);
    boundary.points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, viewState.zoom * delta));
    
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
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.panY) / viewState.zoom;

    if (drawMode) {
      // Add point to drawing path
      setDrawingPath(prev => [...prev, { x, y }]);
    } else if (showGrid && gridConfig && onGridCellClick) {
      // Check if clicking on grid cell
      const cellWidth = imageObj.width / gridConfig.cols;
      const cellHeight = imageObj.height / gridConfig.rows;
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      
      if (row >= 0 && row < gridConfig.rows && col >= 0 && col < gridConfig.cols) {
        onGridCellClick({ row, col });
      }
    } else {
      // Start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewState.panX, y: e.clientY - viewState.panY });
    }
  };

  // Handle mouse move
  const handleMouseMove = (e) => {
    if (isPanning) {
      setViewState(prev => ({
        ...prev,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y
      }));
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Complete boundary drawing
  const completeBoundary = (type) => {
    if (drawingPath.length < 3) {
      logger.warn('FloorPlanCanvas', 'Need at least 3 points for boundary');
      return;
    }

    const newBoundary = {
      id: Date.now(),
      type,
      points: [...drawingPath]
    };

    onBoundariesChange([...boundaries, newBoundary]);
    setDrawingPath([]);
    setDrawMode(null);
    logger.info('FloorPlanCanvas', 'Boundary created:', type, drawingPath.length + ' points');
  };

  // Cancel drawing
  const cancelDrawing = () => {
    setDrawingPath([]);
    setDrawMode(null);
  };

  // Zoom controls
  const zoomIn = () => {
    setViewState(prev => ({
      ...prev,
      zoom: Math.min(5, prev.zoom * 1.2)
    }));
  };

  const zoomOut = () => {
    setViewState(prev => ({
      ...prev,
      zoom: Math.max(0.1, prev.zoom / 1.2)
    }));
  };

  // Reset view
  const resetView = () => {
    if (containerRef.current && imageObj) {
      const container = containerRef.current;
      setViewState({
        zoom: Math.min(
          container.clientWidth / imageObj.width,
          container.clientHeight / imageObj.height,
          1
        ),
        panX: (container.clientWidth - imageObj.width) / 2,
        panY: (container.clientHeight - imageObj.height) / 2
      });
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
          cursor: drawMode ? 'crosshair' : (isPanning ? 'grabbing' : 'grab')
        }}
      >
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ display: 'block' }}
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
          onClick={resetView}
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
          <Move size={20} color="#06b6d4" />
        </button>
      </div>

      {/* Drawing Mode Indicator */}
      {drawMode && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '12px 16px',
          backgroundColor: '#1a2332',
          border: '2px solid #06b6d4',
          borderRadius: '8px',
          color: '#e6edf3',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          <div>Click to add points • {drawingPath.length} points</div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => completeBoundary(drawMode)}
              disabled={drawingPath.length < 3}
              style={{
                padding: '6px 12px',
                backgroundColor: drawingPath.length < 3 ? '#2d3748' : '#22c55e',
                border: 'none',
                borderRadius: '4px',
                color: drawingPath.length < 3 ? '#6b7785' : '#0a0e14',
                fontSize: '12px',
                fontWeight: '600',
                cursor: drawingPath.length < 3 ? 'not-allowed' : 'pointer'
              }}
            >
              Complete
            </button>
            <button
              onClick={cancelDrawing}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
