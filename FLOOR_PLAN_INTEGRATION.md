# Floor Plan Integration Plan

## Current Status ✅
The floor plan mapping tool is fully functional in demo mode with:
- PDF upload and rendering
- Interactive boundary drawing
- Grid generation (adjustable rows/columns)
- LED wall placement (draggable lines)
- WiFi AP and Comms Rx markers
- Test mode with grid cell selection
- Context menus for copy/paste/delete
- Comprehensive logging throughout

## Integration Steps

### 1. Add Floor Plan to Wizard (Step 0.5)
Insert floor plan mapping between venue setup (Step 0) and test procedures (Steps 1-N):

```jsx
// In App.jsx TEST_PROCEDURES array, add new step at beginning:
{
  id: 'floor-plan-mapping',
  name: 'Floor Plan Mapping',
  duration: '15-20 min',
  description: 'Upload venue floor plan and map RF environment',
  equipment: [
    { name: 'Venue Floor Plan PDF', role: 'Spatial Reference', icon: 'FileText' },
    { name: 'Measuring Tape', role: 'Dimension Verification', icon: 'Ruler' }
  ],
  sections: [
    {
      title: 'Floor Plan Upload',
      icon: 'Upload',
      steps: [
        { text: 'Obtain venue floor plan PDF from management', duration: '2 min' },
        { text: 'Upload PDF to tool', duration: '1 min' },
        { text: 'Verify scale and orientation', duration: '2 min' }
      ]
    },
    {
      title: 'Boundary Definition',
      icon: 'Square',
      steps: [
        { text: 'Select "Draw Boundary" tool', duration: '30 sec' },
        { text: 'Click to define event area perimeter', duration: '2-3 min' },
        { text: 'Click "Close Stroke" to complete boundary', duration: '10 sec' },
        { text: 'Adjust grid rows/columns to match venue layout', duration: '1 min' }
      ]
    },
    {
      title: 'Interference Object Placement',
      icon: 'MapPin',
      steps: [
        { text: 'Place LED Wall markers on stage positions', duration: '2 min' },
        { text: 'Mark WiFi AP locations throughout venue', duration: '3-5 min' },
        { text: 'Position Comms Rx at planned receiver locations', duration: '2 min' }
      ]
    }
  ]
}
```

### 2. Store Floor Plan Data in wizardData State
Add to wizardData schema:
```jsx
const [wizardData, setWizardData] = useState({
  // ... existing fields
  floorPlan: {
    image: null,
    name: '',
    width: 0,
    height: 0
  },
  boundary: {
    points: []
  },
  gridConfig: {
    rows: 5,
    cols: 5,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    centerX: 0,
    centerY: 0
  },
  landmarks: [],
  ledWalls: [],
  gridMeasurements: {}
});
```

### 3. Import Floor Plan Components into App.jsx
```jsx
import FloorPlanUpload from './components/FloorPlan/FloorPlanUpload';
import FloorPlanCanvas from './components/FloorPlan/FloorPlanCanvas';
```

### 4. Add Floor Plan Step to Wizard Rendering
In the wizard modal, add conditional rendering for floor plan step:
```jsx
{wizardStep === 1 && ( // Assuming floor plan is step 1
  <div>
    <h3>Floor Plan Mapping</h3>
    {!wizardData.floorPlan && (
      <FloorPlanUpload onUploadComplete={handleFloorPlanUpload} />
    )}
    {wizardData.floorPlan && (
      <FloorPlanCanvas
        floorPlan={wizardData.floorPlan}
        boundaries={wizardData.boundaries}
        gridConfig={wizardData.gridConfig}
        // ... all other props
      />
    )}
  </div>
)}
```

### 5. Use Floor Plan Data in Grid Measurement Test (Step 3)
When user reaches grid measurement test:
- Display floor plan canvas in test mode
- Show grid cells from wizardData.gridConfig
- Click cells to run RF measurements
- Store results in wizardData.gridMeasurements[cellKey]

