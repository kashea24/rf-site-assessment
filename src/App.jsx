import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Antenna, Activity, FileText, Settings, AlertTriangle, CheckCircle, Clock, MapPin, Wifi, Zap, BarChart3, List, BookOpen, ChevronRight, Play, Pause, Download, Plus, Trash2, Eye, Signal, Usb, RefreshCw, X, Sliders, Ruler, Navigation, Target } from 'lucide-react';
import { logger } from './logger.js';

// Geoapify API key
const GEOAPIFY_API_KEY = '27252b47c9ff4eed94d3daf8a0265654';

// ============================================================================
// INTERFERENCE DETECTION APIs
// ============================================================================

// Fetch nearby cell towers using OpenCelliD API
async function getNearbyInterferenceSources(lat, lon) {
  const results = {
    cellTowers: [],
    tvStations: [],
    risks: []
  };

  try {
    // OpenCelliD API - Free tier (500 requests/day)
    // Note: This is a simplified implementation. Full implementation would require API key.
    // For demo purposes, we'll use a mock/fallback approach
    
    logger.info('InterferenceAPI', 'Querying nearby interference sources', { lat, lon });
    
    // Check for high-risk venue types based on coordinates
    // This is a simplified approach - in production, you'd use actual APIs
    
    // Detect if near major city centers (higher interference risk)
    const cityProximity = checkCityProximity(lat, lon);
    if (cityProximity) {
      results.risks.push({
        type: 'urban-density',
        severity: 'high',
        description: `High RF congestion expected in ${cityProximity} metro area`,
        mitigation: 'Scan 5 GHz band for cleaner spectrum, coordinate with venue RF manager'
      });
    }
    
    // Estimate cell tower density based on population density heuristics
    const cellTowerRisk = estimateCellTowerDensity(lat, lon);
    if (cellTowerRisk.count > 0) {
      results.cellTowers = cellTowerRisk.towers;
      results.risks.push({
        type: 'cellular',
        severity: cellTowerRisk.count > 10 ? 'high' : 'medium',
        description: `Estimated ${cellTowerRisk.count}+ cellular towers within 1km`,
        mitigation: 'Use Band 1 (2.4 GHz) with caution, prefer Band 2 (5 GHz) for less LTE interference'
      });
    }
    
    // WiFi congestion is universal but worse in certain venues
    results.risks.push({
      type: 'wifi',
      severity: 'high',
      description: '2.4 GHz WiFi congestion expected at most venues',
      mitigation: 'Coordinate WiFi channels with venue, prefer 5 GHz band (4.9-6 GHz)'
    });
    
    logger.info('InterferenceAPI', 'Retrieved interference data', { 
      riskCount: results.risks.length,
      cellTowers: results.cellTowers.length 
    });
    
  } catch (error) {
    logger.error('InterferenceAPI', 'Failed to fetch interference data', { error: error.message });
  }
  
  return results;
}

// Check if coordinates are near major metro areas
function checkCityProximity(lat, lon) {
  const majorCities = [
    { name: 'New York', lat: 40.7128, lon: -74.0060, radius: 50 },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, radius: 50 },
    { name: 'Chicago', lat: 41.8781, lon: -87.6298, radius: 40 },
    { name: 'Houston', lat: 29.7604, lon: -95.3698, radius: 40 },
    { name: 'Phoenix', lat: 33.4484, lon: -112.0740, radius: 30 },
    { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, radius: 30 },
    { name: 'San Antonio', lat: 29.4241, lon: -98.4936, radius: 25 },
    { name: 'San Diego', lat: 32.7157, lon: -117.1611, radius: 25 },
    { name: 'Dallas', lat: 32.7767, lon: -96.7970, radius: 35 },
    { name: 'San Jose', lat: 37.3382, lon: -121.8863, radius: 20 },
    { name: 'Austin', lat: 30.2672, lon: -97.7431, radius: 20 },
    { name: 'Jacksonville', lat: 30.3322, lon: -81.6557, radius: 20 },
    { name: 'San Francisco', lat: 37.7749, lon: -122.4194, radius: 25 },
    { name: 'Las Vegas', lat: 36.1699, lon: -115.1398, radius: 25 },
    { name: 'Nashville', lat: 36.1627, lon: -86.7816, radius: 20 },
  ];
  
  for (const city of majorCities) {
    const distance = calculateDistance(lat, lon, city.lat, city.lon);
    if (distance <= city.radius) {
      return city.name;
    }
  }
  
  return null;
}

