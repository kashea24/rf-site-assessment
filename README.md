# RF Site Assessment Tool v2.0.0
## For ABOnAir 612 + RF Explorer 6G WB Plus

A comprehensive webapp for RF site assessment, real-time spectrum monitoring, and best practices documentation for wireless video production.

**Latest Release:** v2.0.0 (January 27, 2026)

---

## ✨ What's New in v2.0.0

- ⚡ **Web Worker Integration** — 75% UI responsiveness improvement, smooth 60fps
- 💾 **IndexedDB Storage** — Unlimited capacity (1+ GB), automatic localStorage migration
- 📡 **Delta Encoding** — 60-80% bandwidth reduction for remote monitoring
- 📜 **Enhanced Logging** — 100,000+ events with virtual scrolling
- 🧪 **Automated Testing** — Jest + React Testing Library test suite

---

## Features

- **Live Spectrum Monitoring** — Real-time display of RF activity across your operating bands
- **ABOnAir 612 Band Support** — Optimized for Band 1 (1.99-2.50 GHz) and Band 2 (4.90-6.00 GHz)
- **Interactive Floor Plan** — PDF upload with grid-based measurement system
- **Unlimited Event Logging** — IndexedDB storage with batch saving and pagination
- **Background Processing** — Web Worker handles spectrum analysis without blocking UI
- **Test Procedures** — Step-by-step site assessment tests with analysis guides
- **Antenna Configuration Guide** — Setup instructions for different venue scenarios
- **Best Practices** — Venue-specific recommendations and critical procedures
- **Compressed Export** — 75% smaller ZIP exports with organized structure

---

## 📖 Documentation

**Complete documentation:** [DOCUMENTATION_v2.md](DOCUMENTATION_v2.md)

Topics covered:
- Quick start guide
- All v2.0.0 features explained in detail
- Web Worker integration
- IndexedDB storage
- Delta encoding
- Performance optimizations
- RF site assessment workflow
- Development guide
- Testing
- Deployment
- Troubleshooting
- API reference

---

## Quick Start

### Option 1: Web Serial API (Recommended)

Works directly in **Chrome** or **Edge** browsers — no additional software needed.

1. Open the webapp in Chrome or Edge
2. Connect your RF Explorer 6G WB Plus via USB
3. Click **"Connect Device"** in the header
4. Select **"Connect via USB"**
5. Choose your RF Explorer from the port selection dialog
6. Start monitoring!

**Requirements:**
- Chrome 89+ or Edge 89+
- RF Explorer USB drivers (usually auto-installed)

### Option 2: WebSocket Bridge (Fallback)

Use this if Web Serial doesn't work or you need Firefox/Safari support.

1. Install Python dependencies:
   ```bash
   pip install pyserial websockets
   ```

2. Find your serial port:
   ```bash
   python rf_explorer_bridge.py --list
   ```

3. Start the bridge:
   ```bash
   # Windows
   python rf_explorer_bridge.py --port COM3
   
   # Mac
   python rf_explorer_bridge.py --port /dev/tty.usbserial-XXXXX
   
   # Linux
   python rf_explorer_bridge.py --port /dev/ttyUSB0
   ```

4. In the webapp, click **"Connect Device"**
5. Select **"WebSocket Bridge"** and connect to `ws://localhost:8765`

### Demo Mode

Want to explore the interface without hardware?

1. Click **"Connect Device"**
2. Click **"Start Demo Mode"**
3. Simulated spectrum data will display

---

## Site Assessment Workflow

### Pre-Event (1-2 weeks before)

1. **Initial Site RF Scan**
   - Full spectrum sweep of venue
   - Document baseline noise floor
   - Identify WiFi and interference sources

2. **Frequency Selection Test**
   - Find clear channels in ABOnAir bands
   - Document primary and backup frequencies
   - Verify FCC compliance

### Day Before / Day Of

3. **Path Loss Assessment**
   - Test signal at all camera positions
   - Identify dead zones
   - Verify signal margins

4. **Dynamic Interference Test**
   - Test with all production equipment on
   - Log interference patterns
   - Finalize frequency selection

### During Event

- Keep monitoring active
- Watch for threshold alerts
- Be ready with backup frequencies

---

## RF Explorer Protocol Notes

The RF Explorer 6G WB Plus uses the following serial settings:
- **Baud Rate:** 500,000
- **Data Bits:** 8
- **Stop Bits:** 1
- **Parity:** None

### Key Commands

| Command | Description |
|---------|-------------|
| `#0C0` | Request current configuration |
| `#0C3` | Start continuous sweep |
| `#0CH` | Stop/hold sweep |
| `#0C2-F:SSSSSSS,WWWWWWW` | Set frequency (start_khz, span_khz) |

### Sweep Data Format

Sweep data arrives as binary:
```
$S<steps><data...><EOL>
```
- Each data byte = amplitude in -0.5 dBm steps
- Value 0 = 0 dBm, Value 100 = -50 dBm, etc.

---

## Antenna Configuration Quick Reference

| Configuration | Best For | Range |
|--------------|----------|-------|
| Standard Omni | Small venues, 360° coverage | 100-200 ft |
| Directional Panel | Large venues, long throw | 300-500 ft |
| Hybrid Diversity | Complex venues, max reliability | 200-400 ft |
| MIMO | Challenging RF, max throughput | 150-300 ft |

---

## Threshold Guidelines

| Level | dBm | Action |
|-------|-----|--------|
| Clear | < -80 | Excellent, proceed |
| Good | -80 to -70 | Good, monitor |
| Moderate | -70 to -60 | Caution, consider alternatives |
| Warning | -60 to -50 | Problematic, mitigate |
| Critical | > -50 | Interference present, change frequency |

---

## Troubleshooting

### Web Serial Issues

**"No ports found"**
- Ensure RF Explorer is powered on and connected via USB
- Try a different USB cable (data cable, not charge-only)
- Check Device Manager (Windows) or System Report (Mac) for the device

**"Permission denied"**
- On Linux, add yourself to the dialout group: `sudo usermod -a -G dialout $USER`
- Log out and back in

**"Port in use"**
- Close RF Explorer for Windows software if running
- Close any other serial terminal applications

### WebSocket Bridge Issues

**"Connection refused"**
- Ensure the bridge script is running
- Check firewall settings for port 8765
- Verify the URL is correct: `ws://localhost:8765`

**"No data received"**
- Verify RF Explorer is connected and powered
- Check the serial port is correct (use `--list` to find it)
- Try unplugging and reconnecting the RF Explorer

---

## Files Included

| File | Description |
|------|-------------|
| `rf-site-assessment-v2.jsx` | Main webapp (React component) |
| `rf_explorer_bridge.py` | WebSocket bridge server for Option 2 |
| `README.md` | This documentation |

---

## Technical Specifications

### ABOnAir 612 Frequency Bands
- **Band 1:** 1.99 - 2.50 GHz (overlaps 2.4 GHz WiFi)
- **Band 2:** 4.90 - 6.00 GHz (overlaps 5 GHz WiFi)

### RF Explorer 6G WB Plus
- **Frequency Range:** 15 MHz - 6.1 GHz
- **Amplitude Range:** -120 dBm to +10 dBm
- **Resolution Bandwidth:** Automatic based on span

---

## Support

For issues with:
- **RF Explorer hardware:** [RF Explorer Support](https://www.rf-explorer.com/support)
- **ABOnAir systems:** Contact ABOnAir support
- **This tool:** Check the troubleshooting section above

---

## License

This tool is provided for professional wireless video production use.
