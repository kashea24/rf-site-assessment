import { Activity, Maximize2, Pause, Play } from 'lucide-react';
import { useState } from 'react';

export default function LiveMonitor({ isConnected, currentReading, onTakeReading, isCapturing }) {
  const [isPaused, setIsPaused] = useState(false);
  const [maxHold, setMaxHold] = useState(false);

  // Simulated spectrum data - will be replaced with real RF Explorer data
  const generateSpectrumData = () => {
    const points = [];
    for (let i = 0; i < 100; i++) {
      const x = (i / 100) * 100;
      const y = 100 - (Math.random() * 40 + 20 + Math.sin(i / 10) * 15);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  };

  return (
    <div style={{
      backgroundColor: '#0d1117',
      border: '2px solid #2d3748',
      borderRadius: '8px',
      padding: '16px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={20} color="#06b6d4" />
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            color: '#e6edf3',
            fontWeight: '600'
          }}>
            Live RF Spectrum Monitor
          </h3>
          {isConnected ? (
            <span style={{
              padding: '4px 8px',
              backgroundColor: '#064e3b',
              color: '#22c55e',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '4px'
            }}>
              CONNECTED
            </span>
          ) : (
            <span style={{
              padding: '4px 8px',
              backgroundColor: '#2d1515',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '4px'
            }}>
              DISCONNECTED
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#6b7785',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={maxHold}
              onChange={(e) => setMaxHold(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Max Hold
          </label>
          
          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{
              padding: '6px',
              backgroundColor: '#1a2332',
              border: '1px solid #2d3748',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {isPaused ? <Play size={16} color="#06b6d4" /> : <Pause size={16} color="#06b6d4" />}
          </button>

          <button
            style={{
              padding: '6px',
              backgroundColor: '#1a2332',
              border: '1px solid #2d3748',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Maximize2 size={16} color="#6b7785" />
          </button>
        </div>
      </div>

      {/* Spectrum Display */}
      <div style={{
        backgroundColor: '#000000',
        borderRadius: '6px',
        border: '1px solid #2d3748',
        padding: '8px',
        height: '200px',
        position: 'relative'
      }}>
        {/* Frequency labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: '#6b7785',
          marginBottom: '4px'
        }}>
          <span>4900 MHz</span>
          <span>5400 MHz</span>
          <span>5875 MHz</span>
        </div>

        {/* Spectrum Graph */}
        <svg width="100%" height="160" style={{ display: 'block' }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={y * 1.6}
              x2="100%"
              y2={y * 1.6}
              stroke="#1a2332"
              strokeWidth="1"
            />
          ))}

          {/* dBm scale */}
          {[-40, -50, -60, -70, -80].map((dbm, i) => (
            <text
              key={dbm}
              x="5"
              y={i * 40 + 12}
              fontSize="10"
              fill="#6b7785"
            >
              {dbm}
            </text>
          ))}

          {/* Spectrum trace */}
          <polyline
            points={generateSpectrumData()}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            opacity="0.8"
          />
          
          {/* Fill under curve */}
          <polyline
            points={`0,160 ${generateSpectrumData()} 100,160`}
            fill="#06b6d4"
            opacity="0.1"
          />
        </svg>

        {/* Current reading overlay */}
        {currentReading && (
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(13, 17, 23, 0.9)',
            border: '1px solid #2d3748',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#e6edf3'
          }}>
            <div style={{ fontWeight: '600', color: '#06b6d4', marginBottom: '4px' }}>
              Current Reading
            </div>
            <div>Peak: {currentReading.peak} dBm</div>
            <div>Avg: {currentReading.average} dBm</div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginTop: '12px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onTakeReading}
          disabled={!isConnected || isCapturing}
          style={{
            padding: '10px 20px',
            backgroundColor: isConnected ? '#06b6d4' : '#1a2332',
            border: 'none',
            borderRadius: '6px',
            color: isConnected ? '#0a0e14' : '#6b7785',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            opacity: isCapturing ? 0.6 : 1
          }}
        >
          {isCapturing ? 'Capturing... (5s)' : 'Take Reading'}
        </button>
      </div>
    </div>
  );
}