// Estimate cell tower density based on location
function estimateCellTowerDensity(lat, lon) {
  // Simplified heuristic: Urban areas have more towers
  const cityName = checkCityProximity(lat, lon);
  
  if (cityName) {
    // Major metro area
    return {
      count: 15,
      towers: [
        { carrier: 'Verizon', bands: ['700 MHz', '1900 MHz', '2.5 GHz'], distance: '0.3 km' },
        { carrier: 'AT&T', bands: ['850 MHz', '1900 MHz', '2.3 GHz'], distance: '0.5 km' },
        { carrier: 'T-Mobile', bands: ['600 MHz', '1900 MHz', '2.5 GHz'], distance: '0.7 km' }
      ]
    };
  }
  
  // Suburban/rural - fewer towers
  return {
    count: 5,
    towers: [
      { carrier: 'Various', bands: ['700-2500 MHz'], distance: '1-2 km' }
    ]
  };
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// RF EXPLORER CONNECTION MANAGER
// Abstraction layer supporting Web Serial API with WebSocket fallback
// ============================================================================

class RFExplorerConnection {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.websocket = null;
    this.connectionType = null; // 'serial' or 'websocket'
    this.isConnected = false;
    this.buffer = new Uint8Array(0);
    this.onData = null;
    this.onConnectionChange = null;
    this.onError = null;
    
    // RF Explorer 6G WB Plus specifications
    this.config = {
      baudRate: 500000,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    };
    
    // Current sweep configuration
    this.sweepConfig = {
      startFreqMHz: 1990,
      endFreqMHz: 6000,
      steps: 112,
      rbwKHz: 600
    };
  }

  // Check if Web Serial API is available
  static isWebSerialSupported() {
    return 'serial' in navigator;
  }

  // Connect via Web Serial API
  async connectSerial() {
    if (!RFExplorerConnection.isWebSerialSupported()) {
      throw new Error('Web Serial API not supported in this browser. Use Chrome or Edge.');
    }

    try {
      // Request port from user
      this.port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x10C4 }, // Silicon Labs (common RF Explorer USB chip)
          { usbVendorId: 0x0403 }, // FTDI
        ]
      });

      await this.port.open(this.config);
      
      this.connectionType = 'serial';
      this.isConnected = true;
      
      // Set up reader
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      
      // Start reading loop
      this.readLoop();
      
      // Request current configuration
      await this.requestConfig();
      
      if (this.onConnectionChange) {
        this.onConnectionChange({ connected: true, type: 'serial' });
      }
      
      return true;
    } catch (error) {
      this.isConnected = false;
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  // Connect via WebSocket (fallback to local bridge)
  async connectWebSocket(url = 'ws://localhost:8765') {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(url);
        
        this.websocket.onopen = () => {
          this.connectionType = 'websocket';
          this.isConnected = true;
          if (this.onConnectionChange) {
            this.onConnectionChange({ connected: true, type: 'websocket' });
          }
          resolve(true);
        };
        
        this.websocket.onmessage = (event) => {
          // Handle incoming data from bridge
          if (event.data instanceof Blob) {
            event.data.arrayBuffer().then(buffer => {
              this.processIncomingData(new Uint8Array(buffer));
            });
          } else if (typeof event.data === 'string') {
            // JSON messages from bridge
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'sweep') {
                if (this.onData) {
                  this.onData(msg.data);
                }
              }
            } catch (e) {
              // Binary data as base64
              const binary = atob(event.data);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              this.processIncomingData(bytes);
            }
          }
        };
        
        this.websocket.onerror = (error) => {
          if (this.onError) {
            this.onError(error);
          }
          reject(error);
        };
        
        this.websocket.onclose = () => {
          this.isConnected = false;
          this.connectionType = null;
          if (this.onConnectionChange) {
            this.onConnectionChange({ connected: false, type: null });
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  // Read loop for serial connection
  async readLoop() {
    try {
      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.processIncomingData(value);
        }
      }
    } catch (error) {
      if (this.isConnected) {
        if (this.onError) {
          this.onError(error);
        }
      }
    }
  }

  // Process incoming binary data from RF Explorer
  processIncomingData(newData) {
    // Append to buffer
    const combined = new Uint8Array(this.buffer.length + newData.length);
    combined.set(this.buffer);
    combined.set(newData, this.buffer.length);
    this.buffer = combined;

    // Parse complete messages
    this.parseBuffer();
  }

  // Parse RF Explorer protocol messages from buffer
  parseBuffer() {
    while (this.buffer.length > 0) {
      // Look for message start marker '$'
      const startIdx = this.buffer.indexOf(0x24); // '$'
      
      if (startIdx === -1) {
        // No start marker, clear buffer
        this.buffer = new Uint8Array(0);
        return;
      }
      
      if (startIdx > 0) {
        // Remove bytes before start marker
        this.buffer = this.buffer.slice(startIdx);
      }
      
      if (this.buffer.length < 3) {
        // Not enough data for header
        return;
      }
      
      const msgType = this.buffer[1];
      
      // Handle different message types
      switch (msgType) {
        case 0x53: // 'S' - Sweep data
          if (!this.parseSweepData()) return;
          break;
        case 0x43: // 'C' - Configuration
          if (!this.parseConfig()) return;
          break;
        case 0x23: // '#' - Various responses
          if (!this.parseResponse()) return;
          break;
        default:
          // Unknown message, skip byte
          this.buffer = this.buffer.slice(1);
      }
    }
  }

  // Parse sweep data message
  // Format: $S<steps><data...>
  parseSweepData() {
    if (this.buffer.length < 4) return false;
    
    // RF Explorer sweep format varies by model
    // 6G models use extended format
    const steps = this.buffer[2];
    const expectedLength = 3 + steps + 1; // $S + steps + data + EOL
    
    if (this.buffer.length < expectedLength) {
      return false; // Wait for more data
    }
    
    // Extract amplitude data
    const amplitudeData = [];
    for (let i = 0; i < steps; i++) {
      // Each byte is amplitude in -0.5 dBm steps from 0
      // Value 0 = 0 dBm, Value 1 = -0.5 dBm, etc.
      const rawValue = this.buffer[3 + i];
      const dBm = -rawValue / 2;
      amplitudeData.push(dBm);
    }
    
    // Calculate frequency for each point
    const freqStep = (this.sweepConfig.endFreqMHz - this.sweepConfig.startFreqMHz) / (steps - 1);
    const sweepData = amplitudeData.map((amplitude, index) => ({
      frequency: this.sweepConfig.startFreqMHz + (index * freqStep),
      amplitude: amplitude
    }));
    
    // Emit data
    if (this.onData) {
      this.onData({
        type: 'sweep',
        timestamp: Date.now(),
        config: { ...this.sweepConfig },
        data: sweepData
      });
    }
    
    // Remove processed message from buffer
    this.buffer = this.buffer.slice(expectedLength);
    return true;
  }

  // Parse configuration response
  parseConfig() {
    // Config message format: $C<startFreq:7><freqSpan:7><ampTop:4><ampBottom:4>...
    const minLength = 30;
    
    if (this.buffer.length < minLength) return false;
    
    // Find end of line
    let eolIdx = -1;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] === 0x0D || this.buffer[i] === 0x0A) {
        eolIdx = i;
        break;
      }
    }
    
    if (eolIdx === -1 && this.buffer.length < 100) return false;
    if (eolIdx === -1) eolIdx = 50; // Fallback
    
    try {
      const configStr = new TextDecoder().decode(this.buffer.slice(2, eolIdx));
      
      // Parse configuration string
      // Format varies by firmware, this handles common format
      const startFreq = parseInt(configStr.substring(0, 7)) / 1000; // kHz to MHz
      const freqSpan = parseInt(configStr.substring(7, 14)) / 1000;
      
      this.sweepConfig.startFreqMHz = startFreq;
      this.sweepConfig.endFreqMHz = startFreq + freqSpan;
      
      if (this.onData) {
        this.onData({
          type: 'config',
          config: { ...this.sweepConfig }
        });
      }
    } catch (e) {
      console.error('Config parse error:', e);
    }
    
    this.buffer = this.buffer.slice(eolIdx + 1);
    return true;
  }

  // Parse other response messages
  parseResponse() {
    // Find end of message
    let eolIdx = -1;
    for (let i = 0; i < Math.min(this.buffer.length, 200); i++) {
      if (this.buffer[i] === 0x0D || this.buffer[i] === 0x0A) {
        eolIdx = i;
        break;
      }
    }
    
    if (eolIdx === -1) {
      if (this.buffer.length > 200) {
        this.buffer = this.buffer.slice(1);
      }
      return false;
    }
    
    // Process response if needed
    const response = new TextDecoder().decode(this.buffer.slice(0, eolIdx));
    console.log('RF Explorer response:', response);
    
    this.buffer = this.buffer.slice(eolIdx + 1);
    return true;
  }

  // Send command to RF Explorer
  async sendCommand(cmd) {
    const data = new TextEncoder().encode(cmd + '\r\n');
    
    if (this.connectionType === 'serial' && this.writer) {
      await this.writer.write(data);
    } else if (this.connectionType === 'websocket' && this.websocket) {
      this.websocket.send(JSON.stringify({ type: 'command', command: cmd }));
    }
  }

  // Request current configuration
  async requestConfig() {
    await this.sendCommand('#0C0');
  }

  // Set frequency range
  async setFrequencyRange(startMHz, endMHz) {
    // Convert to kHz for command
    const startKHz = Math.round(startMHz * 1000);
    const spanKHz = Math.round((endMHz - startMHz) * 1000);
    
    // Command format: #<size>C2-F:<start_khz>,<span_khz>
    const cmd = `#0C2-F:${startKHz.toString().padStart(7, '0')},${spanKHz.toString().padStart(7, '0')}`;
    await this.sendCommand(cmd);
    
    this.sweepConfig.startFreqMHz = startMHz;
    this.sweepConfig.endFreqMHz = endMHz;
  }

  // Enable/disable continuous sweep
  async setSweepMode(continuous = true) {
    if (continuous) {
      await this.sendCommand('#0C3'); // Start sweep
    } else {
      await this.sendCommand('#0CH'); // Hold/stop
    }
  }

  // Disconnect
  async disconnect() {
    this.isConnected = false;
    
    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (e) {}
      this.reader = null;
    }
    
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {}
      this.writer = null;
    }
    
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    this.connectionType = null;
    this.buffer = new Uint8Array(0);
    
    if (this.onConnectionChange) {
      this.onConnectionChange({ connected: false, type: null });
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatTimestamp = (date) => {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const formatFrequency = (mhz) => {
  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(3)} GHz`;
  }
  return `${mhz.toFixed(1)} MHz`;
};

const getSignalStrengthColor = (dbm) => {
  if (dbm > -50) return '#ef4444';
  if (dbm > -60) return '#f59e0b';
  if (dbm > -70) return '#eab308';
  if (dbm > -80) return '#22c55e';
  return '#06b6d4';
};

const getSignalQuality = (dbm) => {
  if (dbm > -50) return { label: 'INTERFERENCE', color: '#ef4444' };
  if (dbm > -60) return { label: 'CAUTION', color: '#f59e0b' };
  if (dbm > -70) return { label: 'MODERATE', color: '#eab308' };
  if (dbm > -80) return { label: 'GOOD', color: '#22c55e' };
  return { label: 'CLEAR', color: '#06b6d4' };
};

// ABOnAir 612 Frequency Bands
const ABONAIR_BANDS = [
  { id: 'band1', name: 'Band 1', range: '1.99-2.50 GHz', start: 1990, end: 2500, color: '#06b6d4' },
  { id: 'band2', name: 'Band 2', range: '4.90-6.00 GHz', start: 4900, end: 6000, color: '#8b5cf6' },
];

// Test Procedures Data
const TEST_PROCEDURES = [
  {
    id: 'initial-scan',
    name: 'Initial Site RF Scan',
    duration: '10-15 min',
    description: 'Comprehensive frequency sweep to identify existing RF activity',
    steps: [
      'Power on RF Explorer 6G WB Plus and allow 2-minute warm-up',
      'Connect RF Explorer to computer via USB',
      'Click "Connect Device" and select the RF Explorer port',
      'Set frequency range to 1.9 GHz - 6.1 GHz (covers both ABOnAir bands)',
      'Enable "Max Hold" mode in the monitor settings',
      'Walk the entire venue perimeter while monitoring',
      'Note any signals above -60 dBm threshold (marked in orange/red)',
      'Document WiFi access point locations',
      'Identify potential interference sources (LED walls, DMX, intercom systems)',
      'Record baseline noise floor readings using the peak markers'
    ],
    analysis: [
      'Noise floor below -80 dBm: Excellent conditions',
      'Noise floor -80 to -70 dBm: Good conditions, proceed with caution',
      'Noise floor -70 to -60 dBm: Marginal, consider alternative frequencies',
      'Noise floor above -60 dBm: Poor conditions, relocate or mitigate interference'
    ]
  },
  {
    id: 'frequency-selection',
    name: 'Frequency Selection Test',
    duration: '15-20 min',
    description: 'Identify optimal operating frequencies within ABOnAir bands',
    steps: [
      'Review initial scan results for clear frequency windows',
      'Use the band selector to focus on ABOnAir Band 1 (1.99-2.50 GHz)',
      'Enable "Average" mode and observe for 3 minutes',
      'Document quietest 40 MHz segments using peak markers',
      'Switch to Band 2 (4.90-6.00 GHz) and repeat',
      'Cross-reference with local WiFi channel allocations',
      'Verify FCC compliance for selected frequencies',
      'Document primary and backup frequency selections',
      'Test selected frequencies at all planned camera positions'
    ],
    analysis: [
      'Band 1 (2.4 GHz region): Higher WiFi congestion, better penetration',
      'Band 2 (5 GHz region): Less congestion, shorter range, requires better LOS',
      'Select frequencies at least 40 MHz away from strong signals',
      'Always have 2-3 backup frequencies documented'
    ]
  },
  {
    id: 'path-loss',
    name: 'Path Loss Assessment',
    duration: '20-30 min',
    description: 'Measure signal propagation throughout the venue',
    steps: [
      'Position ABOnAir TX at planned camera location',
      'Set TX to lowest power setting initially',
      'Position RX at planned receiver location',
      'Use RF Explorer to measure TX signal strength at RX position',
      'Record signal strength - this is your reference level',
      'Walk TX through all planned camera movement areas',
      'Monitor signal strength variations in real-time',
      'Use event logging to mark dead zones (enable auto-logging)',
      'Identify multipath reflection sources (metal structures, glass)',
      'Document minimum signal margin requirements',
      'Increase TX power if needed to maintain >6 dB margin'
    ],
    analysis: [
      'Signal margin >12 dB: Excellent, full mobility',
      'Signal margin 6-12 dB: Good, monitor during event',
      'Signal margin <6 dB: Critical, optimize antenna placement',
      'Dead zones require antenna repositioning or diversity RX'
    ]
  },
  {
    id: 'interference-test',
    name: 'Dynamic Interference Test',
    duration: '30+ min',
    description: 'Simulate event conditions to identify time-variant interference',
    steps: [
      'Coordinate with venue to activate all production equipment',
      'Turn on LED walls, lighting rigs, intercom systems',
      'Enable WiFi networks at expected capacity',
      'Enable continuous logging in the monitor tab',
      'Set alert thresholds: Warning at -65 dBm, Critical at -55 dBm',
      'Monitor for 30+ minutes during equipment operation',
      'Review event log for periodic interference patterns',
      'Test with crowd simulation if possible (RF badges, phones)',
      'Export the event log for documentation',
      'Identify interference windows and correlate to equipment'
    ],
    analysis: [
      'Stable noise floor: Proceed with selected frequencies',
      'Periodic spikes: Identify source, consider frequency agility',
      'Continuous interference: Change frequencies or mitigate source',
      'Document all interference sources for event day reference'
    ]
  }
];

// Antenna Configurations
const ANTENNA_CONFIGS = [
  {
    id: 'standard-omni',
    name: 'Standard Omnidirectional',
    txAntenna: 'Integrated Omni',
    rxAntenna: 'Dual Omni Diversity',
    bestFor: ['Small venues (<5,000 sq ft)', 'Stationary cameras', '360° coverage needed'],
    range: '100-200 ft typical',
    pros: ['Simple setup', 'No pointing required', 'Good for unpredictable movement'],
    cons: ['Limited range', 'Susceptible to multipath', 'Lower gain'],
    setup: [
      'Mount RX antennas at least 6 ft apart for diversity',
      'Position antennas above crowd level (8-10 ft minimum)',
      'Avoid metal structures within 3 ft of antennas',
      'Keep antennas vertical for optimal pattern'
    ]
  },
  {
    id: 'directional-panel',
    name: 'Directional Panel Array',
    txAntenna: 'Integrated Omni on TX',
    rxAntenna: 'Dual Panel Directional',
    bestFor: ['Large venues (>10,000 sq ft)', 'Defined camera zones', 'Long throw distances'],
    range: '300-500 ft typical',
    pros: ['Extended range', 'Better interference rejection', 'Higher gain'],
    cons: ['Narrower coverage area', 'Requires careful aiming', 'Multiple panels for full coverage'],
    setup: [
      'Calculate coverage angle needed (typically 60-90° panels)',
      'Mount panels at venue perimeter pointing toward camera areas',
      'Overlap panel coverage zones by 20% minimum',
      'Tilt panels down 5-10° for ground-level coverage',
      'Use antenna alignment tool or live signal monitoring'
    ]
  },
  {
    id: 'hybrid-diversity',
    name: 'Hybrid Diversity System',
    txAntenna: 'High-gain whip or directional',
    rxAntenna: 'Mixed omni + directional array',
    bestFor: ['Complex venues', 'Multiple camera operators', 'High reliability requirements'],
    range: '200-400 ft typical',
    pros: ['Maximum coverage flexibility', 'Redundant reception paths', 'Handles multipath well'],
    cons: ['Complex setup', 'More equipment', 'Requires expertise'],
    setup: [
      'Position directional antennas for primary coverage areas',
      'Add omni antennas to fill gaps and handle unexpected positions',
      'Use antenna distribution amplifier if needed',
      'Configure diversity receiver for best signal selection',
      'Test all antenna combinations before event'
    ]
  },
  {
    id: 'mimo-config',
    name: 'MIMO Configuration',
    txAntenna: 'Dual TX antenna (if supported)',
    rxAntenna: 'Quad diversity array',
    bestFor: ['Challenging RF environments', 'Maximum throughput needed', 'Multipath-heavy venues'],
    range: '150-300 ft typical',
    pros: ['Highest throughput', 'Best multipath handling', 'Spatial diversity'],
    cons: ['Most complex setup', 'Requires MIMO-capable units', 'Higher cost'],
    setup: [
      'Space TX antennas minimum 1/2 wavelength apart',
      'Position RX antennas in spatial diversity pattern',
      'Ensure clear LOS to at least 2 RX antennas',
      'Configure for MIMO mode in ABOnAir settings',
      'Verify MIMO link established before event'
    ]
  }
];

// Best Practices Data
const BEST_PRACTICES = [
  {
    category: 'Pre-Event Planning',
    icon: FileText,
    practices: [
      { title: 'Advance Site Survey', description: 'Visit venue 1-2 weeks before event to conduct full RF assessment', priority: 'critical' },
      { title: 'Frequency Coordination', description: 'Contact venue RF coordinator and other production teams to avoid conflicts', priority: 'critical' },
      { title: 'Backup Equipment', description: 'Always carry spare TX/RX units and antenna cables', priority: 'high' },
      { title: 'Documentation', description: 'Create venue-specific RF profile with frequencies, antenna positions, and known issues', priority: 'high' },
      { title: 'Power Planning', description: 'Ensure clean, dedicated power circuits for RF equipment', priority: 'medium' }
    ]
  },
  {
    category: 'Antenna Placement',
    icon: Antenna,
    practices: [
      { title: 'Height Advantage', description: 'Mount RX antennas 8-12 ft high, above crowd level', priority: 'critical' },
      { title: 'Line of Sight', description: 'Maintain clear LOS between TX and at least one RX antenna', priority: 'critical' },
      { title: 'Diversity Spacing', description: 'Space diversity antennas minimum 6 ft apart, ideally 10+ ft', priority: 'high' },
      { title: 'Avoid Metal', description: 'Keep antennas 3+ ft from metal structures, LED walls, truss', priority: 'high' },
      { title: 'Cable Runs', description: 'Use low-loss coax, keep runs under 50 ft, use amplifiers for longer runs', priority: 'medium' }
    ]
  },
  {
    category: 'Interference Mitigation',
    icon: AlertTriangle,
    practices: [
      { title: 'WiFi Coordination', description: 'Request production WiFi on non-overlapping channels, disable unused APs', priority: 'critical' },
      { title: 'LED Wall Isolation', description: 'Position antennas minimum 15 ft from LED processors and power supplies', priority: 'high' },
      { title: 'Intercom Separation', description: 'Coordinate with intercom frequencies, maintain 100+ MHz separation', priority: 'high' },
      { title: 'DMX/Lighting', description: 'Keep RF equipment away from lighting dimmers and DMX transmitters', priority: 'medium' },
      { title: 'Crowd Factor', description: 'Account for 3-6 dB additional absorption when venue fills with people', priority: 'medium' }
    ]
  },
  {
    category: 'During Event',
    icon: Activity,
    practices: [
      { title: 'Continuous Monitoring', description: 'Keep RF Explorer running throughout event, log anomalies', priority: 'critical' },
      { title: 'Signal Margin', description: 'Maintain minimum 6 dB signal margin, alert at 3 dB', priority: 'critical' },
      { title: 'Frequency Agility', description: 'Have backup frequencies programmed and ready to switch', priority: 'high' },
      { title: 'Communication', description: 'Maintain contact with video village, report any RF concerns immediately', priority: 'high' },
      { title: 'Battery Management', description: 'Swap TX batteries proactively, dont wait for low battery warnings', priority: 'medium' }
    ]
  },
  {
    category: 'Venue-Specific',
    icon: MapPin,
    practices: [
      { title: 'Convention Centers', description: 'Expect heavy WiFi, coordinate with facility RF manager, use 5 GHz band', priority: 'high' },
      { title: 'Stadiums/Arenas', description: 'Account for DAS systems, metal structures, extreme distances', priority: 'high' },
      { title: 'Hotels/Ballrooms', description: 'Watch for partition walls with metal frames, adjacent room interference', priority: 'medium' },
      { title: 'Outdoor Events', description: 'Weather-protect equipment, account for atmospheric conditions', priority: 'medium' },
      { title: 'Broadcast Trucks', description: 'Coordinate with all wireless users, expect compressed RF space', priority: 'critical' }
    ]
  }
];

// Scenario Templates
const SCENARIO_TEMPLATES = [
  { id: 'corporate', name: 'Corporate Event', venue: 'Hotel Ballroom', audience: '500-1000', challenges: ['WiFi heavy', 'LED walls', 'Quick setup'] },
  { id: 'concert', name: 'Concert/Festival', venue: 'Outdoor Stage', audience: '5000+', challenges: ['Long distances', 'Weather', 'Multiple stages'] },
  { id: 'sports', name: 'Sporting Event', venue: 'Arena/Stadium', audience: '10000+', challenges: ['Metal structures', 'DAS interference', 'Mobile cameras'] },
  { id: 'broadcast', name: 'Broadcast Studio', venue: 'TV Studio', audience: 'N/A', challenges: ['RF congestion', 'Precision required', 'Zero tolerance'] },
  { id: 'conference', name: 'Trade Show', venue: 'Convention Center', audience: '1000+', challenges: ['Extreme WiFi', 'Adjacent booths', 'Moving exhibits'] },
];

// ============================================================================
// INTELLIGENT ANTENNA RECOMMENDATION ENGINE
// ============================================================================

function determineOptimalAntennaConfig(testResults, siteProfile, eventLog) {
  logger.info('AntennaEngine', 'Determining optimal antenna configuration', { testResults: testResults.length, siteProfile });
  
  const factors = {
    venueSize: 0,
    interference: 0,
    multipath: 0,
    distance: 0,
    complexity: 0
  };
  
  // Analyze test results
  testResults.forEach(result => {
    if (result.testId === 'venue-walk') {
      if (result.result?.weakSpots > 5) {
        factors.multipath += 2;
        factors.complexity += 1;
      }
      if (result.result?.maxDistance > 200) {
        factors.distance += 2;
        factors.venueSize += 1;
      }
    }
    
    if (result.testId === 'interference-scan') {
      const interferenceCount = result.result?.interferenceCount || 0;
      if (interferenceCount > 10) {
        factors.interference += 2;
      } else if (interferenceCount > 5) {
        factors.interference += 1;
      }
    }
    
    if (result.testId === 'los-test') {
      if (!result.result?.hasLOS) {
        factors.multipath += 2;
        factors.complexity += 1;
      }
    }
  });
  
  // Analyze event log for interference
  const criticalEvents = eventLog.filter(e => e.type === 'critical').length;
  if (criticalEvents > 10) {
    factors.interference += 2;
  }
  
  // Analyze site profile
  const venueType = siteProfile.venueType?.toLowerCase() || '';
  if (venueType.includes('stadium') || venueType.includes('arena') || venueType.includes('convention')) {
    factors.venueSize += 2;
    factors.distance += 2;
  }
  
  // Determine recommendation
  let recommendedConfig = 'standard-omni';
  let confidence = 'medium';
  let reasoning = [];
  
  if (factors.distance >= 3 || factors.venueSize >= 3) {
    recommendedConfig = 'directional-panel';
    reasoning.push('Large venue size requires directional antennas for extended range');
    confidence = 'high';
  } else if (factors.interference >= 3) {
    recommendedConfig = 'mimo-config';
    reasoning.push('High interference environment benefits from MIMO spatial diversity');
    confidence = 'high';
  } else if (factors.multipath >= 3 || factors.complexity >= 2) {
    recommendedConfig = 'hybrid-diversity';
    reasoning.push('Complex venue layout requires hybrid diversity system');
    confidence = 'medium';
  } else {
    reasoning.push('Standard omnidirectional setup sufficient for this venue');
    confidence = 'medium';
  }
  
  logger.info('AntennaEngine', `Recommended: ${recommendedConfig}`, { confidence, factors, reasoning });
  
  return {
    configId: recommendedConfig,
    confidence,
    reasoning,
    factors
  };
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function RFSiteAssessment() {
  // Connection state
  const rfConnectionRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, type: null });
  const [connectionError, setConnectionError] = useState(null);
  const [isWebSerialSupported, setIsWebSerialSupported] = useState(false);
  
  // Address autocomplete refs
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  
  // Application state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [eventLog, setEventLog] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedAntenna, setSelectedAntenna] = useState(null);
  const [antennaRecommendation, setAntennaRecommendation] = useState(null);
  
  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState({
    // Basic Info
    showName: '',
    setupDate: new Date().toISOString().split('T')[0],
    showStartDate: '',
    showEndDate: '',
    venueName: '',
    venueType: '',
    venueAddress: '',
    locationData: null,
    // Test procedure tracking
    completedTests: {},
    testNotes: {}
  });
  
  const [siteProfile, setSiteProfile] = useState({
    venueName: '',
    venueType: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [testResults, setTestResults] = useState([]);
  
  // Spectrum data state
  const [spectrumData, setSpectrumData] = useState([]);
  const [maxHoldData, setMaxHoldData] = useState([]);
  const [avgData, setAvgData] = useState([]);
  const [peakMarkers, setPeakMarkers] = useState([]);
  
  // Monitor settings
  const [monitorSettings, setMonitorSettings] = useState({
    startFreqMHz: 1990,
    endFreqMHz: 6000,
    showMaxHold: false,
    showAverage: false,
    autoLog: true,
    warningThreshold: -65,
    criticalThreshold: -55,
    selectedBand: 'full' // 'full', 'band1', 'band2'
  });
  
  // Show connection modal
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [wsUrl, setWsUrl] = useState('ws://localhost:8765');
  
  // Interference analysis data
  const [interferenceData, setInterferenceData] = useState(null);
  const [loadingInterference, setLoadingInterference] = useState(false);
  const [interferenceHistory, setInterferenceHistory] = useState([]);
  const [showInterferenceHistory, setShowInterferenceHistory] = useState(false);
  
  // Venue search state
  const [venueSearchResults, setVenueSearchResults] = useState([]);
  const [searchingVenues, setSearchingVenues] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);

  // Load saved wizard data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('rfShowProfile');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setWizardData(parsed);
        setSiteProfile({
          venueName: parsed.venueName,
          venueType: parsed.venueType,
          date: parsed.setupDate,
          notes: ''
        });
        logger.info('App', 'Loaded saved show profile from localStorage', { showName: parsed.showName });
      } catch (e) {
        logger.error('App', 'Failed to load saved profile', { error: e.message });
      }
    }
  }, []);

  // Save wizard data to localStorage whenever it changes
  useEffect(() => {
    if (wizardData.showName) {
      localStorage.setItem('rfShowProfile', JSON.stringify(wizardData));
      logger.debug('App', 'Saved show profile to localStorage');
    }
  }, [wizardData]);

  // Initialize Geoapify address autocomplete - TEMPORARILY DISABLED FOR DEBUGGING
  /*
  useEffect(() => {
    if (showWizard && wizardStep === 0 && !wizardData.venueName && addressInputRef.current) {
      // Clean up existing autocomplete if any
      if (autocompleteRef.current) {
        autocompleteRef.current = null;
      }

      // Wait for Geoapify library to be available and DOM to be ready
      const initAutocomplete = () => {
        if (!window.geoapify) {
          logger.warn('Wizard', 'Geoapify library not loaded yet, retrying...');
          setTimeout(initAutocomplete, 100);
          return;
        }

        if (!addressInputRef.current) {
          logger.warn('Wizard', 'Address input ref not available, retrying...');
          setTimeout(initAutocomplete, 100);
          return;
        }

        try {
          const autocomplete = new window.geoapify.GeocoderAutocomplete(
            addressInputRef.current,
            GEOAPIFY_API_KEY,
            {
              placeholder: 'Search for venue (e.g., Hilton Downtown, Convention Center)...',
              type: 'amenity',
              lang: 'en',
              limit: 5
            }
          );

          autocomplete.on('select', (location) => {
            if (location) {
              const placeName = location.properties.name || location.properties.address_line1 || '';
              const address = location.properties.formatted || '';
              const city = location.properties.city || '';
              const state = location.properties.state || '';
              const country = location.properties.country || '';
              
              setWizardData(prev => ({
                ...prev,
                venueName: placeName,
                venueAddress: address,
                locationData: {
                  city,
                  state,
                  country,
                  lat: location.properties.lat,
                  lon: location.properties.lon,
                  formatted: address
                }
              }));

              logger.info('Wizard', 'Venue selected', { venueName: placeName, address, city, state });
            }
          });

          autocompleteRef.current = autocomplete;
          logger.debug('Wizard', 'Geoapify autocomplete initialized');
        } catch (error) {
          logger.error('Wizard', 'Failed to initialize address autocomplete', { error: error.message });
        }
      };

      // Small delay to ensure DOM is ready
      setTimeout(initAutocomplete, 100);
    }

    // Cleanup
    return () => {
      if (autocompleteRef.current) {
        autocompleteRef.current = null;
      }
    };
  }, [showWizard, wizardStep, wizardData.venueName]);
  */
  
  // Fetch interference data when venue location is selected
  useEffect(() => {
    if (wizardData.locationData?.lat && wizardData.locationData?.lon) {
      fetchInterferenceData();
    }
  }, [wizardData.locationData]);
  
  // Function to fetch and cache interference data
  const fetchInterferenceData = useCallback(() => {
    if (!wizardData.locationData?.lat || !wizardData.locationData?.lon) return;
    
    setLoadingInterference(true);
    
    getNearbyInterferenceSources(wizardData.locationData.lat, wizardData.locationData.lon)
      .then(data => {
        const timestampedData = {
          ...data,
          timestamp: new Date().toISOString(),
          venueName: wizardData.venueName,
          venueAddress: wizardData.venueAddress,
          coordinates: {
            lat: wizardData.locationData.lat,
            lon: wizardData.locationData.lon
          }
        };
        
        setInterferenceData(timestampedData);
        
        // Add to history (keep last 10 reports)
        setInterferenceHistory(prev => {
          const updated = [timestampedData, ...prev].slice(0, 10);
          // Save to localStorage
          localStorage.setItem('rfInterferenceHistory', JSON.stringify(updated));
          return updated;
        });
        
        logger.info('Wizard', 'Interference analysis complete', { 
          riskCount: data.risks.length,
          cellTowers: data.cellTowers.length,
          timestamp: timestampedData.timestamp
        });
      })
      .catch(error => {
        logger.error('Wizard', 'Failed to fetch interference data', { error: error.message });
      })
      .finally(() => {
        setLoadingInterference(false);
      });
  }, [wizardData.locationData, wizardData.venueName, wizardData.venueAddress]);
  
  // Load interference history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('rfInterferenceHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setInterferenceHistory(parsed);
        logger.info('App', 'Loaded interference history from localStorage', { count: parsed.length });
      } catch (e) {
        logger.error('App', 'Failed to load interference history', { error: e.message });
      }
    }
  }, []);
  
  // Search venues using Geoapify Geocoding API
  const searchVenues = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setVenueSearchResults([]);
      setShowVenueDropdown(false);
      return;
    }
    
    setSearchingVenues(true);
    
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&type=amenity&limit=5&apiKey=${GEOAPIFY_API_KEY}`
      );
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setVenueSearchResults(data.features || []);
      setShowVenueDropdown(true);
      
      logger.debug('Wizard', 'Venue search complete', { query, resultCount: data.features?.length || 0 });
    } catch (error) {
      logger.error('Wizard', 'Venue search failed', { error: error.message });
      setVenueSearchResults([]);
    } finally {
      setSearchingVenues(false);
    }
  }, []);
  
  // Debounce venue search
  useEffect(() => {
    if (!showWizard || wizardStep !== 0) return;
    
    const timer = setTimeout(() => {
      if (wizardData.venueName && !wizardData.locationData) {
        searchVenues(wizardData.venueName);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [wizardData.venueName, wizardData.locationData, showWizard, wizardStep, searchVenues]);

  // Initialize connection manager
  useEffect(() => {
    rfConnectionRef.current = new RFExplorerConnection();
    setIsWebSerialSupported(RFExplorerConnection.isWebSerialSupported());
    
    // Set up callbacks
    rfConnectionRef.current.onConnectionChange = (status) => {
      setConnectionStatus(status);
      if (status.connected) {
        setConnectionError(null);
        setShowConnectionModal(false);
      }
    };
    
    rfConnectionRef.current.onError = (error) => {
      setConnectionError(error.message || 'Connection error');
      console.error('RF Explorer error:', error);
    };
    
    rfConnectionRef.current.onData = (data) => {
      if (data.type === 'sweep') {
        handleSweepData(data);
      } else if (data.type === 'config') {
        setMonitorSettings(prev => ({
          ...prev,
          startFreqMHz: data.config.startFreqMHz,
          endFreqMHz: data.config.endFreqMHz
        }));
      }
    };
    
    return () => {
      if (rfConnectionRef.current) {
        rfConnectionRef.current.disconnect();
      }
    };
  }, []);

  // Handle incoming sweep data
  const handleSweepData = useCallback((sweepData) => {
    const { data, timestamp } = sweepData;
    
    setSpectrumData(data);
    
    // Update max hold
    setMaxHoldData(prev => {
      if (prev.length !== data.length) return data;
      return data.map((point, i) => ({
        frequency: point.frequency,
        amplitude: Math.max(point.amplitude, prev[i]?.amplitude || -120)
      }));
    });
    
    // Update average (simple moving average)
    setAvgData(prev => {
      if (prev.length !== data.length) return data;
      return data.map((point, i) => ({
        frequency: point.frequency,
        amplitude: (point.amplitude + (prev[i]?.amplitude || point.amplitude) * 9) / 10
      }));
    });
    
    // Find peaks
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i].amplitude > data[i-1].amplitude && 
          data[i].amplitude > data[i+1].amplitude &&
          data[i].amplitude > -70) {
        peaks.push(data[i]);
      }
    }
    peaks.sort((a, b) => b.amplitude - a.amplitude);
    setPeakMarkers(peaks.slice(0, 5));
    
    // Auto-log events
    if (monitorSettings.autoLog) {
      data.forEach(point => {
        if (point.amplitude > monitorSettings.criticalThreshold) {
          const newEvent = {
            id: Date.now() + Math.random(),
            timestamp: new Date(timestamp),
            type: 'critical',
            frequency: point.frequency,
            strength: point.amplitude.toFixed(1),
            message: `Critical interference at ${formatFrequency(point.frequency)}: ${point.amplitude.toFixed(1)} dBm`
          };
          setEventLog(prev => [newEvent, ...prev].slice(0, 500));
        } else if (point.amplitude > monitorSettings.warningThreshold && Math.random() > 0.95) {
          const newEvent = {
            id: Date.now() + Math.random(),
            timestamp: new Date(timestamp),
            type: 'warning',
            frequency: point.frequency,
            strength: point.amplitude.toFixed(1),
            message: `Elevated signal at ${formatFrequency(point.frequency)}: ${point.amplitude.toFixed(1)} dBm`
          };
          setEventLog(prev => [newEvent, ...prev].slice(0, 500));
        }
      });
    }
  }, [monitorSettings.autoLog, monitorSettings.criticalThreshold, monitorSettings.warningThreshold]);

  // Connect to RF Explorer
  const connectDevice = async (method = 'serial') => {
    try {
      logger.info('Connection', `Attempting to connect via ${method}`, { method });
      setConnectionError(null);
      if (method === 'serial') {
        await rfConnectionRef.current.connectSerial();
      } else {
        await rfConnectionRef.current.connectWebSocket(wsUrl);
      }
      setIsMonitoring(true);
      logger.info('Connection', `Successfully connected via ${method}`, { method });
    } catch (error) {
      logger.error('Connection', 'Failed to connect', { method, error: error.message });
      setConnectionError(error.message);
    }
  };

  // Disconnect
  const disconnectDevice = async () => {
    logger.info('Connection', 'Disconnecting device');
    setIsMonitoring(false);
    await rfConnectionRef.current.disconnect();
    logger.info('Connection', 'Device disconnected');
  };

  // Set frequency band
  const setFrequencyBand = async (band) => {
    logger.debug('Monitor', `Setting frequency band: ${band}`);
    let start, end;
    switch (band) {
      case 'band1':
        start = 1990;
        end = 2500;
        break;
      case 'band2':
        start = 4900;
        end = 6000;
        break;
      default:
        start = 1990;
        end = 6000;
    }
    
    setMonitorSettings(prev => ({ ...prev, selectedBand: band, startFreqMHz: start, endFreqMHz: end }));
    
    if (connectionStatus.connected) {
      await rfConnectionRef.current.setFrequencyRange(start, end);
    }
    
    // Reset hold data
    setMaxHoldData([]);
    setAvgData([]);
    logger.info('Monitor', `Frequency band set to ${band}`, { start, end });
  };

  // Clear max hold
  const clearMaxHold = () => {
    setMaxHoldData([]);
    setAvgData([]);
  };

  // Simulate data for demo mode (when not connected)
  useEffect(() => {
    if (isMonitoring && !connectionStatus.connected) {
      const interval = setInterval(() => {
        const { startFreqMHz, endFreqMHz } = monitorSettings;
        const steps = 112;
        const freqStep = (endFreqMHz - startFreqMHz) / (steps - 1);
        
        const newData = Array.from({ length: steps }, (_, i) => {
          const freq = startFreqMHz + (i * freqStep);
          const baseNoise = -85 + Math.random() * 8;
          
          // Simulate some signals
          let signalBoost = 0;
          
          // WiFi in 2.4 GHz
          if (freq > 2400 && freq < 2500) {
            if (Math.abs(freq - 2412) < 15 || Math.abs(freq - 2437) < 15 || Math.abs(freq - 2462) < 15) {
              signalBoost = 15 + Math.random() * 20;
            }
          }
          
          // WiFi in 5 GHz
          if (freq > 5100 && freq < 5900) {
            if (Math.random() > 0.85) {
              signalBoost = 10 + Math.random() * 15;
            }
          }
          
          // Random interference
          if (Math.random() > 0.97) {
            signalBoost = Math.max(signalBoost, 20 + Math.random() * 25);
          }
          
          return {
            frequency: freq,
            amplitude: baseNoise + signalBoost
          };
        });
        
        handleSweepData({
          type: 'sweep',
          timestamp: Date.now(),
          data: newData
        });
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [isMonitoring, connectionStatus.connected, monitorSettings.startFreqMHz, monitorSettings.endFreqMHz, handleSweepData]);

  // Calculate antenna recommendation when tests complete
  useEffect(() => {
    if (testResults.length >= 2) {
      logger.info('App', 'Calculating antenna recommendation', { testCount: testResults.length });
      const recommendation = determineOptimalAntennaConfig(testResults, siteProfile, eventLog);
      setAntennaRecommendation(recommendation);
    }
  }, [testResults, siteProfile, eventLog]);

  const addTestResult = (testId, result) => {
    const test = TEST_PROCEDURES.find(t => t.id === testId);
    logger.info('Tests', `Test completed: ${test?.name || testId}`, { testId, passed: result.passed });
    setTestResults(prev => [...prev, {
      id: Date.now(),
      testId,
      testName: test?.name || testId,
      timestamp: new Date(),
      result,
      status: result.passed ? 'pass' : 'fail'
    }]);
  };

  const exportReport = () => {
    logger.info('Reports', 'Exporting assessment report', { 
      testCount: testResults.length, 
      eventCount: eventLog.length 
    });
    const report = {
      siteProfile,
      testResults,
      eventLog: eventLog.slice(0, 100),
      peakMarkers,
      monitorSettings,
      generatedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rf-assessment-${siteProfile.venueName || 'unnamed'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const exportEventLog = () => {
    const csv = [
      ['Timestamp', 'Type', 'Frequency (MHz)', 'Strength (dBm)', 'Message'].join(','),
      ...eventLog.map(e => [
        e.timestamp.toISOString(),
        e.type,
        e.frequency.toFixed(2),
        e.strength,
        `"${e.message}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rf-event-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'tests', label: 'Site Tests', icon: Activity },
    { id: 'antennas', label: 'Antenna Guide', icon: Antenna },
    { id: 'monitor', label: 'Live Monitor', icon: Radio },
    { id: 'bestpractices', label: 'Best Practices', icon: BookOpen },
    { id: 'results', label: 'Results & Reports', icon: FileText },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0e14',
      color: '#c5cdd9',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace"
    }}>
      {/* Connection Modal */}
      {showConnectionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#141a23',
            borderRadius: '12px',
            border: '1px solid #2d3748',
            padding: '24px',
            width: '90%',
            maxWidth: '500px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', color: '#e6edf3', margin: 0 }}>Connect RF Explorer</h2>
              <button 
                onClick={() => setShowConnectionModal(false)}
                style={{ background: 'none', border: 'none', color: '#6b7785', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            
            {connectionError && (
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#ef4444'
              }}>
                {connectionError}
              </div>
            )}
            
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', color: '#c5cdd9', marginBottom: '12px' }}>Option 1: USB Serial (Recommended)</h3>
              <p style={{ fontSize: '12px', color: '#6b7785', marginBottom: '12px' }}>
                Connect your RF Explorer 6G WB Plus via USB. Requires Chrome or Edge browser.
              </p>
              <button
                onClick={() => connectDevice('serial')}
                disabled={!isWebSerialSupported}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: isWebSerialSupported ? '#166534' : '#1e2730',
                  border: 'none',
                  borderRadius: '6px',
                  color: isWebSerialSupported ? '#fff' : '#6b7785',
                  fontSize: '14px',
                  cursor: isWebSerialSupported ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Usb size={18} />
                {isWebSerialSupported ? 'Connect via USB' : 'Web Serial Not Supported'}
              </button>
              {!isWebSerialSupported && (
                <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '8px' }}>
                  Your browser doesn't support Web Serial API. Use Chrome or Edge, or try the WebSocket option below.
                </p>
              )}
            </div>
            
            <div style={{ borderTop: '1px solid #2d3748', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '14px', color: '#c5cdd9', marginBottom: '12px' }}>Option 2: WebSocket Bridge</h3>
              <p style={{ fontSize: '12px', color: '#6b7785', marginBottom: '12px' }}>
                Connect via a local bridge application. Run the bridge server first.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://localhost:8765"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    backgroundColor: '#0d1117',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    color: '#e6edf3',
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={() => connectDevice('websocket')}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#1e2730',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    color: '#c5cdd9',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Connect
                </button>
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #2d3748', paddingTop: '20px', marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', color: '#c5cdd9', marginBottom: '12px' }}>Demo Mode</h3>
              <p style={{ fontSize: '12px', color: '#6b7785', marginBottom: '12px' }}>
                Run with simulated data to explore the interface.
              </p>
              <button
                onClick={() => { setShowConnectionModal(false); setIsMonitoring(true); }}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#1e2730',
                  border: '1px solid #2d3748',
                  borderRadius: '6px',
                  color: '#c5cdd9',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Start Demo Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        background: 'linear-gradient(180deg, #141a23 0%, #0d1117 100%)',
        borderBottom: '1px solid #1e2730',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)'
          }}>
            <Signal size={24} color="#0a0e14" strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{ 
              fontSize: '18px', 
              fontWeight: '600', 
              color: '#e6edf3',
              letterSpacing: '-0.02em',
              margin: 0
            }}>
              RF SITE ASSESSMENT
            </h1>
            <p style={{ 
              fontSize: '11px', 
              color: '#6b7785',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              margin: '2px 0 0 0'
            }}>
              ABOnAir 612 + RF Explorer 6G WB Plus
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Clear Cache Button - TEMPORARY */}
          <button
            onClick={() => {
              if (confirm('Clear all cached data? This will reset the app and reload.')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#991b1b',
              borderRadius: '6px',
              border: '1px solid #dc2626',
              color: '#fecaca',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={12} />
            Clear All Data
          </button>
          
          {/* Connection Status */}
          <button
            onClick={() => connectionStatus.connected ? disconnectDevice() : setShowConnectionModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              backgroundColor: connectionStatus.connected ? 'rgba(34, 197, 94, 0.15)' : '#1e2730',
              borderRadius: '6px',
              border: `1px solid ${connectionStatus.connected ? 'rgba(34, 197, 94, 0.3)' : '#2d3748'}`,
              color: connectionStatus.connected ? '#22c55e' : '#c5cdd9',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Usb size={14} />
            {connectionStatus.connected 
              ? `Connected (${connectionStatus.type === 'serial' ? 'USB' : 'WebSocket'})`
              : 'Connect Device'
            }
          </button>
          
          {/* Monitoring Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: isMonitoring ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 119, 133, 0.15)',
            borderRadius: '6px',
            border: `1px solid ${isMonitoring ? 'rgba(34, 197, 94, 0.3)' : 'rgba(107, 119, 133, 0.3)'}`
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isMonitoring ? '#22c55e' : '#6b7785',
              boxShadow: isMonitoring ? '0 0 8px #22c55e' : 'none',
              animation: isMonitoring ? 'pulse 2s infinite' : 'none'
            }} />
            <span style={{ fontSize: '12px', color: isMonitoring ? '#22c55e' : '#6b7785' }}>
              {isMonitoring ? (connectionStatus.connected ? 'LIVE' : 'DEMO') : 'STANDBY'}
            </span>
          </div>
          
          <button
            onClick={exportReport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#1e2730',
              border: '1px solid #2d3748',
              borderRadius: '6px',
              color: '#c5cdd9',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={{
        display: 'flex',
        gap: '4px',
        padding: '12px 24px',
        backgroundColor: '#0d1117',
        borderBottom: '1px solid #1e2730',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: isActive ? '#1a2332' : 'transparent',
                border: isActive ? '1px solid #2d3f59' : '1px solid transparent',
                borderRadius: '6px',
                color: isActive ? '#06b6d4' : '#6b7785',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Setup Wizard Modal */}
      {showWizard && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.95)',
          zIndex: 2000,
          overflow: 'auto',
          padding: '40px 20px'
        }}>
          <div style={{
            maxWidth: '1000px',
            margin: '0 auto',
            backgroundColor: '#141a23',
            borderRadius: '16px',
            border: '2px solid #2d3748',
            overflow: 'hidden'
          }}>
            {/* Wizard Header with Progress */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #2d3748',
              backgroundColor: '#1a2332'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '24px', color: '#e6edf3', margin: 0, fontWeight: '600' }}>
                  {wizardStep === 0 ? 'Show Setup Wizard' : `Step ${wizardStep} of ${TEST_PROCEDURES.length}`}
                </h2>
                <button
                  onClick={() => {
                    if (wizardData.showName) {
                      setShowWizard(false);
                      logger.info('Wizard', 'Wizard closed - show profile exists');
                    } else if (confirm('Are you sure? Your progress will not be saved.')) {
                      setShowWizard(false);
                      logger.warn('Wizard', 'Wizard closed without saving');
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7785',
                    cursor: 'pointer',
                    padding: '8px'
                  }}
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* Progress Tracker */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px'
              }}>
                {/* Getting Started Step */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'fit-content' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: wizardStep === 0 ? '#06b6d4' : wizardStep > 0 ? '#166534' : '#2d3748',
                    transition: 'all 0.3s'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: wizardStep === 0 ? '#0a0e14' : wizardStep > 0 ? '#22c55e' : '#6b7785',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: wizardStep === 0 ? '#06b6d4' : '#0a0e14'
                    }}>
                      {wizardStep > 0 ? '✓' : '0'}
                    </div>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: wizardStep === 0 ? '#0a0e14' : '#e6edf3'
                    }}>
                      Getting Started
                    </span>
                  </div>
                  {TEST_PROCEDURES.length > 0 && (
                    <div style={{
                      width: '24px',
                      height: '2px',
                      backgroundColor: wizardStep > 0 ? '#06b6d4' : '#2d3748'
                    }} />
                  )}
                </div>

                {/* Test Procedure Steps */}
                {TEST_PROCEDURES.map((test, idx) => {
                  const stepNum = idx + 1;
                  const isActive = wizardStep === stepNum;
                  const isCompleted = wizardStep > stepNum;
                  
                  return (
                    <div key={test.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'fit-content' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: isActive ? '#06b6d4' : isCompleted ? '#166534' : '#2d3748',
                        transition: 'all 0.3s'
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: isActive ? '#0a0e14' : isCompleted ? '#22c55e' : '#6b7785',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: isActive ? '#06b6d4' : '#0a0e14'
                        }}>
                          {isCompleted ? '✓' : stepNum}
                        </div>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: isActive ? '#0a0e14' : '#e6edf3',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {test.name}
                        </span>
                      </div>
                      {idx < TEST_PROCEDURES.length - 1 && (
                        <div style={{
                          width: '24px',
                          height: '2px',
                          backgroundColor: isCompleted ? '#06b6d4' : '#2d3748'
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Wizard Content */}
            <div style={{ padding: '40px' }}>
              {/* Step 0: Basic Information */}
              {wizardStep === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '20px', color: '#e6edf3', margin: 0 }}>
                      Getting Started
                    </h3>
                  </div>

                  <div style={{ display: 'grid', gap: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                          SHOW NAME *
                        </label>
                        <input
                          type="text"
                          value={wizardData.showName}
                          onChange={(e) => setWizardData(prev => ({ ...prev, showName: e.target.value }))}
                          placeholder="e.g., Annual Corporate Gala 2026"
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: '#0d1117',
                            border: '2px solid #2d3748',
                            borderRadius: '8px',
                            color: '#e6edf3',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                          SETUP DATE *
                        </label>
                        <input
                          type="date"
                          value={wizardData.setupDate}
                          onChange={(e) => setWizardData(prev => ({ ...prev, setupDate: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: '#1a2332',
                            border: '2px solid #2d3748',
                            borderRadius: '8px',
                            color: '#e6edf3',
                            fontSize: '14px',
                            colorScheme: 'dark'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                          SHOW START DATE *
                        </label>
                        <input
                          type="date"
                          value={wizardData.showStartDate}
                          onChange={(e) => setWizardData(prev => ({ ...prev, showStartDate: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: '#1a2332',
                            border: '2px solid #2d3748',
                            borderRadius: '8px',
                            color: '#e6edf3',
                            fontSize: '14px',
                            colorScheme: 'dark'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                          SHOW END DATE *
                        </label>
                        <input
                          type="date"
                          value={wizardData.showEndDate}
                          onChange={(e) => setWizardData(prev => ({ ...prev, showEndDate: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: '#1a2332',
                            border: '2px solid #2d3748',
                            borderRadius: '8px',
                            color: '#e6edf3',
                            fontSize: '14px',
                            colorScheme: 'dark'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                        VENUE TYPE *
                      </label>
                      <select
                        value={wizardData.venueType}
                        onChange={(e) => setWizardData(prev => ({ ...prev, venueType: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          backgroundColor: '#0d1117',
                          border: '2px solid #2d3748',
                          borderRadius: '8px',
                          color: '#e6edf3',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Select venue type...</option>
                        <option value="studio">Studio</option>
                        <option value="hotel-meeting">Hotel Meeting Room</option>
                        <option value="hotel-ballroom">Hotel Ballroom</option>
                        <option value="convention-center">Convention Center</option>
                        <option value="arena-stadium">Arena/Stadium</option>
                        <option value="outdoor-stage">Outdoor Stage</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                        VENUE NAME *
                      </label>
                      
                      {/* Text input for venue search */}
                      {!wizardData.locationData ? (
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={wizardData.venueName || ''}
                            onChange={(e) => {
                              setWizardData(prev => ({ ...prev, venueName: e.target.value }));
                            }}
                            onFocus={() => {
                              if (venueSearchResults.length > 0) setShowVenueDropdown(true);
                            }}
                            placeholder="Type venue name or address..."
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              backgroundColor: '#0d1117',
                              border: '2px solid #2d3748',
                              borderRadius: '8px',
                              color: '#e6edf3',
                              fontSize: '14px'
                            }}
                          />
                          
                          {searchingVenues && (
                            <div style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: '#06b6d4'
                            }}>
                              <Activity size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            </div>
                          )}
                          
                          {/* Autocomplete dropdown */}
                          {showVenueDropdown && venueSearchResults.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              marginTop: '4px',
                              backgroundColor: '#141a23',
                              border: '2px solid #2d3748',
                              borderRadius: '8px',
                              maxHeight: '300px',
                              overflowY: 'auto',
                              zIndex: 1000,
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                            }}>
                              {venueSearchResults.map((result, idx) => {
                                const placeName = result.properties.name || result.properties.address_line1 || 'Unknown';
                                const address = result.properties.formatted || '';
                                
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      setWizardData(prev => ({
                                        ...prev,
                                        venueName: placeName,
                                        venueAddress: address,
                                        locationData: {
                                          city: result.properties.city || '',
                                          state: result.properties.state || '',
                                          country: result.properties.country || '',
                                          lat: result.properties.lat,
                                          lon: result.properties.lon,
                                          formatted: address
                                        }
                                      }));
                                      setShowVenueDropdown(false);
                                      setVenueSearchResults([]);
                                      logger.info('Wizard', 'Venue selected from search', { venueName: placeName, address });
                                    }}
                                    style={{
                                      padding: '12px 16px',
                                      borderBottom: idx < venueSearchResults.length - 1 ? '1px solid #2d3748' : 'none',
                                      cursor: 'pointer',
                                      transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a2332'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                  >
                                    <div style={{ fontSize: '13px', color: '#e6edf3', fontWeight: '600', marginBottom: '4px' }}>
                                      {placeName}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4' }}>
                                      {address}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          
                          <div style={{ fontSize: '11px', color: '#6b7785', marginTop: '6px' }}>
                            💡 Start typing - suggestions will appear as you type (min 3 characters)
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Display selected venue details */}
                      {wizardData.venueName && wizardData.locationData && (
                        <div style={{
                          marginTop: '16px',
                          padding: '16px',
                          backgroundColor: '#1a2332',
                          borderRadius: '8px',
                          border: '1px solid #2d3748',
                          position: 'relative'
                        }}>
                          {/* Change Venue Button */}
                          <button
                            onClick={() => {
                              setWizardData(prev => ({
                                ...prev,
                                venueName: '',
                                venueAddress: '',
                                locationData: null
                              }));
                              // Force re-initialization of autocomplete
                              if (autocompleteRef.current) {
                                autocompleteRef.current = null;
                              }
                              logger.info('Wizard', 'Clearing venue selection to search again');
                            }}
                            style={{
                              position: 'absolute',
                              top: '12px',
                              right: '12px',
                              padding: '6px 12px',
                              backgroundColor: '#2d3748',
                              border: '1px solid #4a5568',
                              borderRadius: '4px',
                              color: '#06b6d4',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <RefreshCw size={12} />
                            Change Venue
                          </button>
                          
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {/* Map Preview */}
                            <div style={{
                              width: '120px',
                              height: '120px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              flexShrink: 0,
                              backgroundColor: '#0d1117'
                            }}>
                              <img
                                src={`https://maps.geoapify.com/v1/staticmap?style=dark-matter&width=120&height=120&center=lonlat:${wizardData.locationData.lon},${wizardData.locationData.lat}&zoom=15&marker=lonlat:${wizardData.locationData.lon},${wizardData.locationData.lat};color:%2306b6d4;size:medium&apiKey=${GEOAPIFY_API_KEY}`}
                                alt="Venue location"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                            
                            {/* Venue Info */}
                            <div style={{ flex: 1, paddingRight: '80px' }}>
                              <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '8px' }}>
                                {wizardData.venueName}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7785', lineHeight: '1.6' }}>
                                <div style={{ display: 'flex', alignItems: 'start', gap: '6px', marginBottom: '4px' }}>
                                  <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                                  <span>{wizardData.venueAddress}</span>
                                </div>
                                {wizardData.locationData.lat && wizardData.locationData.lon && (
                                  <div style={{ fontSize: '11px', color: '#6b7785', marginTop: '6px' }}>
                                    📍 {wizardData.locationData.lat.toFixed(6)}, {wizardData.locationData.lon.toFixed(6)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Interference Analysis */}
                      {wizardData.venueName && wizardData.locationData && (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <label style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', display: 'block' }}>
                              RF INTERFERENCE ANALYSIS
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {interferenceHistory.length > 0 && (
                                <button
                                  onClick={() => setShowInterferenceHistory(!showInterferenceHistory)}
                                  style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#2d3748',
                                    border: '1px solid #4a5568',
                                    borderRadius: '4px',
                                    color: '#9ca3af',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <Clock size={10} />
                                  History ({interferenceHistory.length})
                                </button>
                              )}
                              <button
                                onClick={fetchInterferenceData}
                                disabled={loadingInterference}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: loadingInterference ? '#2d3748' : '#06b6d4',
                                  border: 'none',
                                  borderRadius: '4px',
                                  color: loadingInterference ? '#6b7785' : '#0a0e14',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  cursor: loadingInterference ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <RefreshCw size={10} style={{ animation: loadingInterference ? 'spin 1s linear infinite' : 'none' }} />
                                Refresh
                              </button>
                            </div>
                          </div>
                          
                          {loadingInterference ? (
                            <div style={{
                              padding: '24px',
                              backgroundColor: '#1a2332',
                              borderRadius: '8px',
                              border: '1px solid #2d3748',
                              textAlign: 'center',
                              color: '#6b7785'
                            }}>
                              <Activity size={24} style={{ margin: '0 auto 12px', animation: 'pulse 2s ease-in-out infinite' }} />
                              <div style={{ fontSize: '13px' }}>Analyzing RF environment...</div>
                            </div>
                          ) : interferenceData && interferenceData.risks.length > 0 ? (
                            <div style={{
                              padding: '16px',
                              backgroundColor: '#1a2332',
                              borderRadius: '8px',
                              border: '1px solid #2d3748'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {interferenceData.risks.map((risk, idx) => (
                                  <div 
                                    key={idx}
                                    style={{
                                      padding: '12px',
                                      backgroundColor: '#0d1117',
                                      borderRadius: '6px',
                                      border: `1px solid ${
                                        risk.severity === 'high' ? '#f59e0b' : 
                                        risk.severity === 'medium' ? '#eab308' : 
                                        '#22c55e'
                                      }`
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                                      <AlertTriangle 
                                        size={18} 
                                        style={{ 
                                          marginTop: '2px',
                                          color: risk.severity === 'high' ? '#f59e0b' : 
                                                 risk.severity === 'medium' ? '#eab308' : 
                                                 '#22c55e',
                                          flexShrink: 0
                                        }} 
                                      />
                                      <div style={{ flex: 1 }}>
                                        <div style={{
                                          fontSize: '13px',
                                          color: '#e6edf3',
                                          fontWeight: '600',
                                          marginBottom: '4px',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.5px'
                                        }}>
                                          {risk.type.replace('-', ' ')}
                                          <span style={{
                                            marginLeft: '8px',
                                            fontSize: '10px',
                                            padding: '2px 6px',
                                            borderRadius: '3px',
                                            backgroundColor: risk.severity === 'high' ? '#f59e0b' : 
                                                           risk.severity === 'medium' ? '#eab308' : 
                                                           '#22c55e',
                                            color: '#0a0e14',
                                            fontWeight: '700'
                                          }}>
                                            {risk.severity.toUpperCase()}
                                          </span>
                                        </div>
                                        <div style={{
                                          fontSize: '12px',
                                          color: '#9ca3af',
                                          marginBottom: '8px',
                                          lineHeight: '1.5'
                                        }}>
                                          {risk.description}
                                        </div>
                                        <div style={{
                                          fontSize: '11px',
                                          color: '#06b6d4',
                                          backgroundColor: '#0a0e14',
                                          padding: '8px',
                                          borderRadius: '4px',
                                          borderLeft: '2px solid #06b6d4',
                                          lineHeight: '1.6'
                                        }}>
                                          <strong>Mitigation:</strong> {risk.mitigation}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                
                                {/* Cell Tower Details */}
                                {interferenceData.cellTowers.length > 0 && (
                                  <div style={{
                                    padding: '12px',
                                    backgroundColor: '#0d1117',
                                    borderRadius: '6px',
                                    border: '1px solid #2d3748'
                                  }}>
                                    <div style={{ fontSize: '12px', color: '#6b7785', fontWeight: '600', marginBottom: '8px' }}>
                                      NEARBY CELLULAR INFRASTRUCTURE
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {interferenceData.cellTowers.map((tower, idx) => (
                                        <div key={idx} style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', gap: '12px' }}>
                                          <span style={{ color: '#06b6d4', fontWeight: '600', minWidth: '60px' }}>
                                            {tower.carrier}:
                                          </span>
                                          <span>{tower.bands.join(', ')} • {tower.distance}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                <div style={{
                                  fontSize: '11px',
                                  color: '#6b7785',
                                  fontStyle: 'italic',
                                  padding: '8px',
                                  textAlign: 'center',
                                  borderTop: '1px solid #2d3748',
                                  marginTop: '4px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <span>💡 This analysis provides general guidance. Always perform on-site RF scans for accurate interference mapping.</span>
                                  {interferenceData.timestamp && (
                                    <span style={{ fontSize: '10px', color: '#6b7785', marginLeft: '12px' }}>
                                      Updated: {new Date(interferenceData.timestamp).toLocaleString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        hour: '2-digit', 
                                        minute: '2-digit' 
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{
                              padding: '16px',
                              backgroundColor: '#1a2332',
                              borderRadius: '8px',
                              border: '1px solid #22c55e',
                              color: '#6b7785',
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px'
                            }}>
                              <CheckCircle size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
                              <span>No major interference concerns detected for this location. Proceed with on-site RF scanning.</span>
                            </div>
                          )}
                          
                          {/* Interference History */}
                          {showInterferenceHistory && interferenceHistory.length > 0 && (
                            <div style={{
                              marginTop: '16px',
                              padding: '16px',
                              backgroundColor: '#0d1117',
                              borderRadius: '8px',
                              border: '1px solid #2d3748'
                            }}>
                              <div style={{
                                fontSize: '12px',
                                color: '#6b7785',
                                fontWeight: '600',
                                marginBottom: '12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span>INTERFERENCE ANALYSIS HISTORY</span>
                                <button
                                  onClick={() => setShowInterferenceHistory(false)}
                                  style={{
                                    padding: '4px',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#6b7785',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {interferenceHistory.map((report, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      padding: '12px',
                                      backgroundColor: '#1a2332',
                                      borderRadius: '6px',
                                      border: idx === 0 ? '1px solid #06b6d4' : '1px solid #2d3748',
                                      cursor: 'pointer',
                                      transition: 'border-color 0.2s'
                                    }}
                                    onClick={() => {
                                      setInterferenceData(report);
                                      setShowInterferenceHistory(false);
                                      logger.info('Wizard', 'Restored interference report from history', { timestamp: report.timestamp });
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '12px', color: '#e6edf3', fontWeight: '600', marginBottom: '4px' }}>
                                          {report.venueName || 'Unknown Venue'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
                                          {report.venueAddress}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#6b7785', display: 'flex', gap: '12px' }}>
                                          <span>
                                            <Clock size={10} style={{ display: 'inline', marginRight: '4px' }} />
                                            {new Date(report.timestamp).toLocaleString('en-US', { 
                                              month: 'short', 
                                              day: 'numeric', 
                                              year: 'numeric',
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            })}
                                          </span>
                                          <span>
                                            {report.risks?.length || 0} risk{report.risks?.length !== 1 ? 's' : ''}
                                          </span>
                                        </div>
                                      </div>
                                      {idx === 0 && (
                                        <div style={{
                                          fontSize: '9px',
                                          padding: '3px 6px',
                                          borderRadius: '3px',
                                          backgroundColor: '#06b6d4',
                                          color: '#0a0e14',
                                          fontWeight: '700',
                                          textTransform: 'uppercase'
                                        }}>
                                          Current
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Steps 1+: Test Procedures */}
              {wizardStep > 0 && wizardStep <= TEST_PROCEDURES.length && (() => {
                const test = TEST_PROCEDURES[wizardStep - 1];
                const isCompleted = wizardData.completedTests[test.id];
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {/* Test Header */}
                    <div style={{
                      padding: '24px',
                      backgroundColor: '#1a2332',
                      borderRadius: '12px',
                      border: '2px solid #2d3748'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
                        <div style={{
                          minWidth: '60px',
                          height: '60px',
                          borderRadius: '12px',
                          backgroundColor: isCompleted ? '#166534' : '#0c2d3d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {isCompleted ? <CheckCircle size={30} color="#22c55e" /> : <Activity size={30} color="#06b6d4" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '20px', color: '#e6edf3', margin: '0 0 8px 0', fontWeight: '600' }}>
                            {test.name}
                          </h3>
                          <p style={{ fontSize: '14px', color: '#6b7785', margin: 0 }}>
                            {test.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Equipment Images */}
                    <div style={{
                      padding: '24px',
                      backgroundColor: '#0d1117',
                      borderRadius: '12px',
                      border: '1px solid #2d3748'
                    }}>
                      <h4 style={{ fontSize: '14px', color: '#06b6d4', margin: '0 0 16px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        📡 Required Equipment
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{
                          padding: '16px',
                          backgroundColor: '#141a23',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            width: '100%',
                            height: '120px',
                            backgroundColor: '#1a2332',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#06b6d4',
                            fontSize: '48px'
                          }}>
                            📻
                          </div>
                          <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '4px' }}>
                            RF Explorer 6G WB Plus
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7785' }}>
                            Spectrum Analyzer
                          </div>
                        </div>
                        <div style={{
                          padding: '16px',
                          backgroundColor: '#141a23',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            width: '100%',
                            height: '120px',
                            backgroundColor: '#1a2332',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#06b6d4',
                            fontSize: '48px'
                          }}>
                            📹
                          </div>
                          <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '4px' }}>
                            ABOnAir 612
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7785' }}>
                            Wireless Video System
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Test Steps */}
                    <div>
                      <h4 style={{ fontSize: '14px', color: '#f59e0b', margin: '0 0 16px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        📋 Step-by-Step Instructions
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {test.steps.map((step, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '16px',
                              backgroundColor: '#0d1117',
                              borderRadius: '8px',
                              border: '1px solid #2d3748',
                              display: 'flex',
                              gap: '16px'
                            }}
                          >
                            <div style={{
                              minWidth: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#1a2332',
                              color: '#06b6d4',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '14px',
                              fontWeight: '600'
                            }}>
                              {i + 1}
                            </div>
                            <div style={{ flex: 1, paddingTop: '4px' }}>
                              <p style={{ fontSize: '14px', color: '#e6edf3', margin: 0, lineHeight: '1.6' }}>
                                {step}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Test Results Input */}
                    <div style={{
                      padding: '24px',
                      backgroundColor: '#1a2332',
                      borderRadius: '12px',
                      border: '2px solid #2d3748'
                    }}>
                      <h4 style={{ fontSize: '14px', color: '#22c55e', margin: '0 0 16px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ✅ Technician Feedback
                      </h4>
                      <textarea
                        value={wizardData.testNotes[test.id] || ''}
                        onChange={(e) => setWizardData(prev => ({
                          ...prev,
                          testNotes: { ...prev.testNotes, [test.id]: e.target.value }
                        }))}
                        placeholder="Enter your observations, measurements, or any issues encountered..."
                        style={{
                          width: '100%',
                          minHeight: '120px',
                          padding: '16px',
                          backgroundColor: '#0d1117',
                          border: '2px solid #2d3748',
                          borderRadius: '8px',
                          color: '#e6edf3',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#e6edf3'
                        }}>
                          <input
                            type="checkbox"
                            checked={!!isCompleted}
                            onChange={(e) => {
                              setWizardData(prev => ({
                                ...prev,
                                completedTests: {
                                  ...prev.completedTests,
                                  [test.id]: e.target.checked
                                }
                              }));
                              if (e.target.checked) {
                                logger.info('Wizard', `Test completed: ${test.name}`);
                              }
                            }}
                            style={{ width: '18px', height: '18px' }}
                          />
                          Mark this test as completed
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Wizard Footer with Navigation */}
            <div style={{
              padding: '24px',
              borderTop: '1px solid #2d3748',
              backgroundColor: '#1a2332',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px'
            }}>
              <button
                onClick={() => {
                  setWizardStep(Math.max(0, wizardStep - 1));
                  logger.debug('Wizard', `Step back to ${wizardStep - 1}`);
                }}
                disabled={wizardStep === 0}
                style={{
                  padding: '12px 24px',
                  backgroundColor: wizardStep === 0 ? '#1e2730' : '#2d3748',
                  border: 'none',
                  borderRadius: '8px',
                  color: wizardStep === 0 ? '#4a5568' : '#e6edf3',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: wizardStep === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
                Previous
              </button>

              <div style={{ display: 'flex', gap: '12px' }}>
                {wizardStep === TEST_PROCEDURES.length && (
                  <button
                    onClick={() => {
                      setSiteProfile({
                        venueName: wizardData.venueName,
                        venueType: wizardData.venueType,
                        date: wizardData.setupDate,
                        notes: ''
                      });
                      setShowWizard(false);
                      logger.info('Wizard', 'Setup wizard completed', { showName: wizardData.showName });
                    }}
                    style={{
                      padding: '12px 32px',
                      backgroundColor: '#22c55e',
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
                    <CheckCircle size={16} />
                    Complete Setup
                  </button>
                )}
                
                {wizardStep < TEST_PROCEDURES.length && (
                  <button
                    onClick={() => {
                      if (wizardStep === 0) {
                        // Validate basic info
                        if (!wizardData.showName || !wizardData.venueName || !wizardData.showStartDate || !wizardData.showEndDate || !wizardData.venueType || !wizardData.venueAddress) {
                          alert('Please fill in all required fields before continuing.');
                          return;
                        }
                        logger.info('Wizard', 'Basic info completed, starting tests', wizardData);
                      }
                      setWizardStep(wizardStep + 1);
                      logger.debug('Wizard', `Advanced to step ${wizardStep + 1}`);
                    }}
                    style={{
                      padding: '12px 32px',
                      backgroundColor: '#06b6d4',
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
                    Next
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Empty State - No Show Configured */}
            {!wizardData.showName && (
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '16px',
                border: '2px dashed #2d3748',
                padding: '80px 40px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px'
              }}>
                <div style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  backgroundColor: '#1a2332',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '8px'
                }}>
                  <FileText size={48} color="#06b6d4" />
                </div>
                <div>
                  <h2 style={{ fontSize: '28px', color: '#e6edf3', margin: '0 0 12px 0', fontWeight: '600' }}>
                    No Show Profile Found
                  </h2>
                  <p style={{ fontSize: '16px', color: '#6b7785', margin: '0 0 32px 0', maxWidth: '500px' }}>
                    Get started by creating a new show profile. We'll guide you through site assessment, equipment setup, and RF testing step-by-step.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowWizard(true);
                    setWizardStep(0);
                    logger.info('App', 'Starting new show setup wizard');
                  }}
                  style={{
                    padding: '16px 48px',
                    backgroundColor: '#06b6d4',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#0a0e14',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
                  }}
                >
                  <Plus size={20} />
                  Start New Show Setup
                </button>
                <div style={{ marginTop: '24px', fontSize: '13px', color: '#6b7785' }}>
                  <div style={{ marginBottom: '8px' }}>📋 Step-by-step guided setup</div>
                  <div style={{ marginBottom: '8px' }}>📊 Interactive site testing procedures</div>
                  <div>📡 Intelligent antenna recommendations</div>
                </div>
              </div>
            )}

            {/* Show Profile Summary - When show exists */}
            {wizardData.showName && (
              <>
                {/* Show Header Card */}
                <div style={{
                  backgroundColor: '#141a23',
                  borderRadius: '12px',
                  border: '1px solid #1e2730',
                  padding: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h1 style={{ fontSize: '24px', color: '#e6edf3', margin: '0 0 8px 0' }}>
                      {wizardData.showName}
                    </h1>
                    <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#6b7785' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} />
                        {wizardData.venueName}
                      </div>
                      {wizardData.venueAddress && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={14} />
                          {wizardData.venueAddress}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} />
                        {new Date(wizardData.showStartDate).toLocaleDateString()} - {new Date(wizardData.showEndDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowWizard(true);
                      setWizardStep(0);
                      logger.info('App', 'Reopening setup wizard to edit show profile');
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#1e2730',
                      border: '1px solid #2d3748',
                      borderRadius: '6px',
                      color: '#06b6d4',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Settings size={16} />
                    Review Setup
                  </button>
                </div>

                {/* Quick Status Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* ABOnAir Band Status */}
                  {ABONAIR_BANDS.map(band => {
                    // Filter spectrum data for this band
                    const bandData = spectrumData.filter(p => p.frequency >= band.start && p.frequency <= band.end);
                    const maxSignal = bandData.length > 0 ? Math.max(...bandData.map(p => p.amplitude)) : -100;
                    const quality = getSignalQuality(maxSignal);
                    
                    return (
                      <div key={band.id} style={{
                        backgroundColor: '#141a23',
                        borderRadius: '12px',
                        border: '1px solid #1e2730',
                        padding: '20px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                          <div>
                            <h3 style={{ fontSize: '16px', color: '#e6edf3', margin: 0 }}>{band.name}</h3>
                            <p style={{ fontSize: '12px', color: '#6b7785', margin: '4px 0 0 0' }}>{band.range}</p>
                          </div>
                          <div style={{
                            padding: '4px 8px',
                            backgroundColor: `${quality.color}20`,
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            color: quality.color
                          }}>
                            {quality.label}
                          </div>
                        </div>
                        <div style={{ 
                      height: '50px', 
                      backgroundColor: '#0d1117', 
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'flex-end',
                      padding: '4px',
                      gap: '1px',
                      overflow: 'hidden'
                    }}>
                      {bandData.length > 0 ? bandData.map((point, i) => {
                        const height = Math.max(2, Math.min(100, ((point.amplitude + 100) / 60) * 100));
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              minWidth: '2px',
                              height: `${height}%`,
                              backgroundColor: getSignalStrengthColor(point.amplitude),
                              borderRadius: '1px 1px 0 0',
                              transition: 'height 0.1s'
                            }}
                          />
                        );
                      }) : (
                        <div style={{ 
                          width: '100%', 
                          height: '100%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: '#4a5568',
                          fontSize: '11px'
                        }}>
                          No data
                        </div>
                      )}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      marginTop: '8px',
                      fontSize: '11px',
                      color: '#6b7785'
                    }}>
                      <span>Peak: {maxSignal > -100 ? `${maxSignal.toFixed(1)} dBm` : '--'}</span>
                      <span style={{ color: band.color }}>{band.range}</span>
                    </div>
                  </div>
                );
              })}

              {/* Tests Completed */}
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', color: '#e6edf3', margin: 0 }}>Tests Completed</h3>
                    <p style={{ fontSize: '12px', color: '#6b7785', margin: '4px 0 0 0' }}>Site assessment progress</p>
                  </div>
                  <Activity size={20} color="#f59e0b" />
                </div>
                <div style={{ fontSize: '36px', fontWeight: '600', color: '#e6edf3' }}>
                  {testResults.length} <span style={{ fontSize: '16px', color: '#6b7785' }}>/ {TEST_PROCEDURES.length}</span>
                </div>
                <div style={{ 
                  marginTop: '12px', 
                  height: '6px', 
                  backgroundColor: '#0d1117', 
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(testResults.length / TEST_PROCEDURES.length) * 100}%`,
                    height: '100%',
                    backgroundColor: testResults.length === TEST_PROCEDURES.length ? '#22c55e' : '#f59e0b',
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>

              {/* Event Log Summary */}
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', color: '#e6edf3', margin: 0 }}>Event Log</h3>
                    <p style={{ fontSize: '12px', color: '#6b7785', margin: '4px 0 0 0' }}>RF anomalies detected</p>
                  </div>
                  <AlertTriangle size={20} color={eventLog.filter(e => e.type === 'critical').length > 0 ? '#ef4444' : '#6b7785'} />
                </div>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#ef4444' }}>
                      {eventLog.filter(e => e.type === 'critical').length}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7785' }}>Critical</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#f59e0b' }}>
                      {eventLog.filter(e => e.type === 'warning').length}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7785' }}>Warnings</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Peak Markers */}
            {peakMarkers.length > 0 && (
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '24px'
              }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  marginBottom: '16px'
                }}>
                  Top Signal Peaks
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {peakMarkers.map((peak, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: '#0d1117',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${getSignalStrengthColor(peak.amplitude)}`
                      }}
                    >
                      <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '500' }}>
                        {formatFrequency(peak.frequency)}
                      </div>
                      <div style={{ fontSize: '12px', color: getSignalStrengthColor(peak.amplitude) }}>
                        {peak.amplitude.toFixed(1)} dBm
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Events */}
            {eventLog.length > 0 && (
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '24px'
              }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  marginBottom: '16px'
                }}>
                  Recent Events
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {eventLog.slice(0, 10).map(event => (
                    <div 
                      key={event.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        backgroundColor: event.type === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        borderRadius: '6px',
                        borderLeft: `3px solid ${event.type === 'critical' ? '#ef4444' : '#f59e0b'}`
                      }}
                    >
                      <Clock size={14} color="#6b7785" />
                      <span style={{ fontSize: '12px', color: '#6b7785', minWidth: '140px' }}>
                        {formatTimestamp(event.timestamp)}
                      </span>
                      <span style={{ fontSize: '13px', color: '#c5cdd9' }}>
                        {event.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* Tests Tab */}
        {activeTab === 'tests' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: selectedTest ? '1fr 1.5fr' : '1fr', gap: '24px' }}>
              {/* Test List */}
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '24px'
              }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  marginBottom: '20px'
                }}>
                  Test Procedures
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {TEST_PROCEDURES.map(test => {
                    const isCompleted = testResults.some(r => r.testId === test.id);
                    const isSelected = selectedTest?.id === test.id;
                    return (
                      <button
                        key={test.id}
                        onClick={() => setSelectedTest(test)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          backgroundColor: isSelected ? '#1a2332' : '#0d1117',
                          border: isSelected ? '1px solid #2d3f59' : '1px solid #1e2730',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {isCompleted ? (
                            <CheckCircle size={20} color="#22c55e" />
                          ) : (
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              border: '2px solid #2d3748'
                            }} />
                          )}
                          <div>
                            <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '500' }}>
                              {test.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7785', marginTop: '2px' }}>
                              {test.duration}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} color="#6b7785" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Test Detail */}
              {selectedTest && (
                <div style={{
                  backgroundColor: '#141a23',
                  borderRadius: '12px',
                  border: '1px solid #1e2730',
                  padding: '24px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '24px' }}>
                    <div>
                      <h2 style={{ fontSize: '20px', color: '#e6edf3', margin: 0 }}>{selectedTest.name}</h2>
                      <p style={{ fontSize: '13px', color: '#6b7785', marginTop: '8px' }}>{selectedTest.description}</p>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      backgroundColor: '#1a2332',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#06b6d4'
                    }}>
                      {selectedTest.duration}
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '12px', 
                      color: '#6b7785', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.1em',
                      marginBottom: '12px'
                    }}>
                      Procedure Steps
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedTest.steps.map((step, i) => (
                        <div 
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '12px',
                            backgroundColor: '#0d1117',
                            borderRadius: '6px'
                          }}
                        >
                          <span style={{
                            minWidth: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#1a2332',
                            color: '#06b6d4',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ fontSize: '13px', color: '#c5cdd9', lineHeight: '1.5' }}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '12px', 
                      color: '#6b7785', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.1em',
                      marginBottom: '12px'
                    }}>
                      Results Analysis Guide
                    </h3>
                    <div style={{ 
                      padding: '16px',
                      backgroundColor: '#0d1117',
                      borderRadius: '8px',
                      borderLeft: '3px solid #06b6d4'
                    }}>
                      {selectedTest.analysis.map((item, i) => (
                        <p key={i} style={{ 
                          fontSize: '13px', 
                          color: '#c5cdd9', 
                          margin: i === 0 ? 0 : '8px 0 0 0',
                          lineHeight: '1.5'
                        }}>
                          • {item}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => addTestResult(selectedTest.id, { passed: true, notes: '' })}
                      style={{
                        flex: 1,
                        padding: '12px',
                        backgroundColor: '#166534',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <CheckCircle size={18} />
                      Mark as Passed
                    </button>
                    <button
                      onClick={() => addTestResult(selectedTest.id, { passed: false, notes: '' })}
                      style={{
                        flex: 1,
                        padding: '12px',
                        backgroundColor: '#991b1b',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <AlertTriangle size={18} />
                      Mark as Failed
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Antenna Guide Tab */}
        {activeTab === 'antennas' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* AI Recommendation Banner */}
            {antennaRecommendation && (
              <div style={{
                backgroundColor: '#0c2d3d',
                borderRadius: '12px',
                border: '2px solid #06b6d4',
                padding: '20px',
                display: 'grid',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Target size={24} color="#06b6d4" />
                    <div>
                      <h3 style={{ fontSize: '16px', color: '#06b6d4', margin: 0, fontWeight: '600' }}>
                        Recommended Configuration
                      </h3>
                      <p style={{ fontSize: '12px', color: '#6b7785', margin: '2px 0 0 0' }}>
                        Based on your site tests • Confidence: <span style={{ color: antennaRecommendation.confidence === 'high' ? '#22c55e' : '#f59e0b' }}>{antennaRecommendation.confidence.toUpperCase()}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const config = ANTENNA_CONFIGS.find(c => c.id === antennaRecommendation.configId);
                      setSelectedAntenna(config);
                      logger.info('App', 'Selected recommended antenna config', { configId: config?.id });
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#06b6d4',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#0a0e14',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    View Details
                  </button>
                </div>
                <div style={{
                  padding: '12px',
                  backgroundColor: '#0a1929',
                  borderRadius: '6px',
                  borderLeft: '3px solid #06b6d4'
                }}>
                  <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '500', marginBottom: '8px' }}>
                    {ANTENNA_CONFIGS.find(c => c.id === antennaRecommendation.configId)?.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#c5cdd9' }}>
                    {antennaRecommendation.reasoning.map((reason, i) => (
                      <div key={i} style={{ marginBottom: '4px' }}>• {reason}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: selectedAntenna ? '1fr 1.5fr' : '1fr', gap: '24px' }}>
              {/* Antenna Config List */}
              <div style={{
                backgroundColor: '#141a23',
                borderRadius: '12px',
                border: '1px solid #1e2730',
                padding: '24px'
              }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  marginBottom: '20px'
                }}>
                  Antenna Configurations
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ANTENNA_CONFIGS.map(config => {
                    const isSelected = selectedAntenna?.id === config.id;
                    return (
                      <button
                        key={config.id}
                        onClick={() => setSelectedAntenna(config)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          backgroundColor: isSelected ? '#1a2332' : '#0d1117',
                          border: isSelected ? '1px solid #2d3f59' : '1px solid #1e2730',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Antenna size={20} color={isSelected ? '#06b6d4' : '#6b7785'} />
                          <div>
                            <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '500' }}>
                              {config.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7785', marginTop: '2px' }}>
                              Range: {config.range}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} color="#6b7785" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Antenna Detail */}
              {selectedAntenna && (
                <div style={{
                  backgroundColor: '#141a23',
                  borderRadius: '12px',
                  border: '1px solid #1e2730',
                  padding: '24px'
                }}>
                  <h2 style={{ fontSize: '20px', color: '#e6edf3', margin: '0 0 8px 0' }}>{selectedAntenna.name}</h2>
                  <p style={{ fontSize: '13px', color: '#06b6d4', marginBottom: '24px' }}>
                    Typical Range: {selectedAntenna.range}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ padding: '16px', backgroundColor: '#0d1117', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7785', textTransform: 'uppercase', marginBottom: '8px' }}>
                        TX Antenna
                      </div>
                      <div style={{ fontSize: '14px', color: '#e6edf3' }}>{selectedAntenna.txAntenna}</div>
                    </div>
                    <div style={{ padding: '16px', backgroundColor: '#0d1117', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7785', textTransform: 'uppercase', marginBottom: '8px' }}>
                        RX Antenna
                      </div>
                      <div style={{ fontSize: '14px', color: '#e6edf3' }}>{selectedAntenna.rxAntenna}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '12px', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                      Best For
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedAntenna.bestFor.map((item, i) => (
                        <span key={i} style={{
                          padding: '6px 12px',
                          backgroundColor: '#1a2332',
                          borderRadius: '20px',
                          fontSize: '12px',
                          color: '#06b6d4'
                        }}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <h3 style={{ fontSize: '12px', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                        Advantages
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {selectedAntenna.pros.map((item, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#c5cdd9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle size={14} color="#22c55e" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '12px', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                        Considerations
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {selectedAntenna.cons.map((item, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#c5cdd9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={14} color="#f59e0b" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Visual Diagram */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '12px', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Navigation size={14} />
                      Configuration Diagram
                    </h3>
                    <div style={{
                      padding: '24px',
                      backgroundColor: '#0a0e14',
                      borderRadius: '8px',
                      border: '2px dashed #1e2730',
                      minHeight: '200px',
                      position: 'relative'
                    }}>
                      {/* Antenna Diagram - varies by config type */}
                      <svg width="100%" height="200" viewBox="0 0 600 200" style={{ overflow: 'visible' }}>
                        {selectedAntenna.id === 'standard-omni' && (
                          <g>
                            {/* TX on left */}
                            <circle cx="100" cy="100" r="30" fill="#06b6d4" opacity="0.2" />
                            <circle cx="100" cy="100" r="15" fill="#06b6d4" />
                            <text x="100" y="105" textAnchor="middle" fill="#e6edf3" fontSize="10" fontWeight="bold">TX</text>
                            <line x1="100" y1="85" x2="100" y2="50" stroke="#06b6d4" strokeWidth="3" />
                            
                            {/* Signal waves */}
                            <circle cx="100" cy="100" r="50" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.3" />
                            <circle cx="100" cy="100" r="70" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.2" />
                            
                            {/* RX antennas on right with diversity spacing */}
                            <circle cx="450" cy="70" r="30" fill="#22c55e" opacity="0.2" />
                            <circle cx="450" cy="70" r="15" fill="#22c55e" />
                            <text x="450" y="75" textAnchor="middle" fill="#0a0e14" fontSize="10" fontWeight="bold">RX1</text>
                            <line x1="450" y1="55" x2="450" y2="20" stroke="#22c55e" strokeWidth="3" />
                            
                            <circle cx="450" cy="130" r="30" fill="#22c55e" opacity="0.2" />
                            <circle cx="450" cy="130" r="15" fill="#22c55e" />
                            <text x="450" y="135" textAnchor="middle" fill="#0a0e14" fontSize="10" fontWeight="bold">RX2</text>
                            <line x1="450" y1="145" x2="450" y2="180" stroke="#22c55e" strokeWidth="3" />
                            
                            {/* Measurements */}
                            <line x1="120" y1="100" x2="420" y2="100" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4" />
                            <text x="270" y="95" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="bold">
                              <tspan>100-200 ft</tspan>
                            </text>
                            
                            <line x1="450" y1="85" x2="450" y2="115" stroke="#06b6d4" strokeWidth="1" strokeDasharray="4" />
                            <text x="475" y="102" fill="#06b6d4" fontSize="10">6+ ft</text>
                          </g>
                        )}
                        
                        {selectedAntenna.id === 'directional-panel' && (
                          <g>
                            {/* TX */}
                            <circle cx="100" cy="100" r="15" fill="#06b6d4" />
                            <text x="100" y="105" textAnchor="middle" fill="#e6edf3" fontSize="10" fontWeight="bold">TX</text>
                            
                            {/* Panel antennas with directional pattern */}
                            <rect x="420" y="40" width="40" height="60" fill="#22c55e" rx="4" />
                            <path d="M 460 70 L 520 45 L 520 95 Z" fill="#22c55e" opacity="0.3" />
                            <text x="440" y="75" textAnchor="middle" fill="#0a0e14" fontSize="10" fontWeight="bold">RX1</text>
                            
                            <rect x="420" y="110" width="40" height="60" fill="#22c55e" rx="4" />
                            <path d="M 460 140 L 520 115 L 520 165 Z" fill="#22c55e" opacity="0.3" />
                            <text x="440" y="145" textAnchor="middle" fill="#0a0e14" fontSize="10" fontWeight="bold">RX2</text>
                            
                            {/* Range indicator */}
                            <line x1="120" y1="100" x2="420" y2="100" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4" />
                            <text x="270" y="95" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="bold">300-500 ft</text>
                            
                            {/* Coverage angle */}
                            <path d="M 460 70 Q 490 100 460 140" fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="2" />
                            <text x="500" y="105" fill="#06b6d4" fontSize="10">60-90°</text>
                          </g>
                        )}
                        
                        {(selectedAntenna.id === 'hybrid-diversity' || selectedAntenna.id === 'mimo-config') && (
                          <g>
                            {/* Complex array visualization */}
                            <circle cx="100" cy="100" r="15" fill="#06b6d4" />
                            <text x="100" y="105" textAnchor="middle" fill="#e6edf3" fontSize="10" fontWeight="bold">TX</text>
                            
                            {/* Multiple RX elements */}
                            <circle cx="420" cy="50" r="12" fill="#22c55e" />
                            <text x="420" y="54" textAnchor="middle" fill="#0a0e14" fontSize="8" fontWeight="bold">R1</text>
                            
                            <rect x="440" y="75" width="30" height="50" fill="#22c55e" opacity="0.8" rx="3" />
                            <text x="455" y="103" textAnchor="middle" fill="#0a0e14" fontSize="8" fontWeight="bold">R2</text>
                            
                            <circle cx="480" cy="140" r="12" fill="#22c55e" />
                            <text x="480" y="144" textAnchor="middle" fill="#0a0e14" fontSize="8" fontWeight="bold">R3</text>
                            
                            <circle cx="420" cy="150" r="12" fill="#22c55e" />
                            <text x="420" y="154" textAnchor="middle" fill="#0a0e14" fontSize="8" fontWeight="bold">R4</text>
                            
                            {/* Spatial diversity pattern */}
                            <path d="M 100 100 L 420 50" stroke="#06b6d4" strokeWidth="1" opacity="0.2" strokeDasharray="2" />
                            <path d="M 100 100 L 455 100" stroke="#06b6d4" strokeWidth="1" opacity="0.2" strokeDasharray="2" />
                            <path d="M 100 100 L 480 140" stroke="#06b6d4" strokeWidth="1" opacity="0.2" strokeDasharray="2" />
                            <path d="M 100 100 L 420 150" stroke="#06b6d4" strokeWidth="1" opacity="0.2" strokeDasharray="2" />
                            
                            <text x="270" y="95" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="bold">
                              {selectedAntenna.range}
                            </text>
                          </g>
                        )}
                        
                        {/* Legend */}
                        <g transform="translate(20, 160)">
                          <circle cx="5" cy="5" r="5" fill="#06b6d4" />
                          <text x="15" y="9" fill="#6b7785" fontSize="10">Transmitter</text>
                          
                          <circle cx="90" cy="5" r="5" fill="#22c55e" />
                          <text x="100" y="9" fill="#6b7785" fontSize="10">Receiver</text>
                          
                          <line x1="180" y1="5" x2="200" y2="5" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4" />
                          <text x="205" y="9" fill="#6b7785" fontSize="10">Range</text>
                        </g>
                      </svg>
                      
                      {/* Key Measurements Callouts */}
                      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                        <div style={{ padding: '8px 12px', backgroundColor: '#141a23', borderRadius: '6px', borderLeft: '3px solid #06b6d4' }}>
                          <div style={{ fontSize: '10px', color: '#6b7785', marginBottom: '2px' }}>
                            <Ruler size={10} style={{ display: 'inline', marginRight: '4px' }} />
                            TYPICAL RANGE
                          </div>
                          <div style={{ fontSize: '14px', color: '#06b6d4', fontWeight: '600' }}>{selectedAntenna.range}</div>
                        </div>
                        <div style={{ padding: '8px 12px', backgroundColor: '#141a23', borderRadius: '6px', borderLeft: '3px solid #22c55e' }}>
                          <div style={{ fontSize: '10px', color: '#6b7785', marginBottom: '2px' }}>
                            <Antenna size={10} style={{ display: 'inline', marginRight: '4px' }} />
                            MIN DIVERSITY
                          </div>
                          <div style={{ fontSize: '14px', color: '#22c55e', fontWeight: '600' }}>6 ft spacing</div>
                        </div>
                        <div style={{ padding: '8px 12px', backgroundColor: '#141a23', borderRadius: '6px', borderLeft: '3px solid #f59e0b' }}>
                          <div style={{ fontSize: '10px', color: '#6b7785', marginBottom: '2px' }}>
                            <Navigation size={10} style={{ display: 'inline', marginRight: '4px' }} />
                            HEIGHT
                          </div>
                          <div style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '600' }}>8-12 ft min</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '12px', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                      Setup Instructions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedAntenna.setup.map((step, i) => (
                        <div 
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '12px',
                            backgroundColor: '#0d1117',
                            borderRadius: '6px'
                          }}
                        >
                          <span style={{
                            minWidth: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#1a2332',
                            color: '#06b6d4',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ fontSize: '13px', color: '#c5cdd9', lineHeight: '1.5' }}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Monitor Tab */}
        {activeTab === 'monitor' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Monitor Controls */}
            <div style={{
              backgroundColor: '#141a23',
              borderRadius: '12px',
              border: '1px solid #1e2730',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => connectionStatus.connected ? setIsMonitoring(!isMonitoring) : setShowConnectionModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 24px',
                      backgroundColor: isMonitoring ? '#991b1b' : '#166534',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {isMonitoring ? <Pause size={18} /> : <Play size={18} />}
                    {isMonitoring ? 'Stop' : 'Start'} Monitoring
                  </button>
                  
                  {/* Band Selector */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[
                      { id: 'full', label: 'Full Span' },
                      { id: 'band1', label: 'Band 1 (2.4G)' },
                      { id: 'band2', label: 'Band 2 (5G)' }
                    ].map(band => (
                      <button
                        key={band.id}
                        onClick={() => setFrequencyBand(band.id)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: monitorSettings.selectedBand === band.id ? '#1a2332' : 'transparent',
                          border: monitorSettings.selectedBand === band.id ? '1px solid #2d3f59' : '1px solid #2d3748',
                          borderRadius: '4px',
                          color: monitorSettings.selectedBand === band.id ? '#06b6d4' : '#6b7785',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {band.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7785', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={monitorSettings.showMaxHold}
                      onChange={(e) => setMonitorSettings(prev => ({ ...prev, showMaxHold: e.target.checked }))}
                    />
                    Max Hold
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7785', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={monitorSettings.showAverage}
                      onChange={(e) => setMonitorSettings(prev => ({ ...prev, showAverage: e.target.checked }))}
                    />
                    Average
                  </label>
                  <button
                    onClick={clearMaxHold}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#1e2730',
                      border: '1px solid #2d3748',
                      borderRadius: '4px',
                      color: '#c5cdd9',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={12} style={{ marginRight: '4px' }} />
                    Clear
                  </button>
                </div>
              </div>
              
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7785' }}>
                RF Explorer 6G WB Plus | {formatFrequency(monitorSettings.startFreqMHz)} - {formatFrequency(monitorSettings.endFreqMHz)}
                {!connectionStatus.connected && isMonitoring && <span style={{ color: '#f59e0b', marginLeft: '12px' }}>• Demo Mode</span>}
              </div>
            </div>

            {/* Spectrum Display */}
            <div style={{
              backgroundColor: '#141a23',
              borderRadius: '12px',
              border: '1px solid #1e2730',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  margin: 0
                }}>
                  <BarChart3 size={16} />
                  Spectrum Analysis
                </h2>
                {peakMarkers.length > 0 && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {peakMarkers.slice(0, 3).map((peak, i) => (
                      <div key={i} style={{ fontSize: '11px', color: getSignalStrengthColor(peak.amplitude) }}>
                        {formatFrequency(peak.frequency)}: {peak.amplitude.toFixed(1)} dBm
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={{
                height: '300px',
                backgroundColor: '#0a0e14',
                borderRadius: '8px',
                border: '1px solid #1e2730',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Grid lines */}
                {[-30, -40, -50, -60, -70, -80, -90, -100].map(db => (
                  <div
                    key={db}
                    style={{
                      position: 'absolute',
                      left: '45px',
                      right: '16px',
                      top: `${((db + 30) / -80) * 100 + 5}%`,
                      borderTop: '1px dashed #1e2730'
                    }}
                  >
                    <span style={{ 
                      position: 'absolute', 
                      left: '-40px', 
                      top: '-7px', 
                      fontSize: '10px', 
                      color: '#4a5568' 
                    }}>
                      {db}
                    </span>
                  </div>
                ))}
                
                {/* Threshold lines */}
                <div style={{
                  position: 'absolute',
                  left: '45px',
                  right: '16px',
                  top: `${((monitorSettings.warningThreshold + 30) / -80) * 100 + 5}%`,
                  borderTop: '1px dashed #f59e0b',
                  opacity: 0.5
                }} />
                <div style={{
                  position: 'absolute',
                  left: '45px',
                  right: '16px',
                  top: `${((monitorSettings.criticalThreshold + 30) / -80) * 100 + 5}%`,
                  borderTop: '1px dashed #ef4444',
                  opacity: 0.5
                }} />
                
                {/* Spectrum visualization */}
                <svg
                  style={{
                    position: 'absolute',
                    left: '50px',
                    right: '16px',
                    top: '16px',
                    bottom: '40px',
                    width: 'calc(100% - 66px)',
                    height: 'calc(100% - 56px)'
                  }}
                  preserveAspectRatio="none"
                >
                  {/* Max Hold trace */}
                  {monitorSettings.showMaxHold && maxHoldData.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#ef444480"
                      strokeWidth="1"
                      points={maxHoldData.map((point, i) => {
                        const x = (i / (maxHoldData.length - 1)) * 100;
                        const y = Math.max(0, Math.min(100, ((point.amplitude + 30) / -80) * 100));
                        return `${x}%,${y}%`;
                      }).join(' ')}
                    />
                  )}
                  
                  {/* Average trace */}
                  {monitorSettings.showAverage && avgData.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#22c55e80"
                      strokeWidth="1"
                      points={avgData.map((point, i) => {
                        const x = (i / (avgData.length - 1)) * 100;
                        const y = Math.max(0, Math.min(100, ((point.amplitude + 30) / -80) * 100));
                        return `${x}%,${y}%`;
                      }).join(' ')}
                    />
                  )}
                  
                  {/* Live trace with fill */}
                  {spectrumData.length > 0 && (
                    <>
                      <defs>
                        <linearGradient id="spectrumGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.1" />
                        </linearGradient>
                      </defs>
                      <polygon
                        fill="url(#spectrumGradient)"
                        points={[
                          '0%,100%',
                          ...spectrumData.map((point, i) => {
                            const x = (i / (spectrumData.length - 1)) * 100;
                            const y = Math.max(0, Math.min(100, ((point.amplitude + 30) / -80) * 100));
                            return `${x}%,${y}%`;
                          }),
                          '100%,100%'
                        ].join(' ')}
                      />
                      <polyline
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="1.5"
                        points={spectrumData.map((point, i) => {
                          const x = (i / (spectrumData.length - 1)) * 100;
                          const y = Math.max(0, Math.min(100, ((point.amplitude + 30) / -80) * 100));
                          return `${x}%,${y}%`;
                        }).join(' ')}
                      />
                    </>
                  )}
                </svg>

                {/* Frequency labels */}
                <div style={{
                  position: 'absolute',
                  left: '50px',
                  right: '16px',
                  bottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: '#4a5568'
                }}>
                  <span>{formatFrequency(monitorSettings.startFreqMHz)}</span>
                  <span>{formatFrequency((monitorSettings.startFreqMHz + monitorSettings.endFreqMHz) / 2)}</span>
                  <span>{formatFrequency(monitorSettings.endFreqMHz)}</span>
                </div>
                
                {/* No data overlay */}
                {spectrumData.length === 0 && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4a5568'
                  }}>
                    {isMonitoring ? 'Waiting for data...' : 'Click Start Monitoring to begin'}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div style={{ 
                display: 'flex', 
                gap: '24px', 
                marginTop: '16px',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#06b6d4' }} />
                  <span style={{ fontSize: '11px', color: '#6b7785' }}>Live</span>
                </div>
                {monitorSettings.showMaxHold && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#ef4444', opacity: 0.5 }} />
                    <span style={{ fontSize: '11px', color: '#6b7785' }}>Max Hold</span>
                  </div>
                )}
                {monitorSettings.showAverage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#22c55e', opacity: 0.5 }} />
                    <span style={{ fontSize: '11px', color: '#6b7785' }}>Average</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '20px', height: '1px', backgroundColor: '#f59e0b', opacity: 0.5 }} />
                  <span style={{ fontSize: '11px', color: '#6b7785' }}>Warning ({monitorSettings.warningThreshold} dBm)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '20px', height: '1px', backgroundColor: '#ef4444', opacity: 0.5 }} />
                  <span style={{ fontSize: '11px', color: '#6b7785' }}>Critical ({monitorSettings.criticalThreshold} dBm)</span>
                </div>
              </div>
            </div>

            {/* Event Log */}
            <div style={{
              backgroundColor: '#141a23',
              borderRadius: '12px',
              border: '1px solid #1e2730',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  margin: 0
                }}>
                  <List size={16} />
                  Event Log ({eventLog.length} events)
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7785', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={monitorSettings.autoLog}
                      onChange={(e) => setMonitorSettings(prev => ({ ...prev, autoLog: e.target.checked }))}
                    />
                    Auto-log
                  </label>
                  <button
                    onClick={exportEventLog}
                    disabled={eventLog.length === 0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      backgroundColor: '#1e2730',
                      border: '1px solid #2d3748',
                      borderRadius: '4px',
                      color: eventLog.length > 0 ? '#c5cdd9' : '#4a5568',
                      fontSize: '11px',
                      cursor: eventLog.length > 0 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                  <button
                    onClick={() => setEventLog([])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      backgroundColor: '#1e2730',
                      border: '1px solid #2d3748',
                      borderRadius: '4px',
                      color: '#c5cdd9',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                backgroundColor: '#0a0e14',
                borderRadius: '8px',
                border: '1px solid #1e2730'
              }}>
                {eventLog.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#4a5568' }}>
                    No events recorded. {!isMonitoring && 'Start monitoring to capture RF anomalies.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {eventLog.map((event, i) => (
                      <div 
                        key={event.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 16px',
                          borderBottom: i < eventLog.length - 1 ? '1px solid #1e2730' : 'none',
                          backgroundColor: event.type === 'critical' ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
                        }}
                      >
                        {event.type === 'critical' ? (
                          <AlertTriangle size={14} color="#ef4444" />
                        ) : (
                          <AlertTriangle size={14} color="#f59e0b" />
                        )}
                        <span style={{ 
                          fontSize: '11px', 
                          color: '#6b7785', 
                          fontFamily: 'monospace',
                          minWidth: '150px'
                        }}>
                          {formatTimestamp(event.timestamp)}
                        </span>
                        <span style={{ 
                          fontSize: '12px', 
                          color: event.type === 'critical' ? '#ef4444' : '#f59e0b',
                          fontWeight: '500',
                          minWidth: '70px'
                        }}>
                          {event.type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '12px', color: '#c5cdd9' }}>
                          {event.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Best Practices Tab */}
        {activeTab === 'bestpractices' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {BEST_PRACTICES.map(section => {
              const Icon = section.icon;
              return (
                <div 
                  key={section.category}
                  style={{
                    backgroundColor: '#141a23',
                    borderRadius: '12px',
                    border: '1px solid #1e2730',
                    padding: '24px'
                  }}
                >
                  <h2 style={{ 
                    fontSize: '16px', 
                    color: '#e6edf3',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: '#1a2332',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={18} color="#06b6d4" />
                    </div>
                    {section.category}
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                    {section.practices.map((practice, i) => (
                      <div 
                        key={i}
                        style={{
                          padding: '16px',
                          backgroundColor: '#0d1117',
                          borderRadius: '8px',
                          borderLeft: `3px solid ${
                            practice.priority === 'critical' ? '#ef4444' :
                            practice.priority === 'high' ? '#f59e0b' : '#22c55e'
                          }`
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '8px' }}>
                          <h3 style={{ fontSize: '14px', color: '#e6edf3', margin: 0 }}>
                            {practice.title}
                          </h3>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: practice.priority === 'critical' ? 'rgba(239, 68, 68, 0.2)' :
                              practice.priority === 'high' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                            color: practice.priority === 'critical' ? '#ef4444' :
                              practice.priority === 'high' ? '#f59e0b' : '#22c55e',
                            textTransform: 'uppercase',
                            fontWeight: '600'
                          }}>
                            {practice.priority}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', color: '#6b7785', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                          {practice.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Results & Reports Tab */}
        {activeTab === 'results' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Test Results Summary */}
            <div style={{
              backgroundColor: '#141a23',
              borderRadius: '12px',
              border: '1px solid #1e2730',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  color: '#6b7785', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em',
                  margin: 0
                }}>
                  Test Results
                </h2>
                <button
                  onClick={exportReport}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    backgroundColor: '#166534',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={16} />
                  Export Full Report
                </button>
              </div>
              
              {testResults.length === 0 ? (
                <div style={{ 
                  padding: '40px', 
                  textAlign: 'center', 
                  color: '#4a5568',
                  backgroundColor: '#0d1117',
                  borderRadius: '8px'
                }}>
                  No test results recorded yet. Complete tests in the Site Tests tab.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {testResults.map(result => (
                    <div 
                      key={result.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        backgroundColor: '#0d1117',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${result.status === 'pass' ? '#22c55e' : '#ef4444'}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {result.status === 'pass' ? (
                          <CheckCircle size={20} color="#22c55e" />
                        ) : (
                          <AlertTriangle size={20} color="#ef4444" />
                        )}
                        <div>
                          <div style={{ fontSize: '14px', color: '#e6edf3' }}>{result.testName}</div>
                          <div style={{ fontSize: '12px', color: '#6b7785' }}>
                            {formatTimestamp(result.timestamp)}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: result.status === 'pass' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: result.status === 'pass' ? '#22c55e' : '#ef4444'
                      }}>
                        {result.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Site Profile Summary */}
            <div style={{
              backgroundColor: '#141a23',
              borderRadius: '12px',
              border: '1px solid #1e2730',
              padding: '24px'
            }}>
              <h2 style={{ 
                fontSize: '14px', 
                color: '#6b7785', 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em',
                marginBottom: '20px'
              }}>
                Site Profile Summary
              </h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px',
                padding: '20px',
                backgroundColor: '#0d1117',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>VENUE</div>
                  <div style={{ fontSize: '14px', color: '#e6edf3' }}>{siteProfile.venueName || 'Not specified'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>TYPE</div>
                  <div style={{ fontSize: '14px', color: '#e6edf3' }}>
                    {SCENARIO_TEMPLATES.find(s => s.id === siteProfile.venueType)?.name || 'Not specified'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>EVENT DATE</div>
                  <div style={{ fontSize: '14px', color: '#e6edf3' }}>{siteProfile.date}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>TESTS COMPLETED</div>
                  <div style={{ fontSize: '14px', color: '#e6edf3' }}>{testResults.length} / {TEST_PROCEDURES.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>EVENTS LOGGED</div>
                  <div style={{ fontSize: '14px', color: '#e6edf3' }}>{eventLog.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7785', marginBottom: '4px' }}>CRITICAL ALERTS</div>
                  <div style={{ fontSize: '14px', color: eventLog.filter(e => e.type === 'critical').length > 0 ? '#ef4444' : '#e6edf3' }}>
                    {eventLog.filter(e => e.type === 'critical').length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: #0d1117;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #2d3748;
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #4a5568;
        }
        
        input, select {
          outline: none;
        }
        
        input:focus, select:focus {
          border-color: #06b6d4 !important;
        }
        
        button:hover {
          opacity: 0.9;
        }
        
        input[type="checkbox"] {
          accent-color: #06b6d4;
        }
      `}</style>
    </div>
  );
}
