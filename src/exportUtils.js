// Export utilities with compression support
// Uses JSZip for creating compressed archives with proper file structure

import { logger } from './logger.js';

// Convert base64 to Blob
export function base64ToBlob(base64String) {
  const parts = base64String.split(',');
  const contentType = parts[0].split(':')[1].split(';')[0];
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  
  for (let i = 0; i < rawLength; i++) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  
  return new Blob([uInt8Array], { type: contentType });
}

// Export project with compression
export async function exportProjectCompressed(projectData, eventLog, spectrumData) {
  try {
    logger.info('Export', 'Starting compressed project export', { 
      eventCount: eventLog.length,
      hasFloorPlan: !!projectData.floorPlan 
    });
    
    // Dynamic import of JSZip (will need to install: npm install jszip)
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    // Create project metadata
    const metadata = {
      exportVersion: '1.0',
      exportDate: new Date().toISOString(),
      projectName: projectData.showName,
      venueName: projectData.venueName,
      showDates: {
        start: projectData.showStartDate,
        end: projectData.showEndDate
      }
    };
    
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));
    
    // Create project data (without floor plan)
    const projectDataClean = { ...projectData };
    delete projectDataClean.floorPlan; // Will be stored as separate file
    zip.file('project.json', JSON.stringify(projectDataClean, null, 2));
    
    // Store event log (all events for live event correlation)
    logger.debug('Export', 'Exporting event log', { count: eventLog.length });
    
    // Split event log into chunks for better performance
    const chunkSize = 1000;
    const eventLogFolder = zip.folder('eventLogs');
    
    for (let i = 0; i < eventLog.length; i += chunkSize) {
      const chunk = eventLog.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      eventLogFolder.file(
        `events_${chunkIndex.toString().padStart(4, '0')}.json`,
        JSON.stringify(chunk, null, 2)
      );
    }
    
    // Store floor plan as PNG (if exists)
    if (projectData.floorPlan) {
      logger.debug('Export', 'Exporting floor plan image');
      const floorPlanBlob = base64ToBlob(projectData.floorPlan);
      zip.file('floorPlan.png', floorPlanBlob);
    }
    
    // Store grid measurements
    if (projectData.gridMeasurements && Object.keys(projectData.gridMeasurements).length > 0) {
      logger.debug('Export', 'Exporting grid measurements', { 
        count: Object.keys(projectData.gridMeasurements).length 
      });
      zip.file('gridMeasurements.json', JSON.stringify(projectData.gridMeasurements, null, 2));
    }
    
    // Store equipment data
    if (projectData.equipment && projectData.equipment.length > 0) {
      logger.debug('Export', 'Exporting equipment data', { count: projectData.equipment.length });
      zip.file('equipment.json', JSON.stringify(projectData.equipment, null, 2));
    }
    
    // Store current spectrum snapshot (optional)
    if (spectrumData && spectrumData.length > 0) {
      logger.debug('Export', 'Exporting spectrum snapshot', { dataPoints: spectrumData.length });
      zip.file('spectrumSnapshot.json', JSON.stringify(spectrumData, null, 2));
    }
    
    // Generate README
    const readme = `# RF Site Assessment Export
    
Project: ${projectData.showName || 'Unnamed'}
Venue: ${projectData.venueName || 'Unknown'}
Exported: ${new Date().toLocaleString()}

## Contents
- metadata.json: Export information
- project.json: Project configuration and settings
- eventLogs/: RF event logs (${eventLog.length} total events)
- floorPlan.png: Venue floor plan${projectData.floorPlan ? '' : ' (not included)'}
- gridMeasurements.json: Grid test results${projectData.gridMeasurements ? '' : ' (not included)'}
- equipment.json: Equipment placement data${projectData.equipment ? '' : ' (not included)'}
- spectrumSnapshot.json: Spectrum data snapshot${spectrumData ? '' : ' (not included)'}

## File Format
This is a compressed ZIP archive. Extract all files to import the project.
Event logs are split into chunks of ${chunkSize} events for performance.

## Software
RF Site Assessment Tool
Export Version: 1.0
`;
    
    zip.file('README.txt', readme);
    
    // Generate compressed ZIP file
    logger.info('Export', 'Generating compressed archive');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 } // Maximum compression
    });
    
    const uncompressedSize = eventLog.length * 200 + (projectData.floorPlan?.length || 0);
    const compressedSize = zipBlob.size;
    const compressionRatio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);
    
    logger.info('Export', 'Export complete', {
      uncompressedSize: `${(uncompressedSize / 1024 / 1024).toFixed(2)} MB`,
      compressedSize: `${(compressedSize / 1024 / 1024).toFixed(2)} MB`,
      compressionRatio: `${compressionRatio}%`,
      eventCount: eventLog.length
    });
    
    return zipBlob;
    
  } catch (error) {
    logger.error('Export', 'Failed to export project', { error: error.message });
    throw error;
  }
}

// Download blob as file
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  logger.debug('Export', 'Download initiated', { filename, size: blob.size });
}

// Import compressed project (for future implementation)
export async function importProjectCompressed(zipFile) {
  try {
    logger.info('Import', 'Starting compressed project import');
    
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipFile);
    
    // Read metadata
    const metadataText = await zip.file('metadata.json').async('text');
    const metadata = JSON.parse(metadataText);
    
    logger.debug('Import', 'Metadata loaded', metadata);
    
    // Read project data
    const projectText = await zip.file('project.json').async('text');
    const projectData = JSON.parse(projectText);
    
    // Read event logs
    const eventLogs = [];
    const eventLogFiles = zip.folder('eventLogs').file(/events_\d+\.json$/);
    
    for (const file of eventLogFiles) {
      const text = await file.async('text');
      const chunk = JSON.parse(text);
      eventLogs.push(...chunk);
    }
    
    logger.debug('Import', 'Event logs loaded', { count: eventLogs.length });
    
    // Read floor plan
    let floorPlan = null;
    const floorPlanFile = zip.file('floorPlan.png');
    if (floorPlanFile) {
      const floorPlanBlob = await floorPlanFile.async('blob');
      floorPlan = await blobToBase64(floorPlanBlob);
      logger.debug('Import', 'Floor plan loaded');
    }
    
    // Read grid measurements
    let gridMeasurements = {};
    const gridMeasurementsFile = zip.file('gridMeasurements.json');
    if (gridMeasurementsFile) {
      const text = await gridMeasurementsFile.async('text');
      gridMeasurements = JSON.parse(text);
      logger.debug('Import', 'Grid measurements loaded', { 
        count: Object.keys(gridMeasurements).length 
      });
    }
    
    // Read equipment
    let equipment = [];
    const equipmentFile = zip.file('equipment.json');
    if (equipmentFile) {
      const text = await equipmentFile.async('text');
      equipment = JSON.parse(text);
      logger.debug('Import', 'Equipment loaded', { count: equipment.length });
    }
    
    logger.info('Import', 'Import complete', {
      projectName: projectData.showName,
      eventCount: eventLogs.length
    });
    
    return {
      metadata,
      projectData: {
        ...projectData,
        floorPlan,
        gridMeasurements,
        equipment
      },
      eventLogs
    };
    
  } catch (error) {
    logger.error('Import', 'Failed to import project', { error: error.message });
    throw error;
  }
}

// Convert Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