### 6. Visualization in Results Tab
Add floor plan heatmap view to Results tab:
- Render floor plan as background
- Overlay grid with measurement colors
- Show interference objects (LED walls, WiFi APs)
- Display signal strength heatmap using IDW interpolation

## Logging Strategy

### Current Logging (Already Implemented) ✅
- `console.log` with emojis for visual debugging
- `logger.info/error` for persistent logging
- All major state changes logged:
  - Floor plan upload
  - Boundary creation/closure
  - Grid generation
  - Grid row/col changes
  - Object placement (landmarks, LED walls)
  - Test mode toggle
  - Cell measurements
  - Device connection

### Additional Logging Needed
1. **Canvas Events**
   - Mouse down/move/up with coordinates
   - Pan/zoom state changes
   - Drawing path progress

2. **State Persistence**
   - localStorage save/load operations
   - State sync with parent component

3. **Performance Metrics**
   - PDF rendering time
   - Grid calculation time
   - Canvas render frame rate

4. **Error Handling**
   - PDF parsing failures
   - Invalid boundary shapes
   - Grid generation errors
   - RF device communication failures

## Testing Checklist

### Floor Plan Functionality
- [ ] PDF upload works
- [ ] Boundary drawing creates closed shape
- [ ] Grid generates within boundary
- [ ] Grid adjusts when rows/cols change
- [ ] Landmarks are draggable
- [ ] LED walls are draggable lines
- [ ] Context menus work (copy/paste/delete)
- [ ] Test mode disables editing
- [ ] Grid cells are selectable in test mode

### Integration Functionality
- [ ] Floor plan data persists in wizardData
- [ ] Floor plan appears in grid measurement step
- [ ] Measurements store in correct cell keys
- [ ] Results tab shows floor plan heatmap
- [ ] Back/Next navigation preserves floor plan state
- [ ] localStorage saves complete floor plan data

### Logging Verification
- [ ] All console.log statements use emojis
- [ ] logger.info records all major actions
- [ ] Errors are caught and logged
- [ ] User actions are traceable in logs

## File Structure
```
src/
├── App.jsx                          # Main app with wizard
├── FloorPlanDemo.jsx                # Standalone demo (keep for testing)
├── main.jsx                         # Entry point with mode toggle
├── components/
│   └── FloorPlan/
│       ├── FloorPlanCanvas.jsx      # Interactive canvas
│       ├── FloorPlanUpload.jsx      # PDF upload
│       ├── LiveMonitor.jsx          # RF spectrum monitor
│       └── EquipmentSetupInstructions.jsx
└── utils/
    ├── floorPlanHelpers.js         # Grid calculations
    └── pdfConverter.js             # PDF to image converter
```

## Next Development Phase

### Phase 1: Basic Integration (Current)
- ✅ Floor plan demo fully functional
- ✅ Comprehensive logging added
- 🔄 Ready to integrate into App.jsx

### Phase 2: Wizard Integration
- Import components into App.jsx
- Add floor plan step to TEST_PROCEDURES
- Wire up state management
- Test navigation flow

### Phase 3: Measurement Integration
- Connect RF Explorer to floor plan
- Cell-by-cell measurement workflow
- Real-time heatmap updates
- Progress tracking

### Phase 4: Advanced Features
- IDW interpolation for heatmap
- AI recommendation engine
- Antenna placement optimization
- Export/print floor plan reports

## Environment Variables
None required - all functionality is client-side.

## Dependencies (Already Installed)
- pdfjs-dist: PDF rendering
- lucide-react: Icons
- React 18.2.0: UI framework
- Vite 5.0.8: Build tool

## Mode Toggle
Edit `src/main.jsx` to switch between demo and integrated modes:
```jsx
const VIEW_MODE = 'demo';  // or 'app'
```

---

**Status**: Ready for integration into main app
**Last Updated**: January 22, 2026
