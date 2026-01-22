# Interactive Floor Plan Mapping Feature

## Overview
Transform the RF Site Assessment into a professional site survey tool with interactive floor plan mapping, drag-and-drop equipment placement, grid-based measurement recording, and heatmap visualization.

## Feature Components

### 1. PDF Import & Conversion
**User Flow:**
- Click "Upload Floor Plan" button in Initial Site RF Scan
- Select PDF file from computer
- PDF rendered to canvas using PDF.js library
- Convert to high-resolution image for manipulation
- Store in component state and localStorage for persistence

**Technical Implementation:**
- Use `pdf.js` (Mozilla's PDF renderer)
- Convert PDF page to canvas: `pdf.getPage(1).render()`
- Export canvas to data URL: `canvas.toDataURL('image/png')`
- Store base64 image in wizard state
- Max resolution: 2000x2000px (balance quality vs performance)

### 2. Interactive Floor Plan Canvas
**Canvas Features:**
- Pan: Click and drag to move view
- Zoom: Mouse wheel or pinch gesture
- Grid overlay: Auto-generated based on scale
- Measurement tools: Ruler, distance calculator
- Annotations: Text labels, arrows, shapes

**State Management:**
```javascript
floorPlan: {
  image: 'base64DataURL',
  scale: { feet: 10, pixels: 100 }, // 10 feet = 100 pixels
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  gridSize: 10, // feet
  items: [], // placed equipment/markers
  measurements: [] // RF readings at grid points
}
```

### 3. Equipment Toolbar (Drag & Drop)
**Draggable Items:**
- 📡 WiFi Access Point (with signal radius visualization)
- 📻 Intercom System Antenna
- 🖥️ LED Wall (with RF noise indicator)
- ⚡ RF Spike Point (interference hotspot)
- 🎥 Camera Position
- 📶 RX Antenna Location
- 🔴 Dead Zone

**Properties per Item:**
```javascript
{
  id: 'unique-id',
  type: 'wifi-ap',
  position: { x: 250, y: 180 },
  properties: {
    ssid: 'Venue-WiFi',
    channel: 6,
    power: -45 // dBm
  }
}
```

### 4. Grid-Based RF Measurement Recording
**Measurement Grid:**
- Auto-divide floor plan into grid cells (10ft x 10ft default)
- Each cell becomes a measurement point
- Walk venue in grid pattern
- Record RF readings at each point
- Visual indicator: unmeasured (gray), measured (color-coded)

**Measurement Data Structure:**
```javascript
{
  gridCell: { row: 3, col: 5 },
  position: { x: 300, y: 400 },
  timestamp: '2026-01-22T12:00:00Z',
  readings: {
    band1: { peak: -55, average: -70, noiseFloor: -85 },
    band2: { peak: -48, average: -65, noiseFloor: -90 }
  },
  notes: 'Near LED wall, high interference'
}
```

### 5. Heatmap Visualization
**Heatmap Generation:**
- Interpolate between measurement points
- Color gradient: Green (clean) → Yellow (marginal) → Red (poor)
- Layer opacity control (50-100%)
- Toggle heatmap on/off
- Separate heatmaps for Band 1 and Band 2

**Color Scale:**
- Green (#22c55e): < -70 dBm (excellent)
- Yellow (#eab308): -70 to -60 dBm (acceptable)
- Orange (#f59e0b): -60 to -50 dBm (caution)
- Red (#ef4444): > -50 dBm (interference)

**Interpolation Algorithm:**
- Inverse Distance Weighting (IDW)
- Or Gaussian blur for smoother visualization
- Consider 4 nearest neighbors for each pixel

### 6. Export & Reporting
**Export Options:**
- PDF report with annotated floor plan
- PNG image of heatmap overlay
- CSV data of all measurements
- JSON export of complete floor plan data

## Implementation Phases

### Phase 1: UI Restructuring (Current Session)
- ✅ Remove heartbeat header div
- ✅ Combine steps 1-5 into visual instruction page
- ✅ Add real equipment images or better SVG representations
- 🔄 Restructure test procedure component

### Phase 2: PDF Import (Next Session)
- Install pdf.js: `npm install pdfjs-dist`
- Create FloorPlanUpload component
- PDF to canvas conversion
- Image storage in state

### Phase 3: Interactive Canvas (Session After)
- Create FloorPlanCanvas component
- Pan/zoom functionality
- Grid overlay generation
- Scale calibration tool

### Phase 4: Equipment Toolbar
- Drag-and-drop implementation
- Equipment icon library
- Placement and editing
- Property panels for each item

### Phase 5: Measurement Grid
- Grid cell generation
- Measurement recording UI
- Integration with RF Explorer readings
- Progress tracking (cells measured vs total)

### Phase 6: Heatmap Generation
- Implement IDW interpolation
- Canvas overlay rendering
- Color gradient mapping
- Band selection toggle

### Phase 7: Export & Polish
- PDF report generation (jsPDF)
- Image export
- Data export (CSV/JSON)
- UI polish and testing

## Libraries Required
```json
{
  "pdfjs-dist": "^3.11.174",  // PDF rendering
  "canvas": "^2.11.2",         // Server-side canvas (if needed)
  "jspdf": "^2.5.1",           // PDF generation for reports
  "html2canvas": "^1.4.1"      // Export canvas to image
}
```

## File Structure
```
src/
  components/
    FloorPlan/
      FloorPlanUpload.jsx
      FloorPlanCanvas.jsx
      EquipmentToolbar.jsx
      MeasurementGrid.jsx
      Heatmap.jsx
      FloorPlanExport.jsx
  utils/
    floorPlanHelpers.js  // Scale calculation, grid generation
    heatmapInterpolation.js  // IDW algorithm
    pdfConverter.js  // PDF to image conversion
```

## Data Persistence
- Store floor plan data in wizard state
- Save to localStorage on changes
- Export/import capability for backup
- Include floor plan in show profile JSON export

## Mobile Considerations
- Touch support for pan/zoom
- Simplified toolbar for smaller screens
- Responsive grid sizing
- Optimized image resolution for mobile bandwidth

## Future Enhancements
- Real-time RF monitoring while walking grid
- GPS integration for outdoor venues
- 3D venue visualization (future major feature)
- Automatic optimal camera placement suggestions
- AI-powered interference prediction
- Collaborative editing (multiple technicians)
- Cloud sync for team access

## Next Steps
1. Restructure Initial Site RF Scan UI (current session)
2. Install pdf.js and create upload component
3. Build interactive canvas with basic pan/zoom
4. Implement drag-and-drop toolbar
5. Create measurement recording interface
6. Build heatmap visualization
7. Add export functionality

---

This feature will transform the app from a simple measurement tool into a professional site survey platform used by RF coordinators worldwide.
