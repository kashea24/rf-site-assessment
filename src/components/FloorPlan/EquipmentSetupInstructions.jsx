import { Power, Usb } from 'lucide-react';

export default function EquipmentSetupInstructions() {
  return (
    <div style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '20px', color: '#e6edf3', margin: '0 0 24px 0', fontWeight: '600' }}>
        🔧 Equipment Setup
      </h3>

      {/* RF Explorer Setup */}
      <div style={{
        padding: '24px',
        backgroundColor: '#0d1117',
        borderRadius: '12px',
        border: '1px solid #2d3748',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'start' }}>
          {/* Device Image */}
          <div style={{
            flex: '0 0 300px',
            position: 'relative'
          }}>
            {/* RF Explorer SVG Representation */}
            <svg width="300" height="200" viewBox="0 0 300 200" style={{ display: 'block' }}>
              {/* Device body */}
              <rect x="20" y="30" width="260" height="140" rx="8" fill="#1a2332" stroke="#2d3748" strokeWidth="2"/>
              
              {/* Screen */}
              <rect x="40" y="50" width="220" height="80" rx="4" fill="#0a0e14" stroke="#06b6d4" strokeWidth="1"/>
              <text x="150" y="85" fill="#06b6d4" fontSize="12" textAnchor="middle" fontFamily="monospace">
                RF EXPLORER
              </text>
              <text x="150" y="105" fill="#22c55e" fontSize="10" textAnchor="middle" fontFamily="monospace">
                SPECTRUM ANALYZER
              </text>
              
              {/* Power Button - Top Left */}
              <circle cx="60" cy="155" r="8" fill="#ef4444" stroke="#fff" strokeWidth="1"/>
              <circle cx="60" cy="155" r="3" fill="#fff"/>
              
              {/* USB Port - Right Side */}
              <rect x="270" y="90" width="15" height="10" rx="2" fill="#6b7785" stroke="#2d3748" strokeWidth="1"/>
              <rect x="272" y="92" width="11" height="6" rx="1" fill="#0a0e14"/>
              
              {/* Antenna Connector */}
              <circle cx="150" y="180" r="6" fill="#f59e0b" stroke="#2d3748" strokeWidth="1"/>
            </svg>

            {/* Callout for Power Button */}
            <div style={{
              position: 'absolute',
              top: '115px',
              left: '0px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '40px',
                height: '2px',
                backgroundColor: '#ef4444'
              }}/>
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#2d1515',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                <Power size={14} style={{ display: 'inline', marginRight: '4px' }} />
                POWER
              </div>
            </div>

            {/* Callout for USB Port */}
            <div style={{
              position: 'absolute',
              top: '60px',
              right: '-10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#1a2d3d',
                border: '1px solid #06b6d4',
                borderRadius: '6px',
                color: '#06b6d4',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                <Usb size={14} style={{ display: 'inline', marginRight: '4px' }} />
                USB-C
              </div>
              <div style={{
                width: '30px',
                height: '2px',
                backgroundColor: '#06b6d4'
              }}/>
            </div>

            {/* Callout for Antenna */}
            <div style={{
              position: 'absolute',
              bottom: '0px',
              left: '110px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px'
            }}>
              <div style={{
                width: '2px',
                height: '20px',
                backgroundColor: '#f59e0b'
              }}/>
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#2d2515',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                📡 ANTENNA
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: '16px', color: '#06b6d4', margin: '0 0 16px 0', fontWeight: '600' }}>
              RF Explorer 6G WB Plus
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                padding: '16px',
                backgroundColor: '#1a2332',
                borderRadius: '8px',
                border: '1px solid #2d3748'
              }}>
                <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '8px' }}>
                  Step 1: Power On
                </div>
                <p style={{ fontSize: '14px', color: '#6b7785', margin: 0, lineHeight: '1.6' }}>
                  Press and hold the red <Power size={14} style={{ display: 'inline', color: '#ef4444' }} /> <strong>POWER</strong> button for 2 seconds until the screen lights up. 
                  The device will display "RF Explorer" during boot.
                </p>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: '#1a2332',
                borderRadius: '8px',
                border: '1px solid #2d3748'
              }}>
                <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '8px' }}>
                  Step 2: Connect USB
                </div>
                <p style={{ fontSize: '14px', color: '#6b7785', margin: 0, lineHeight: '1.6' }}>
                  Connect the USB-C cable from your computer to the <Usb size={14} style={{ display: 'inline', color: '#06b6d4' }} /> <strong>USB-C</strong> port on the right side of the device. 
                  Your browser will prompt you to connect - click "Connect" when the RF Explorer appears.
                </p>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: '#1a2332',
                borderRadius: '8px',
                border: '1px solid #2d3748'
              }}>
                <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600', marginBottom: '8px' }}>
                  Step 3: Attach Antenna
                </div>
                <p style={{ fontSize: '14px', color: '#6b7785', margin: 0, lineHeight: '1.6' }}>
                  Screw the included wideband antenna onto the <span style={{ color: '#f59e0b' }}>📡 ANTENNA</span> connector at the bottom center of the device. 
                  Hand-tighten only - do not use tools.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Important Notes */}
      <div style={{
        padding: '16px',
        backgroundColor: '#2d2515',
        border: '1px solid #f59e0b',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '600', marginBottom: '8px' }}>
          ⚠️ Important Notes
        </div>
        <ul style={{ fontSize: '14px', color: '#e6edf3', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>Keep the device away from metal objects and your body for accurate readings</li>
          <li>Fully charge before use (3-4 hours via USB-C)</li>
          <li>Use Chrome or Edge browser for Web Serial API support</li>
        </ul>
      </div>
    </div>
  );
}
