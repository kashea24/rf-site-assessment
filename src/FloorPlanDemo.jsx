import { useState, useCallback } from 'react';
import FloorPlanUpload from './components/FloorPlan/FloorPlanUpload';
import FloorPlanCanvas from './components/FloorPlan/FloorPlanCanvas';
import LiveMonitor from './components/FloorPlan/LiveMonitor';
import { generateGrid, calculateProgress } from './utils/floorPlanHelpers';
import { Usb, Trash2, Activity, MapPin } from 'lucide-react';
import { logger } from './logger';

function FloorPlanDemo() {
  const [floorPlan, setFloorPlan] = useState(null);
  const [gridConfig, setGridConfig] = useState(null);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [showGrid, setShowGrid] = useState(false);
  const [landmarks, setLandmarks] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [ledWalls, setLedWalls] = useState([]);
  const [gridMeasurements, setGridMeasurements] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentReading, setCurrentReading] = useState(null);
  const [drawBoundaryMode, setDrawBoundaryMode] = useState(false);
  const [boundaryStrokeColor, setBoundaryStrokeColor] = useState('#ef4444'); // Red
  const [ledWallMode, setLedWallMode] = useState(false);
  const [ledWallColor, setLedWallColor] = useState('#22c55e'); // Green
  const [isConnected, setIsConnected] = useState(false);
  const [testingMode, setTestingMode] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);

  const handleFloorPlanUpload = (uploadedFloorPlan) => {
    console.log('📝 Floor plan uploaded:', {
      width: uploadedFloorPlan.width,
      height: uploadedFloorPlan.height,
      name: uploadedFloorPlan.name,
      size: uploadedFloorPlan.size
    });
    setFloorPlan(uploadedFloorPlan);
    logger.info('FloorPlanDemo', 'Floor plan uploaded', {
      name: uploadedFloorPlan.name,
      dimensions: `${uploadedFloorPlan.width}x${uploadedFloorPlan.height}`
    });
  };

  const handleGenerateGrid = (providedBoundary = null) => {
    console.log('🔧 handleGenerateGrid called');
    console.log('  - floorPlan exists:', !!floorPlan);
    console.log('  - boundaries.length:', boundaries.length);
    console.log('  - boundaries:', boundaries);
    console.log('  - providedBoundary:', providedBoundary);
    
    // Use provided boundary or get from state
    const boundaryToUse = providedBoundary || (boundaries.length > 0 ? boundaries[0] : null);
    
    if (!floorPlan || !boundaryToUse) {
      console.log('  ❌ Early return: missing floorPlan or boundary');
      return;
    }
    
    setSelectedCell(null);
    
    const img = new Image();
    img.onload = () => {
      // Calculate boundary bounding box
      const boundary = boundaryToUse;
      console.log('  - boundary:', boundary);
      
      if (!boundary.points || boundary.points.length === 0) {
        console.log('  ❌ No boundary points');
        return;
      }
      
      console.log('  - boundary.points.length:', boundary.points.length);
      
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      boundary.points.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
      
      const boundaryWidth = maxX - minX;
      const boundaryHeight = maxY - minY;
      const boundaryCenterX = (minX + maxX) / 2;
      const boundaryCenterY = (minY + maxY) / 2;
      
      console.log('  - Boundary bounds:', { minX, maxX, minY, maxY, boundaryWidth, boundaryHeight });
      
      const grid = {
        rows: gridRows,
        cols: gridCols,
        width: boundaryWidth,
        height: boundaryHeight,
        centerX: boundaryCenterX,
        centerY: boundaryCenterY,
        offsetX: minX,
        offsetY: minY,
        boundary: boundary.points
      };
      
      console.log('  ✅ Setting gridConfig:', grid);
      setGridConfig(grid);
      setShowGrid(true);
      logger.info('FloorPlanDemo', 'Grid generated:', gridRows + 'x' + gridCols, 'Boundary bounds:', { minX, maxX, minY, maxY });
    };
    img.src = floorPlan.image;
  };

  const handleDeleteGrid = () => {
    console.log('🗑️ Deleting grid and all measurements');
    setGridConfig(null);
    setShowGrid(false);
    setSelectedCell(null);
    setGridMeasurements({});
    logger.info('FloorPlanDemo', 'Grid deleted');
  };

  const handleConnectDevice = () => {
    const newState = !isConnected;
    console.log(`🔌 ${newState ? 'Connecting' : 'Disconnecting'} RF Explorer device`);
    setIsConnected(newState);
    logger.info('FloorPlanDemo', 'Device connection toggled', { connected: newState });
  };

  const handleGridCellClick = (cell) => {
    setSelectedCell(cell);
  };

  const handleTestCell = useCallback(() => {
    if (!selectedCell) return;
    
    setIsCapturing(true);
    const cellKey = `${selectedCell.row}-${selectedCell.col}`;
    
    setTimeout(() => {
      const reading = {
        peak: -50 - Math.random() * 30,
        average: -60 - Math.random() * 20,
        noiseFloor: -85 - Math.random() * 10
      };
      
      setGridMeasurements(prev => ({
        ...prev,
        [cellKey]: {
          band1: reading,
          band2: {
            peak: -48 - Math.random() * 30,
            average: -58 - Math.random() * 20,
            noiseFloor: -90 - Math.random() * 10
          }
        }
      }));
      
      setCurrentReading(reading);
      setIsCapturing(false);
      logger.info('FloorPlanDemo', 'Cell tested:', cellKey);
    }, 5000);
  }, [selectedCell]);

  const handleClearCellMeasurement = (row, col) => {
    const cellKey = `${row}-${col}`;
    const updatedMeasurements = { ...gridMeasurements };
    delete updatedMeasurements[cellKey];
    setGridMeasurements(updatedMeasurements);
    logger.info('FloorPlanDemo', 'Cleared measurement for cell:', cellKey);
  };

  const handleDeleteBoundary = () => {
    if (boundaries.length > 0) {
      setBoundaries(boundaries.slice(0, -1));
      logger.info('FloorPlanDemo', 'Deleted last boundary');
    }
  };

  const handleBoundaryColorChange = (color) => {
    setBoundaryStrokeColor(color);
  };

  const handleAddWifiAP = (centerPoint) => {
    const newLandmark = {
      id: Date.now(),
      type: 'wifi',
      x: centerPoint.x,
      y: centerPoint.y
    };
    setLandmarks([...landmarks, newLandmark]);
    logger.info('FloorPlanDemo', 'Added WiFi AP');
  };

  const handleAddCommsRx = (centerPoint) => {
    const newLandmark = {
      id: Date.now(),
      type: 'antenna',
      x: centerPoint.x,
      y: centerPoint.y
    };
    setLandmarks([...landmarks, newLandmark]);
    logger.info('FloorPlanDemo', 'Added Comms Rx');
  };

  const handleStartLedWall = () => {
    setLedWallMode(true);
    setDrawBoundaryMode(false);
    logger.info('FloorPlanDemo', 'LED wall mode activated');
  };

  const handleLedWallColorChange = (color) => {
    setLedWallColor(color);
  };

  const handleDeleteLandmark = (landmarkId) => {
    setLandmarks(landmarks.filter(l => l.id !== landmarkId));
    logger.info('FloorPlanDemo', 'Deleted landmark:', landmarkId);
  };

  const handleCopyItem = (item) => {
    setClipboard({ ...item, id: undefined });
    setContextMenu(null);
    logger.info('FloorPlanDemo', 'Copied item to clipboard:', item.type);
  };

  const handlePasteItem = (x, y) => {
    if (!clipboard) return;
    
    // If coordinates provided, use them; otherwise offset from original
    const newItem = {
      ...clipboard,
      id: Date.now(),
      x: x !== undefined ? x : clipboard.x + 20,
      y: y !== undefined ? y : clipboard.y + 20
    };
    
    if (clipboard.type === 'ledWall') {
      setLedWalls([...ledWalls, newItem]);
    } else {
      setLandmarks([...landmarks, newItem]);
    }
    setContextMenu(null);
    logger.info('FloorPlanDemo', 'Pasted item:', newItem.type);
  };

  const handleDeleteBoundaryByIndex = (index) => {
    setBoundaries(boundaries.filter((_, i) => i !== index));
    setContextMenu(null);
    logger.info('FloorPlanDemo', 'Deleted boundary at index:', index);
  };

  const handleDeleteLedWall = (ledWallId) => {
    setLedWalls(ledWalls.filter(l => l.id !== ledWallId));
    setContextMenu(null);
    logger.info('FloorPlanDemo', 'Deleted LED wall:', ledWallId);
  };

  const handleClearAllData = () => {
    if (confirm('Clear all floor plan data and reload? This will remove the uploaded PDF, grid, and measurements.')) {
      console.log('⚠️ CLEARING ALL DATA - Floor plan, grid, and measurements will be removed');
      logger.info('FloorPlanDemo', 'User confirmed: clearing all data and reloading');
      localStorage.clear();
      window.location.reload();
    } else {
      console.log('❌ User cancelled data clear operation');
      logger.info('FloorPlanDemo', 'User cancelled data clear');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0e14',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1600px',
        margin: '0 auto',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            fontSize: '32px',
            color: '#e6edf3',
            margin: '0 0 8px 0',
            fontWeight: '600'
          }}>
            Floor Plan Mapping Demo
          </h1>
          <p style={{
            fontSize: '16px',
            color: '#6b7785',
            margin: 0
          }}>
            Interactive floor plan with boundary drawing, grid generation, and landmark placement
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!testingMode && (
            <button
              onClick={() => {
                console.log('🧪 Entering testing mode');
                logger.info('FloorPlanDemo', 'Switched to testing mode');
                setTestingMode(true);
              }}
              disabled={!floorPlan || !gridConfig}
              style={{
                padding: '12px 20px',
                backgroundColor: (floorPlan && gridConfig) ? '#22c55e' : '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: (floorPlan && gridConfig) ? '#0a0e14' : '#6b7785',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (floorPlan && gridConfig) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: (floorPlan && gridConfig) ? 1 : 0.5
              }}
              title={(!floorPlan || !gridConfig) ? 'Upload floor plan and draw boundary to enable testing' : 'Switch to testing mode'}
            >
              <Activity size={18} />
              Start Testing
            </button>
          )}
          {testingMode && (
            <button
              onClick={() => {
                console.log('✏️ Returning to edit mode');
                logger.info('FloorPlanDemo', 'Switched to edit mode');
                setTestingMode(false);
              }}
              style={{
                padding: '12px 20px',
                backgroundColor: '#f59e0b',
                border: 'none',
                borderRadius: '8px',
                color: '#0a0e14',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <MapPin size={18} />
              Back to Edit
            </button>
          )}
          <button
            onClick={handleConnectDevice}
            style={{
              padding: '12px 20px',
              backgroundColor: isConnected ? '#22c55e' : '#06b6d4',
              border: 'none',
              borderRadius: '8px',
              color: isConnected ? '#0a0e14' : '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Usb size={18} />
            {isConnected ? 'Disconnect Device' : 'Connect Device'}
          </button>
          <button
            onClick={handleClearAllData}
            style={{
              padding: '12px 20px',
              backgroundColor: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Trash2 size={18} />
            Clear All Data
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1600px',
        margin: '0 auto'
      }}>
        {!floorPlan ? (
          /* Upload View */
          <div style={{
            backgroundColor: '#1a2332',
            borderRadius: '12px',
            border: '2px solid #2d3748',
            padding: '48px'
          }}>
            <FloorPlanUpload onUploadComplete={handleFloorPlanUpload} />
          </div>
        ) : (
          /* Canvas View */
          <div style={{
            backgroundColor: '#1a2332',
            borderRadius: '12px',
            border: '2px solid #2d3748',
            padding: '24px'
          }}>
            <div style={{ height: '700px' }}>
              <FloorPlanCanvas
                floorPlanImage={floorPlan.image}
                gridConfig={gridConfig}
                showGrid={showGrid}
                landmarks={landmarks}
                onLandmarksChange={setLandmarks}
                boundaries={boundaries}
                onBoundariesChange={setBoundaries}
                ledWalls={ledWalls}
                onLedWallsChange={setLedWalls}
                gridMeasurements={gridMeasurements}
                selectedGridCell={selectedCell}
                onGridCellClick={handleGridCellClick}
                drawBoundaryMode={drawBoundaryMode}
                onDrawBoundaryModeChange={setDrawBoundaryMode}
                boundaryStrokeColor={boundaryStrokeColor}
                onBoundaryColorChange={handleBoundaryColorChange}
                onDeleteBoundary={handleDeleteBoundary}
                gridRows={gridRows}
                gridCols={gridCols}
                onGridRowsChange={setGridRows}
                onGridColsChange={setGridCols}
                onGenerateGrid={handleGenerateGrid}
                ledWallMode={ledWallMode}
                onLedWallModeChange={setLedWallMode}
                ledWallColor={ledWallColor}
                onLedWallColorChange={handleLedWallColorChange}
                onAddWifiAP={handleAddWifiAP}
                onAddCommsRx={handleAddCommsRx}
                onStartLedWall={handleStartLedWall}
                onDeleteLandmark={handleDeleteLandmark}
                onDeleteLedWall={handleDeleteLedWall}
                onDeleteBoundaryByIndex={handleDeleteBoundaryByIndex}
                testingMode={testingMode}
                contextMenu={contextMenu}
                onContextMenuChange={setContextMenu}
                clipboard={clipboard}
                onCopyItem={handleCopyItem}
                onPasteItem={handlePasteItem}
                onClearCellMeasurement={handleClearCellMeasurement}
              />
            </div>

            {/* Live Monitor - Below Map */}
            {gridConfig && (
              <div style={{ marginTop: '24px' }}>
                <LiveMonitor
                  isConnected={isConnected}
                  currentReading={currentReading}
                  onTakeReading={handleTestCell}
                  isCapturing={isCapturing}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FloorPlanDemo;
