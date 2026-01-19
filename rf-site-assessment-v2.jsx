import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Antenna, Activity, FileText, Settings, AlertTriangle, CheckCircle, Clock, MapPin, Wifi, Zap, BarChart3, List, BookOpen, ChevronRight, Play, Pause, Download, Plus, Trash2, Eye, Signal, Usb, RefreshCw, X, Sliders } from 'lucide-react';

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
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function RFSiteAssessment() {
  // Connection state
  const rfConnectionRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, type: null });
  const [connectionError, setConnectionError] = useState(null);
  const [isWebSerialSupported, setIsWebSerialSupported] = useState(false);
  
  // Application state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [eventLog, setEventLog] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedAntenna, setSelectedAntenna] = useState(null);
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
      setConnectionError(null);
      if (method === 'serial') {
        await rfConnectionRef.current.connectSerial();
      } else {
        await rfConnectionRef.current.connectWebSocket(wsUrl);
      }
      setIsMonitoring(true);
    } catch (error) {
      setConnectionError(error.message);
    }
  };

  // Disconnect
  const disconnectDevice = async () => {
    setIsMonitoring(false);
    await rfConnectionRef.current.disconnect();
  };

  // Set frequency band
  const setFrequencyBand = async (band) => {
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

  const addTestResult = (testId, result) => {
    const test = TEST_PROCEDURES.find(t => t.id === testId);
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

      {/* Main Content */}
      <main style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Site Profile Card */}
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
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <MapPin size={16} />
                Site Profile
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7785', display: 'block', marginBottom: '6px' }}>
                    VENUE NAME
                  </label>
                  <input
                    type="text"
                    value={siteProfile.venueName}
                    onChange={(e) => setSiteProfile(prev => ({ ...prev, venueName: e.target.value }))}
                    placeholder="Enter venue name"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0d1117',
                      border: '1px solid #2d3748',
                      borderRadius: '6px',
                      color: '#e6edf3',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7785', display: 'block', marginBottom: '6px' }}>
                    VENUE TYPE
                  </label>
                  <select
                    value={siteProfile.venueType}
                    onChange={(e) => setSiteProfile(prev => ({ ...prev, venueType: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0d1117',
                      border: '1px solid #2d3748',
                      borderRadius: '6px',
                      color: '#e6edf3',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select type...</option>
                    {SCENARIO_TEMPLATES.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - {s.venue}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7785', display: 'block', marginBottom: '6px' }}>
                    EVENT DATE
                  </label>
                  <input
                    type="date"
                    value={siteProfile.date}
                    onChange={(e) => setSiteProfile(prev => ({ ...prev, date: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0d1117',
                      border: '1px solid #2d3748',
                      borderRadius: '6px',
                      color: '#e6edf3',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
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
