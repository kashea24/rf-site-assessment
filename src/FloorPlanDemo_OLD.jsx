import { useState, useCallback } from 'react';
import FloorPlanUpload from './components/FloorPlan/FloorPlanUpload';
import FloorPlanCanvas from './components/FloorPlan/FloorPlanCanvas';
import EquipmentSetupInstructions from './components/FloorPlan/EquipmentSetupInstructions';
import LiveMonitor from './components/FloorPlan/LiveMonitor';
import { generateGrid, calculateProgress } from './utils/floorPlanHelpers';
import { Layers, Grid3x3, MapPin, Activity, Trash2, Square, Trash, Usb } from 'lucide-react';

function FloorPlanDemo() {
  const [floorPlan, setFloorPlan] = useState(null);
  const [gridConfig, setGridConfig] = useState(null);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [showGrid, setShowGrid] = useState(false);
  const [landmarks, setLandmarks] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [gridMeasurements, setGridMeasurements] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentReading, setCurrentReading] = useState(null);
  const [drawBoundaryMode, setDrawBoundaryMode] = useState(false);
  const [boundaryStrokeColor, setBoundaryStrokeColor] = useState('#06b6d4');
  const [drawingHistory, setDrawingHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [ledWallMode, setLedWallMode] = useState(false);
  const [ledWallColor, setLedWallColor] = useState('#ef4444');
  const [ledWalls, setLedWalls] = useState([]);
  const [draggingLandmark, setDraggingLandmark] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleFloorPlanUpload = (uploadedFloorPlan) => {
    setFloorPlan(uploadedFloorPlan);
  };

  const handleGenerateGrid = () => {
    if (!floorPlan) return;
    
    // Clear previous selection and measurements when regenerating
    setSelectedCell(null);
    
    // Assume image is loaded and we can get dimensions
    const img = new Image();
    img.onload = () => {
      const grid = generateGrid(img.width, img.height, gridRows, gridCols);
      setGridConfig(grid);
      setShowGrid(true);
    };
    img.src = floorPlan.image;
  };

  const handleDeleteGrid = () => {
    setGridConfig(null);
    setShowGrid(false);
    setSelectedCell(null);
    setGridMeasurements({});
  };

  const handleConnectDevice = () => {
    // Temporary connect - just toggle state
    setIsConnected(!isConnected);
  };

  const handleDeleteBoundary = () => {
    if (boundaries.length > 0) {
      setBoundaries(boundaries.slice(0, -1));
    }
  };

  const handleBoundaryColorChange = (color) => {
    setBoundaryStrokeColor(color);
  };

  const handleUndoStroke = () => {
    // This will be handled by FloorPlanCanvas
  };

  const handleRedoStroke = () => {
    // This will be handled by FloorPlanCanvas
  };

  const handleCloseStroke = () => {
    // This will be handled by FloorPlanCanvas
  };

  const handleAddWifiAP = () => {
    const newLandmark = {
      id: Date.now(),
      type: 'wifi',
      x: floorPlan ? 500 : 0, // Will be set to center of view in canvas
      y: floorPlan ? 500 : 0
    };
    setLandmarks([...landmarks, newLandmark]);
  };

  const handleAddCommsRx = () => {
    const newLandmark = {
      id: Date.now(),
      type: 'antenna',
      x: floorPlan ? 500 : 0,
      y: floorPlan ? 500 : 0
    };
    setLandmarks([...landmarks, newLandmark]);
  };

  const handleStartLedWall = () => {
    setLedWallMode(true);
    setDrawBoundaryMode(false);
  };

  const handleLedWallColorChange = (color) => {
    setLedWallColor(color);
  };

  const handleDeleteLandmark = (landmarkId) => {
    setLandmarks(landmarks.filter(l => l.id !== landmarkId));
  };

  const handleGridCellClick = (cell) => {
    // Just select the cell, don't auto-test
    setSelectedCell(cell);
  };

  const handleTestCell = useCallback(() => {
    if (!selectedCell) return;
    
    setIsCapturing(true);
    const cellKey = `${selectedCell.row}-${selectedCell.col}`;
    
    // Simulate 5-second capture
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
    }, 5000);
  }, [selectedCell]);

  const progress = gridConfig ? calculateProgress(gridMeasurements, gridConfig.totalCells) : null;

  const handleClearAllData = () => {
    if (confirm('Clear all floor plan data and reload? This will remove the uploaded PDF, grid, and measurements.')) {
      // Clear localStorage
      localStorage.clear();
      // Reload the page to reset all state
      window.location.reload();
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
        maxWidth: '1400px',
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
            Review the floor plan components before main integration
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
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
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
          >
            <Trash2 size={18} />
            Clear All Data
          </button>
        </div>
      </div>

      {/* View Selector */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        marginBottom: '24px',
        display: 'flex',
        gap: '12px'
      }}>
        <button
          onClick={() => setCurrentView('upload')}
          style={{
            padding: '12px 20px',
            backgroundColor: currentView === 'upload' ? '#06b6d4' : '#1a2332',
            border: `2px solid ${currentView === 'upload' ? '#06b6d4' : '#2d3748'}`,
            borderRadius: '8px',
            color: currentView === 'upload' ? '#0a0e14' : '#e6edf3',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Layers size={18} />
          1. Upload PDF
        </button>
        <button
          onClick={() => setCurrentView('canvas')}
          disabled={!floorPlan}
          style={{
            padding: '12px 20px',
            backgroundColor: currentView === 'canvas' ? '#06b6d4' : '#1a2332',
            border: `2px solid ${currentView === 'canvas' ? '#06b6d4' : '#2d3748'}`,
            borderRadius: '8px',
            color: currentView === 'canvas' ? '#0a0e14' : '#e6edf3',
            fontSize: '14px',
            fontWeight: '600',
            cursor: floorPlan ? 'pointer' : 'not-allowed',
            opacity: floorPlan ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <MapPin size={18} />
          2. Interactive Canvas
        </button>
        <button
          onClick={() => setCurrentView('equipment')}
          style={{
            padding: '12px 20px',
            backgroundColor: currentView === 'equipment' ? '#06b6d4' : '#1a2332',
            border: `2px solid ${currentView === 'equipment' ? '#06b6d4' : '#2d3748'}`,
            borderRadius: '8px',
            color: currentView === 'equipment' ? '#0a0e14' : '#e6edf3',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Activity size={18} />
          3. Equipment Setup
        </button>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {currentView === 'upload' && (
          <div style={{
            backgroundColor: '#1a2332',
            borderRadius: '12px',
            border: '2px solid #2d3748',
            padding: '32px'
          }}>
            <h2 style={{
              fontSize: '24px',
              color: '#e6edf3',
              margin: '0 0 24px 0',
              fontWeight: '600'
            }}>
              PDF Floor Plan Upload
            </h2>
            <FloorPlanUpload
              onUploadComplete={handleFloorPlanUpload}
              currentFloorPlan={floorPlan}
            />
            {floorPlan && (
              <div style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#0d1117',
                borderRadius: '8px',
                border: '1px solid #22c55e'
              }}>
                <div style={{ fontSize: '14px', color: '#22c55e', fontWeight: '600', marginBottom: '8px' }}>
                  ✓ Floor Plan Uploaded Successfully
                </div>
                <p style={{ fontSize: '14px', color: '#6b7785', margin: 0 }}>
                  Click "2. Interactive Canvas" above to view and interact with your floor plan
                </p>
              </div>
            )}
          </div>
        )}

        {currentView === 'canvas' && floorPlan && (
          <div>
            {/* Controls Panel */}
            <div style={{
              backgroundColor: '#1a2332',
              borderRadius: '12px',
              border: '2px solid #2d3748',
              padding: '24px',
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '20px',
                color: '#e6edf3',
                margin: '0 0 20px 0',
                fontWeight: '600'
              }}>
                Grid Configuration
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '16px',
                alignItems: 'end'
              }}>
                <button
                  onClick={() => setDrawBoundaryMode(!drawBoundaryMode)}
                  style={{
                    padding: '10px',
                    backgroundColor: drawBoundaryMode ? '#dc2626' : '#1a2332',
                    border: `2px solid ${drawBoundaryMode ? '#dc2626' : '#2d3748'}`,
                    borderRadius: '6px',
                    color: drawBoundaryMode ? '#fff' : '#06b6d4',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    height: '100%',
                    justifyContent: 'center'
                  }}
                >
                  <Square size={20} />
                  <span>{drawBoundaryMode ? 'Cancel' : 'Draw Boundary'}</span>
                </button>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    color: '#6b7785',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    Rows
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={gridRows}
                    onChange={(e) => setGridRows(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#0d1117',
                      border: '2px solid #2d3748',
                      borderRadius: '6px',
                      color: '#e6edf3',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    color: '#6b7785',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    Columns
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={gridCols}
                    onChange={(e) => setGridCols(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#0d1117',
                      border: '2px solid #2d3748',
                      borderRadius: '6px',
                      color: '#e6edf3',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <button
                  onClick={handleGenerateGrid}
                  disabled={!floorPlan}
                  style={{
                    padding: '10px',
                    backgroundColor: floorPlan ? '#06b6d4' : '#1a2332',
                    border: 'none',
                    borderRadius: '6px',
                    color: floorPlan ? '#0a0e14' : '#6b7785',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: floorPlan ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    height: '100%',
                    justifyContent: 'center'
                  }}
                >
                  <Grid3x3 size={20} />
                  <span>{gridConfig ? 'Regenerate' : 'Generate'}</span>
                </button>

                <button
                  onClick={handleDeleteGrid}
                  disabled={!gridConfig}
                  style={{
                    padding: '10px',
                    backgroundColor: gridConfig ? '#dc2626' : '#1a2332',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: gridConfig ? 'pointer' : 'not-allowed',
                    opacity: gridConfig ? 1 : 0.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    height: '100%',
                    justifyContent: 'center'
                  }}
                >
                  <Trash size={20} />
                  <span>Delete Grid</span>
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div style={{
              backgroundColor: '#1a2332',
              borderRadius: '12px',
              border: '2px solid #2d3748',
              padding: '24px'
            }}>
              {/* Selected Cell Info */}
              {selectedCell && (
                <div style={{
                  marginBottom: '16px',
                  padding: '16px',
                  backgroundColor: '#0d1117',
                  borderRadius: '8px',
                  border: '2px solid #06b6d4',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h3 style={{
                      margin: '0 0 8px 0',
                      fontSize: '16px',
                      color: '#e6edf3',
                      fontWeight: '600'
                    }}>
                      Grid Cell Selected: Row {selectedCell.row + 1}, Col {selectedCell.col + 1}
                    </h3>
                    <p style={{
                      margin: 0,
                      fontSize: '14px',
                      color: '#6b7785'
                    }}>
                      {gridMeasurements[`${selectedCell.row}-${selectedCell.col}`]
                        ? 'Cell has been tested. Click "Retest Cell" to take a new reading.'
                        : 'Cell not yet tested. Click "Test Cell" to capture RF data.'}
                    </p>
                  </div>
                  <button
                    onClick={handleTestCell}
                    disabled={isCapturing}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: isCapturing ? '#1a2332' : '#06b6d4',
                      border: 'none',
                      borderRadius: '6px',
                      color: isCapturing ? '#6b7785' : '#0a0e14',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isCapturing ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isCapturing ? 'Testing...' : gridMeasurements[`${selectedCell.row}-${selectedCell.col}`] ? 'Retest Cell' : 'Test Cell'}
                  </button>
                </div>
              )}

              <div style={{ height: '600px' }}>
                <FloorPlanCanvas
                  floorPlanImage={floorPlan.image}
                  gridConfig={gridConfig}
                  showGrid={showGrid}
                  landmarks={landmarks}
                  onLandmarksChange={setLandmarks}
                  boundaries={boundaries}
                  onBoundariesChange={setBoundaries}
                  gridMeasurements={gridMeasurements}
                  selectedGridCell={selectedCell}
                  onGridCellClick={handleGridCellClick}
                  drawBoundaryMode={drawBoundaryMode}
                  boundaryStrokeColor={boundaryStrokeColor}
                  onDeleteBoundary={handleDeleteBoundary}
                  onColorChange={handleBoundaryColorChange}
                />
              </div>
              
              <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#0d1117',
                borderRadius: '6px',
                border: '1px solid #2d3748'
              }}>
                <div style={{ fontSize: '12px', color: '#6b7785', lineHeight: '1.8' }}>
                  <strong style={{ color: '#06b6d4' }}>Controls:</strong>
                  <br />
                  • <strong>Pan:</strong> Click and drag to move the view
                  <br />
                  • <strong>Zoom:</strong> Mouse wheel to zoom (auto-fits to viewport, max zoom shows 2x2 grid cells)
                  <br />
                  • <strong>Select Cell:</strong> Click any grid cell to select it (highlighted with cyan border)
                  <br />
                  • <strong>Test Cell:</strong> Use "Test Cell" button above to capture RF data for selected cell
                  <br />
                  • <strong>Draw Boundary:</strong> Click "Draw Boundary" above, then click on the map to define venue walls
                  <br />
                  • Color coding: <span style={{color: '#22c55e'}}>Green</span> = Good, <span style={{color: '#eab308'}}>Yellow</span> = OK, <span style={{color: '#f97316'}}>Orange</span> = Caution, <span style={{color: '#ef4444'}}>Red</span> = Interference
                </div>
              </div>
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

        {currentView === 'equipment' && (
          <div style={{
            backgroundColor: '#1a2332',
            borderRadius: '12px',
            border: '2px solid #2d3748'
          }}>
            <EquipmentSetupInstructions />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        maxWidth: '1400px',
        margin: '48px auto 0',
        padding: '16px',
        backgroundColor: '#1a2332',
        borderRadius: '8px',
        border: '1px solid #2d3748'
      }}>
        <div style={{ fontSize: '14px', color: '#6b7785', lineHeight: '1.8' }}>
          <strong style={{ color: '#e6edf3' }}>Components Built:</strong>
          <br />
          ✓ PDF upload with conversion to interactive image
          <br />
          ✓ Pan/zoom canvas with grid overlay
          <br />
          ✓ Grid cell selection and measurement tracking
          <br />
          ✓ Progress calculation and visualization
          <br />
          ✓ Visual equipment setup instructions with callouts
          <br />
          <br />
          <strong style={{ color: '#e6edf3' }}>Next Steps:</strong>
          <br />
          • Integrate into main App.jsx wizard flow
          <br />
          • Add live spectrum monitor view during measurements
          <br />
          • Build heatmap visualization
          <br />
          • Create AI recommendation engine
        </div>
      </div>
    </div>
  );
}

export default FloorPlanDemo;
