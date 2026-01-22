# RF Interference Data Sources

## Overview
This document outlines available data sources for detecting and predicting RF interference at event venues.

## 1. FCC ULS (Universal Licensing System)
- **URL**: https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp
- **API**: https://www.fcc.gov/wireless/public-safety-and-homeland-security/spectrum-management-resources
- **Coverage**: Licensed wireless systems in the US
- **Data Includes**:
  - TV broadcast stations (nearby transmitters)
  - Wireless microphone coordination databases
  - Licensed two-way radio systems
  - Cellular towers and licensed spectrum
- **Use Case**: Check for nearby licensed transmitters that could cause interference
- **Free**: Yes (public FCC data)

## 2. FCC CDBS (Consolidated Database System)
- **URL**: https://www.fcc.gov/media/engineering/cdbs
- **Coverage**: Broadcast TV and radio stations
- **Data Includes**:
  - TV channel assignments by geography
  - Signal strength predictions by location
  - Protected frequencies for wireless microphones
- **Use Case**: Identify TV channels in use (critical for wireless mic frequency selection)
- **Free**: Yes

## 3. Wireless Microphone Frequency Coordination Services

### WBEC (Worldwide Broadcast Engineering Consultants)
- **URL**: https://www.freqcoord.com/
- **Service**: Commercial frequency coordination
- **Coverage**: Event-specific coordination with local spectrum managers
- **Data**: Real-time frequency availability at venues
- **Cost**: Paid service

### Sennheiser WSM (Wireless Systems Manager)
- **Software**: Desktop application
- **Features**: 
  - FCC database integration
  - TV channel scanning
  - Intermodulation calculation
  - Frequency set calculation
- **Free**: Yes (software download)

### Shure Wireless Workbench
- **Software**: Desktop application
- **Similar features to WSM**
- **Free**: Yes

## 4. CellMapper / OpenCelliD
- **URL**: https://www.cellmapper.net/ and https://opencellid.org/
- **Coverage**: Cellular tower locations worldwide
- **API**: OpenCelliD has public API
- **Data Includes**:
  - Cell tower locations and frequencies
  - LTE/5G band usage by location
  - Signal strength heatmaps
- **Use Case**: Identify nearby cellular interference sources
- **Free**: Yes (OpenCelliD API has rate limits)

## 5. RadioReference.com
- **URL**: https://www.radioreference.com/
- **Coverage**: Public safety, business, and amateur radio frequencies
- **Data Includes**:
  - Police/fire/EMS frequencies by city
  - Business band users
  - Repeater locations
  - Airport frequencies
- **Use Case**: Identify local radio systems that might interfere
- **Free**: Limited (full database requires subscription)

## 6. Spectrum Management Databases by Country

### UK: Ofcom Spectrum Database
- **URL**: https://www.ofcom.org.uk/spectrum
- **Coverage**: UK licensed spectrum

### EU: EFIS (European Frequency Information System)
- **URL**: https://www.efis.dk/
- **Coverage**: European frequency allocations

### Canada: ISED Spectrum Management System
- **URL**: https://sms-sgs.ic.gc.ca/
- **Coverage**: Canadian spectrum licenses

## 7. WiFi Spectrum (2.4 GHz / 5 GHz)
- **Method**: On-site WiFi scanning
- **Tools**: 
  - WiFi Analyzer apps
  - RF Explorer (can scan 2.4 GHz with appropriate model)
  - Ubiquiti WiFiman (free app)
- **Use Case**: Identify WiFi congestion at venue
- **Note**: Must be done on-site, not via API

## 8. Bluetooth Interference
- **Frequency**: 2.4 GHz band
- **Method**: On-site scanning only
- **Consideration**: High device density at events (phones, headsets, etc.)

## Implementation Priority for Our App

### Phase 1: Essential (Free APIs)
1. **FCC ULS API** - Get nearby broadcast TV stations
2. **OpenCelliD API** - Get cellular tower locations
3. **Display warnings** based on proximity to interference sources

### Phase 2: Enhanced
1. **FCC CDBS integration** - Calculate white space channels
2. **Frequency recommendation engine** based on known local spectrum usage
3. **Interference probability scoring** per frequency band

### Phase 3: Advanced (Requires Partnerships/Paid)
1. **Real-time spectrum occupancy data**
2. **Integration with professional coordination services**
3. **Crowdsourced interference reports** from other technicians

## Data We Can Display in Wizard

Based on venue coordinates from Geoapify:
1. **Nearby TV stations** (channel numbers and frequencies)
2. **Cellular towers within 1km** (carriers and bands)
3. **High-risk interference zones** (near airports, stadiums with permanent systems)
4. **Recommended frequency ranges** based on local spectrum usage
5. **Historical interference reports** (if we build a database)

## API Integration Plan

```javascript
// Example: Query FCC ULS for nearby licenses
async function getNearbyTransmitters(lat, lon, radiusKm) {
  const fccApiUrl = 'https://data.fcc.gov/api/license-view/basicSearch/getLicenses';
  // Query for broadcast, wireless mic, and other relevant license types
}

// Example: Query OpenCelliD for cell towers
async function getNearbyCellTowers(lat, lon, radiusKm) {
  const apiUrl = 'https://opencellid.org/cell/getInArea';
  const apiKey = 'YOUR_KEY'; // Free tier: 500 requests/day
}
```

## Next Steps
1. Register for OpenCelliD API key
2. Implement FCC ULS query endpoint
3. Add "Interference Analysis" section to wizard
4. Display warnings and recommendations
