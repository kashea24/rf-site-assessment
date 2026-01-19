# RF Site Assessment Tool - Development Documentation

## Project Overview

This is a comprehensive web application for RF site assessment, spectrum monitoring, and wireless video production optimization. Built with React and Vite, it interfaces with the RF Explorer 6G WB Plus spectrum analyzer and ABOnAir 612 wireless video systems.

## Tech Stack

- **Frontend Framework:** React 18
- **Build Tool:** Vite 5
- **UI Icons:** Lucide React
- **Language:** JavaScript (JSX)
- **Backend/Bridge:** Python 3 (WebSocket server)

## Project Structure

```
TestRF/
├── src/
│   ├── App.jsx           # Main React component (2700+ lines)
│   ├── main.jsx          # React entry point
│   └── index.css         # Global styles
├── rf_explorer_bridge.py # Python WebSocket bridge server
├── index.html            # HTML entry point
├── vite.config.js        # Vite configuration
├── package.json          # Node dependencies
├── README.md             # User documentation
├── DEPLOYMENT.md         # Deployment guide
└── .gitignore           # Git ignore rules
```

## Key Features

### 1. RF Explorer Connection
- **Web Serial API:** Direct USB connection in Chrome/Edge
- **WebSocket Fallback:** Python bridge for other browsers
- Abstraction layer handles both connection types seamlessly

### 2. Spectrum Monitoring
- Real-time spectrum display
- Band 1 (1.99-2.50 GHz) and Band 2 (4.90-6.00 GHz) support
- Automatic threshold detection
- Event logging for RF anomalies

### 3. Test Procedures
- Step-by-step site assessment tests
- Venue walk tests
- Dead zone identification
- Frequency coordination

### 4. Antenna Configuration
- Venue-specific antenna setups
- Line-of-sight vs. obstructed scenarios
- Mounting recommendations

### 5. Best Practices
- Critical procedures documentation
- Venue-specific recommendations
- Troubleshooting guides

### 6. Reporting
- JSON export of test results
- CSV export of event logs
- Timestamped documentation

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter (if configured)
npm run lint
```

## Python Bridge Development

```bash
# Install Python dependencies
pip install pyserial websockets

# List available serial ports
python rf_explorer_bridge.py --list

# Start bridge server
python rf_explorer_bridge.py --port /dev/tty.usbserial-XXXXX --ws-port 8765

# Enable debug logging
python rf_explorer_bridge.py --port /dev/tty.usbserial-XXXXX --debug
```

## Main Component Structure

The main `App.jsx` contains:

1. **RFExplorerConnection Class** (Lines 1-500)
   - Connection management
   - Protocol parsing
   - Data processing

2. **React Component State** (Lines 708+)
   - Connection status
   - Monitoring state
   - Test results
   - Event logs

3. **UI Tabs**
   - Dashboard: Overview and quick stats
   - Monitor: Live spectrum display
   - Tests: Guided test procedures
   - Setup: Antenna configuration
   - Practices: Best practices documentation
   - Reports: Export functionality

## Key State Variables

```javascript
// Connection
connectionStatus: { connected: boolean, type: 'serial'|'websocket' }
connectionError: string | null

// Monitoring
isMonitoring: boolean
spectrumData: { frequencies: [], amplitudes: [] }
eventLog: [{ time, type, message, frequency }]

// Tests
selectedTest: object | null
testResults: [{ id, passed, notes, timestamp }]

// Configuration
selectedAntenna: object | null
antennaSetups: array
```

## Adding New Features

### Adding a New Test Procedure

1. Add test definition to `TEST_PROCEDURES` array
2. Include step-by-step instructions
3. Add interpretation guidelines
4. Update test completion logic

### Adding New Antenna Configurations

1. Add configuration to `ANTENNA_SETUPS` array
2. Include mounting instructions
3. Add venue recommendations
4. Update selection UI

### Modifying Spectrum Display

1. Locate spectrum rendering in Monitor tab
2. Update canvas drawing logic
3. Adjust frequency bands in RF Explorer config
4. Update threshold detection

## RF Explorer Protocol

The app implements the RF Explorer serial protocol:

- Commands start with `#` or `C`
- Responses start with `$`
- Sweep data format: `$S` + binary amplitude data
- Configuration: `#C2-F:SSSSSSS,EEEEEEE,NNNN,W`

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Web Serial | ✅ | ✅ | ❌ | ❌ |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| Full UI | ✅ | ✅ | ✅ | ✅ |

**Note:** Web Serial requires HTTPS in production (or localhost in development)

## Security Considerations

- Web Serial API requires user permission
- No sensitive data is stored
- WebSocket bridge should use WSS (secure) in production
- CORS configured for local development

## Future Enhancements

- [ ] Database for persistent storage
- [ ] Multi-user support
- [ ] Cloud data synchronization
- [ ] Mobile responsive design improvements
- [ ] PDF report generation
- [ ] Historical data analysis
- [ ] Frequency coordination automation
- [ ] Integration with other RF tools

## Troubleshooting

### Dev Server Won't Start
- Check if port 3000 is already in use
- Run `npm install` to ensure dependencies are installed
- Check for syntax errors in modified files

### RF Explorer Not Connecting
- Verify USB drivers are installed
- Check serial port permissions
- Try the WebSocket bridge fallback
- Ensure RF Explorer firmware is up to date

### Build Errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for missing dependencies
- Verify Vite configuration

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test thoroughly (both connection methods)
4. Commit: `git commit -m "Description of changes"`
5. Push: `git push origin feature/your-feature`
6. Create a Pull Request

## Resources

- [RF Explorer Docs](http://rfexplorer.com/documents/)
- [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [ABOnAir 612 Manual](https://abonairaudio.com/)

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- GitHub Issues: https://github.com/kashea24/rf-site-assessment/issues
- Email: kevin@prolevelrental.com
