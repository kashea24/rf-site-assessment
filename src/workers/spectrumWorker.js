/**
 * Web Worker for Spectrum Data Processing
 * 
 * Handles CPU-intensive spectrum analysis tasks off the main thread:
 * - Delta encoding reconstruction
 * - Max hold calculations
 * - Moving average calculations
 * - Peak detection
 * - Auto-logging event detection
 * 
 * This keeps the UI responsive during high-frequency sweep updates.
 */

// Worker state
let baselineSpectrum = null;
let maxHoldData = null;
let avgData = null;

/**
 * Reconstruct full spectrum from delta-encoded data
 */
function reconstructDeltaSpectrum(baseline, deltas) {
  const reconstructed = baseline.map(point => ({
    frequency: point.frequency,
    amplitude: point.amplitude
  }));
  
  deltas.forEach(delta => {
    if (delta.index >= 0 && delta.index < reconstructed.length) {
      reconstructed[delta.index].amplitude = delta.amplitude;
    }
  });
  
  return reconstructed;
}

/**
 * Update max hold data
 */
function updateMaxHold(current, previous) {
  if (!previous || previous.length !== current.length) {
    return current;
  }
  
  return current.map((point, i) => ({
    frequency: point.frequency,
    amplitude: Math.max(point.amplitude, previous[i]?.amplitude || -120)
  }));
}

/**
 * Update moving average (exponential moving average)
 */
function updateAverage(current, previous) {
  if (!previous || previous.length !== current.length) {
    return current;
  }
  
  // EMA with alpha = 0.1 (weighs new data at 10%, old at 90%)
  return current.map((point, i) => ({
    frequency: point.frequency,
    amplitude: (point.amplitude + (previous[i]?.amplitude || point.amplitude) * 9) / 10
  }));
}

/**
 * Find peaks in spectrum data
 */
function findPeaks(data, threshold = -70) {
  const peaks = [];
  
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i].amplitude > data[i-1].amplitude && 
        data[i].amplitude > data[i+1].amplitude &&
        data[i].amplitude > threshold) {
      peaks.push({
        frequency: data[i].frequency,
        amplitude: data[i].amplitude,
        index: i
      });
    }
  }
  
  // Sort by amplitude (strongest first) and return top 5
  peaks.sort((a, b) => b.amplitude - a.amplitude);
  return peaks.slice(0, 5);
}

/**
 * Format frequency for display
 */
function formatFrequency(freqMHz) {
  if (freqMHz >= 1000) {
    return `${(freqMHz / 1000).toFixed(2)} GHz`;
  }
  return `${freqMHz.toFixed(1)} MHz`;
}

/**
 * Detect and generate auto-log events
 */
function detectEvents(data, timestamp, settings) {
  const events = [];
  const { autoLog, criticalThreshold, warningThreshold } = settings;
  
  if (!autoLog) return events;
  
  data.forEach((point, index) => {
    if (point.amplitude > criticalThreshold) {
      events.push({
        id: Date.now() + Math.random() + index,
        timestamp: new Date(timestamp),
        type: 'critical',
        frequency: point.frequency,
        strength: point.amplitude.toFixed(1),
        message: `Critical interference at ${formatFrequency(point.frequency)}: ${point.amplitude.toFixed(1)} dBm`
      });
    } else if (point.amplitude > warningThreshold && Math.random() > 0.95) {
      events.push({
        id: Date.now() + Math.random() + index,
        timestamp: new Date(timestamp),
        type: 'warning',
        frequency: point.frequency,
        strength: point.amplitude.toFixed(1),
        message: `Elevated signal at ${formatFrequency(point.frequency)}: ${point.amplitude.toFixed(1)} dBm`
      });
    }
  });
  
  return events;
}

/**
 * Main message handler
 */
self.onmessage = function(e) {
  const { type, payload } = e.data;
  
  try {
    switch (type) {
      case 'PROCESS_SWEEP': {
        const { 
          sweepData, 
          monitorSettings,
          currentBaselineSpectrum,
          currentMaxHoldData,
          currentAvgData
        } = payload;
        
        const { data, timestamp, encoding, deltas, baseline, baseline_age, compression_ratio } = sweepData;
        
        let reconstructedData = data;
        let deltaStats = null;
        let baselineUpdated = false;
        
        // Handle delta encoding
        if (encoding === 'delta' && deltas && currentBaselineSpectrum) {
          reconstructedData = reconstructDeltaSpectrum(currentBaselineSpectrum, deltas);
          
          // Update delta stats
          if (compression_ratio !== undefined) {
            deltaStats = {
              compressionRatio: compression_ratio,
              lastUpdate: Date.now(),
              deltaCount: deltas.length,
              baselineAge: baseline_age
            };
          }
          
          self.postMessage({
            type: 'LOG',
            payload: {
              level: 'debug',
              category: 'Worker',
              message: 'Delta sweep reconstructed',
              data: {
                deltaCount: deltas.length,
                compressionRatio: compression_ratio,
                baselineAge: baseline_age
              }
            }
          });
        } else if (baseline || !currentBaselineSpectrum) {
          // This is a full baseline sweep, store it
          baselineSpectrum = data;
          baselineUpdated = true;
          
          self.postMessage({
            type: 'LOG',
            payload: {
              level: 'info',
              category: 'Worker',
              message: 'Baseline spectrum updated',
              data: {
                dataPoints: data?.length || 0,
                isInitialBaseline: !currentBaselineSpectrum
              }
            }
          });
        }
        
        // Update max hold
        const newMaxHold = updateMaxHold(reconstructedData, currentMaxHoldData);
        
        // Update average
        const newAvg = updateAverage(reconstructedData, currentAvgData);
        
        // Find peaks
        const peaks = findPeaks(reconstructedData);
        
        // Detect events
        const events = detectEvents(reconstructedData, timestamp, monitorSettings);
        
        // Send results back to main thread
        self.postMessage({
          type: 'SWEEP_PROCESSED',
          payload: {
            spectrumData: reconstructedData,
            maxHoldData: newMaxHold,
            avgData: newAvg,
            peakMarkers: peaks,
            events: events,
            deltaStats: deltaStats,
            baselineSpectrum: baselineUpdated ? data : null,
            timestamp: timestamp,
            encoding: encoding || 'full'
          }
        });
        
        break;
      }
      
      case 'RESET_MAX_HOLD': {
        maxHoldData = null;
        self.postMessage({
          type: 'MAX_HOLD_RESET',
          payload: { success: true }
        });
        break;
      }
      
      case 'RESET_BASELINE': {
        baselineSpectrum = null;
        self.postMessage({
          type: 'BASELINE_RESET',
          payload: { success: true }
        });
        break;
      }
      
      case 'RESET_ALL': {
        baselineSpectrum = null;
        maxHoldData = null;
        avgData = null;
        self.postMessage({
          type: 'ALL_RESET',
          payload: { success: true }
        });
        break;
      }
      
      default:
        console.warn('Unknown worker message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};

// Signal that worker is ready
self.postMessage({
  type: 'WORKER_READY',
  payload: { timestamp: Date.now() }
});
