// IndexedDB wrapper for persistent storage
// Provides structured storage for large datasets with querying capability

const DB_NAME = 'RFSiteAssessment';
const DB_VERSION = 1;

// Open/create database
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Projects store
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        projectStore.createIndex('showName', 'showName', { unique: false });
        projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      
      // Event logs store (for long-running sessions)
      if (!db.objectStoreNames.contains('eventLogs')) {
        const eventStore = db.createObjectStore('eventLogs', { keyPath: 'id', autoIncrement: true });
        eventStore.createIndex('projectId', 'projectId', { unique: false });
        eventStore.createIndex('timestamp', 'timestamp', { unique: false });
        eventStore.createIndex('type', 'type', { unique: false });
      }
      
      // Spectrum snapshots store
      if (!db.objectStoreNames.contains('spectrumSnapshots')) {
        const snapshotStore = db.createObjectStore('spectrumSnapshots', { keyPath: 'id', autoIncrement: true });
        snapshotStore.createIndex('projectId', 'projectId', { unique: false });
        snapshotStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Floor plan images store (blob storage)
      if (!db.objectStoreNames.contains('floorPlans')) {
        const floorPlanStore = db.createObjectStore('floorPlans', { keyPath: 'id', autoIncrement: true });
        floorPlanStore.createIndex('projectId', 'projectId', { unique: false });
      }
      
      // Settings store (for app preferences, UI state, etc.)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Save project
export async function saveProject(projectData) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects'], 'readwrite');
    const store = transaction.objectStore('projects');
    
    const data = {
      ...projectData,
      updatedAt: new Date().toISOString()
    };
    
    if (!data.createdAt) {
      data.createdAt = data.updatedAt;
    }
    
    const request = data.id ? store.put(data) : store.add(data);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get project by ID
export async function getProject(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects'], 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get all projects
export async function getAllProjects() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects'], 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save event logs in batches (for performance during live events)
export async function saveEventLogBatch(projectId, events) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['eventLogs'], 'readwrite');
    const store = transaction.objectStore('eventLogs');
    
    events.forEach(event => {
      store.add({
        ...event,
        projectId,
        timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp)
      });
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Get event logs for project (paginated)
export async function getEventLogs(projectId, options = {}) {
  const { limit = 1000, offset = 0, startDate, endDate, type } = options;
  
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['eventLogs'], 'readonly');
    const store = transaction.objectStore('eventLogs');
    const index = store.index('projectId');
    const request = index.getAll(projectId);
    
    request.onsuccess = () => {
      let events = request.result;
      
      // Apply filters
      if (startDate) {
        events = events.filter(e => e.timestamp >= startDate);
      }
      if (endDate) {
        events = events.filter(e => e.timestamp <= endDate);
      }
      if (type) {
        events = events.filter(e => e.type === type);
      }
      
      // Sort by timestamp (newest first)
      events.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply pagination
      const paginated = events.slice(offset, offset + limit);
      
      resolve({
        events: paginated,
        total: events.length,
        hasMore: offset + limit < events.length
      });
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Get event log count for project
export async function getEventLogCount(projectId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['eventLogs'], 'readonly');
    const store = transaction.objectStore('eventLogs');
    const index = store.index('projectId');
    const request = index.count(projectId);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save floor plan as blob
export async function saveFloorPlan(projectId, imageBlob) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floorPlans'], 'readwrite');
    const store = transaction.objectStore('floorPlans');
    
    const request = store.add({
      projectId,
      imageBlob,
      createdAt: new Date().toISOString()
    });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get floor plan for project
export async function getFloorPlan(projectId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floorPlans'], 'readonly');
    const store = transaction.objectStore('floorPlans');
    const index = store.index('projectId');
    const request = index.get(projectId);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Delete project and all associated data
export async function deleteProject(projectId) {
  const db = await openDatabase();
  
  // Delete from all stores
  const stores = ['projects', 'eventLogs', 'spectrumSnapshots', 'floorPlans'];
  
  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      if (storeName === 'projects') {
        const request = store.delete(projectId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } else {
        const index = store.index('projectId');
        const request = index.openCursor(projectId);
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        
        request.onerror = () => reject(request.error);
      }
    });
  }
}

// Export all project data for backup/transfer
export async function exportProjectData(projectId) {
  const project = await getProject(projectId);
  const eventLogs = await getEventLogs(projectId, { limit: Infinity });
  const floorPlan = await getFloorPlan(projectId);
  
  return {
    project,
    eventLogs: eventLogs.events,
    floorPlan: floorPlan?.imageBlob
  };
}

// Clear all data (for testing/reset)
export async function clearAllData() {
  const db = await openDatabase();
  const stores = ['projects', 'eventLogs', 'spectrumSnapshots', 'floorPlans', 'settings'];
  
  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Save setting
export async function saveSetting(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    const request = store.put({
      key,
      value,
      updatedAt: new Date().toISOString()
    });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get setting
export async function getSetting(key, defaultValue = null) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : defaultValue);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get current or create new project
export async function getCurrentProject() {
  const projects = await getAllProjects();
  
  if (projects.length === 0) {
    // Create default project
    const projectId = await saveProject({
      showName: 'Untitled Project',
      createdAt: new Date().toISOString()
    });
    return await getProject(projectId);
  }
  
  // Get the most recently updated project
  projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return projects[0];
}
