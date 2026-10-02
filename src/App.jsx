import React, { useState, useEffect, useRef } from 'react';
import MapComponent from './components/MapComponent';
import AddThreatModal from './components/AddThreatModal';
import { parseGeoTiff } from './utils/geotiffLoader';
import { exportMissionKmz } from './utils/kmzExporter';
import { toMGRS } from './utils/coordinates';
import './App.css';

// Default altitude tiers for tactical Line of Sight
const DEFAULT_ALTITUDE_TIERS = [
  { id: '50ft', name: '50 ft AGL', altitudeFt: 50, altitudeM: 15.24, color: '#FF3333', enabled: true },
  { id: '200ft', name: '200 ft AGL', altitudeFt: 200, altitudeM: 60.96, color: '#FF9900', enabled: true },
  { id: '500ft', name: '500 ft AGL', altitudeFt: 500, altitudeM: 152.4, color: '#FFFF00', enabled: true }
];

function App() {
  // --- DEM State ---
  const [demMetadata, setDemMetadata] = useState(null); // { width, height, bbox, noData, fileName }
  const [demLoading, setDemLoading] = useState(false);
  const [demProgress, setDemProgress] = useState(null); // { stage, percent, text }
  const [triggerFitBounds, setTriggerFitBounds] = useState(0);

  // --- Web Worker Reference ---
  const workerRef = useRef(null);

  // --- Threats State ---
  const [threats, setThreats] = useState([]);
  const [defaultObsHeight, setDefaultObsHeight] = useState(10); // meters (e.g. 33 ft)
  const [defaultRange, setDefaultRange] = useState(5000); // meters (e.g. 5 km)
  const [defaultThreatColor, setDefaultThreatColor] = useState('#FF3333');
  const [isAddThreatModalOpen, setIsAddThreatModalOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);

  // --- Altitude Tiers State ---
  const [altitudeTiers, setAltitudeTiers] = useState(DEFAULT_ALTITUDE_TIERS);
  const [visibleTiers, setVisibleTiers] = useState({
    '50ft': true,
    '200ft': true,
    '500ft': true,
    'custom': true
  });

  // --- Custom Target Altitude ---
  const [enableCustomAlt, setEnableCustomAlt] = useState(false);
  const [customAltFt, setCustomAltFt] = useState(100);

  // --- Viewshed & Analysis State ---
  const [viewshedLayers, setViewshedLayers] = useState([]);
  const [lastRawResults, setLastRawResults] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);

  // --- Drag & Drop & UI State ---
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const fileInputRef = useRef(null);
  const disclaimerRef = useRef(null);

  // Close disclaimer when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (disclaimerRef.current && !disclaimerRef.current.contains(event.target)) {
        setShowDisclaimer(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(new URL('./workers/losWorker.js', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (event) => {
      const { type, data, error } = event.data;

      if (type === 'DEM_LOADED') {
        setDemLoading(false);
        setDemProgress(null);
        setTriggerFitBounds(prev => prev + 1);
      } else if (type === 'LOS_PROGRESS') {
        setAnalysisProgress(data);
      } else if (type === 'LOS_ANALYSIS_COMPLETE') {
        setAnalyzing(false);
        setAnalysisProgress(null);

        const results = data.results || [];
        setLastRawResults(results);

        // Flatten results into map layers
        const layers = [];
        results.forEach(res => {
          if (res.error) return;

          // Update threat ground elevation if available
          if (res.groundElevation !== undefined) {
            setThreats(prev => prev.map(t => t.id === res.threatId ? { ...t, groundElev: res.groundElevation } : t));
          }

          (res.tierResults || []).forEach(tier => {
            layers.push({
              key: `${res.threatId}-${tier.tierId}`,
              id: res.threatId,
              threatName: res.threatName,
              tierId: tier.tierId,
              tierName: tier.tierName,
              altitudeFt: tier.altitudeFt,
              color: tier.color,
              geojson: tier.geojson
            });
          });
        });

        setViewshedLayers(layers);
      } else if (type === 'LOS_ERROR') {
        setAnalyzing(false);
        setAnalysisProgress(null);
        alert(`LOS Analysis Error: ${error}`);
      }
    };

    worker.onerror = (err) => {
      console.error('LOS Worker Error:', err);
      setAnalyzing(false);
      setDemLoading(false);
      alert('An error occurred inside the LOS Web Worker.');
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  // Handle loading and parsing a GeoTIFF (File or ArrayBuffer)
  const processGeoTiffSource = async (source, fileName = 'Copernicus_DEM.tif') => {
    try {
      setDemLoading(true);
      setDemProgress({ stage: 'reading', percent: 10, text: `Loading ${fileName}...` });

      const parsed = await parseGeoTiff(source, (p) => {
        setDemProgress({
          stage: p.stage,
          percent: p.percent,
          text: p.stage === 'reading_file' ? 'Reading file buffer...'
              : p.stage === 'parsing_geotiff' ? 'Parsing GeoTIFF tags & bounds...'
              : p.stage === 'reading_rasters' ? 'Decompressing 30m elevation rasters...'
              : 'Transferring raster buffer to Web Worker...'
        });
      });

      setDemMetadata({
        fileName: fileName,
        width: parsed.width,
        height: parsed.height,
        bbox: parsed.bbox,
        noData: parsed.noData
      });

      // Transfer ArrayBuffer to Web Worker as transferable object
      setDemProgress({ stage: 'transferring', percent: 90, text: 'Transferring raster to Web Worker...' });
      workerRef.current.postMessage(
        {
          type: 'LOAD_DEM',
          data: {
            buffer: parsed.buffer,
            width: parsed.width,
            height: parsed.height,
            bbox: parsed.bbox,
            noData: parsed.noData
          }
        },
        [parsed.buffer]
      );
    } catch (err) {
      console.error('Failed to parse GeoTIFF:', err);
      setDemLoading(false);
      setDemProgress(null);
      alert(`Failed to load GeoTIFF: ${err.message}`);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processGeoTiffSource(file, file.name);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.tif') || file.name.endsWith('.tiff'))) {
      processGeoTiffSource(file, file.name);
    } else {
      alert('Please drop a valid .tif or .tiff Copernicus DEM file.');
    }
  };

  // Load SWBTA.tif directly from local public/
  const handleLoadSampleSwbta = async () => {
    try {
      setDemLoading(true);
      setDemProgress({ stage: 'fetching', percent: 5, text: 'Fetching local SWBTA.tif...' });

      const response = await fetch('/SWBTA.tif');
      if (!response.ok) {
        throw new Error(`Failed to fetch /SWBTA.tif (Status: ${response.status})`);
      }

      const blob = await response.blob();
      await processGeoTiffSource(blob, 'SWBTA.tif (Copernicus GLO-30)');
    } catch (err) {
      console.error('Error fetching SWBTA.tif:', err);
      setDemLoading(false);
      setDemProgress(null);
      alert('Could not load local SWBTA.tif. Please drag & drop the file directly.');
    }
  };

  // Map Click Handler: Deploy Threat
  const handleMapClick = (latlng) => {
    if (analyzing) return;

    // Check DEM bounds
    if (demMetadata && demMetadata.bbox) {
      const [minX, minY, maxX, maxY] = demMetadata.bbox;
      if (latlng.lng < minX || latlng.lng > maxX || latlng.lat < minY || latlng.lat > maxY) {
        alert('Notice: Placed threat is outside the current DEM coverage area.');
      }
    }

    const threatId = Date.now();
    const newThreat = {
      id: threatId,
      name: `Threat ${threats.length + 1}`,
      lat: latlng.lat,
      lon: latlng.lng,
      obsHeight: defaultObsHeight,
      range: defaultRange,
      color: defaultThreatColor,
      enabled: true,
      groundElev: null
    };

    setThreats(prev => [...prev, newThreat]);
  };

  // Update threat name
  const handleUpdateThreatName = (id, newName) => {
    setThreats(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
    setViewshedLayers(prev => prev.map(l => l.id === id ? { ...l, threatName: newName } : l));
  };

  // Deploy threat from coordinate / MGRS modal
  const handleAddThreatFromModal = (threatData) => {
    if (demMetadata && demMetadata.bbox) {
      const [minX, minY, maxX, maxY] = demMetadata.bbox;
      if (threatData.lon < minX || threatData.lon > maxX || threatData.lat < minY || threatData.lat > maxY) {
        alert('Notice: Deployed threat is outside current DEM coverage area. Viewshed analysis will require DEM coverage in this area.');
      }
    }

    const threatId = Date.now();
    const newThreat = {
      id: threatId,
      name: threatData.name || `Threat ${threats.length + 1}`,
      lat: threatData.lat,
      lon: threatData.lon,
      obsHeight: threatData.obsHeight !== undefined ? threatData.obsHeight : defaultObsHeight,
      range: threatData.range !== undefined ? threatData.range : defaultRange,
      color: threatData.color || defaultThreatColor,
      enabled: true,
      groundElev: null
    };

    setThreats(prev => [...prev, newThreat]);
    setFocusTarget({ lat: threatData.lat, lon: threatData.lon, ts: Date.now() });
  };

  // Focus map on specific threat
  const handleFocusThreat = (threat) => {
    setFocusTarget({ lat: threat.lat, lon: threat.lon, ts: Date.now() });
  };


  // Run LOS Analysis
  const handleRunLosAnalysis = () => {
    if (!demMetadata) {
      alert('Please load a Copernicus GLO-30 DEM file first.');
      return;
    }

    const enabledThreats = threats.filter(t => t.enabled !== false);
    if (enabledThreats.length === 0) {
      alert('No active threats configured. Place at least one threat on the map.');
      return;
    }

    const activeTiers = altitudeTiers.filter(t => t.enabled);
    if (enableCustomAlt) {
      activeTiers.push({
        id: 'custom',
        name: `${customAltFt} ft AGL (Custom)`,
        altitudeFt: customAltFt,
        altitudeM: customAltFt * 0.3048,
        color: '#00e5ff',
        enabled: true
      });
    }

    if (activeTiers.length === 0) {
      alert('Please select at least one altitude tier to analyze.');
      return;
    }

    setAnalyzing(true);
    setAnalysisProgress({ current: 0, total: enabledThreats.length, percent: 0, threatName: 'Initializing...' });

    workerRef.current.postMessage({
      type: 'RUN_LOS_ANALYSIS',
      data: {
        threats: enabledThreats,
        altitudeTiers: activeTiers
      }
    });
  };

  // Delete Threat
  const handleDeleteThreat = (id) => {
    setThreats(prev => prev.filter(t => t.id !== id));
    setViewshedLayers(prev => prev.filter(l => l.id !== id));
  };

  // Toggle Threat Enabled
  const handleToggleThreat = (id) => {
    setThreats(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  // Toggle Altitude Tier in analysis
  const handleToggleTier = (tierId) => {
    setAltitudeTiers(prev => prev.map(t => t.id === tierId ? { ...t, enabled: !t.enabled } : t));
  };

  // Toggle Altitude Tier map display visibility
  const handleToggleTierVisibility = (tierId) => {
    setVisibleTiers(prev => ({ ...prev, [tierId]: !prev[tierId] }));
  };

  // Export Mission KMZ
  const handleExportMissionKmz = async () => {
    if (!lastRawResults || lastRawResults.length === 0) {
      alert('No LOS analysis results available to export. Run viewshed analysis first.');
      return;
    }

    try {
      await exportMissionKmz({
        threats,
        losResults: lastRawResults,
        filename: 'mission_viewshed.kmz'
      });
    } catch (e) {
      console.error('KMZ Export failed:', e);
      alert(`KMZ Export failed: ${e.message}`);
    }
  };

  // Clear All
  const handleClearAll = () => {
    setThreats([]);
    setViewshedLayers([]);
    setLastRawResults(null);
  };

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <aside className="sidebar">
        {/* Sleek Tactical Header */}
        <div className="sidebar-header">
          <div className="header-brand">
            <div className="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div className="brand-text">
              <h1 className="brand-title">VIEWSHED PLANNER</h1>
              <span className="brand-subtitle">Tactical Line of Sight Engine</span>
            </div>
          </div>

          <div className="header-actions">
            {demMetadata && (
              <span className="live-status-pill">
                <span className="live-dot"></span> 30m DEM
              </span>
            )}

            {/* Disclaimer trigger icon (supports hover & click) */}
            <div
              className="disclaimer-anchor"
              ref={disclaimerRef}
              onMouseEnter={() => setShowDisclaimer(true)}
              onMouseLeave={() => setShowDisclaimer(false)}
            >
              <button
                type="button"
                className={`btn-info-icon ${showDisclaimer ? 'active' : ''}`}
                onClick={() => setShowDisclaimer(prev => !prev)}
                title="Data & Methodology Info"
                aria-label="Data Sources, Height Math, and Methodology Info"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </button>

              {/* Disclaimer Popover Card */}
              {showDisclaimer && (
                <div className="disclaimer-popover">
                  <div className="disclaimer-header">
                    <span className="disclaimer-title">Data & Elevation Info</span>
                    <button className="btn-close-popover" onClick={() => setShowDisclaimer(false)}>&times;</button>
                  </div>
                  <div className="disclaimer-body">
                    <div className="disclaimer-point">
                      <strong>Threat Height (AGL):</strong> Threat height is measured <em>Above Ground Level</em> at that exact point. The engine samples the 30m DEM elevation under the threat and adds the mast height (e.g. 150m terrain + 10m mast = 160m total altitude). Target tiers (50ft, 200ft, 500ft) are also measured above local ground.
                    </div>
                    <div className="disclaimer-point">
                      <strong>Open Source 30m DEM:</strong> Powered by open-source Copernicus GLO-30 (~30m ground resolution) elevation data.
                    </div>
                    <div className="disclaimer-point">
                      <strong>Tree Canopy (2024):</strong> Includes global 2024 tree canopy coverage to account for forest screening and ridge obstruction.
                    </div>
                    <div className="disclaimer-point">
                      <strong>Earth Curvature:</strong> Applies standard 4/3 effective Earth curvature and atmospheric refraction.
                    </div>
                    <div className="disclaimer-note">
                      Notice: Intended for tactical mission visualization. Sub-30m features or recent construction should be field-verified.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DEM Ingestion Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-label">Terrain Elevation (DEM)</span>
            {demMetadata && <span className="badge-ready">ACTIVE</span>}
          </div>

          {!demMetadata ? (
            <div
              className={`dropzone ${isDraggingOver ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".tif,.tiff"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div className="dropzone-svg">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="dropzone-text-primary">Drop Copernicus GLO-30 GeoTIFF</div>
              <div className="dropzone-text-sub">Supports 30m .tif / .tiff with 2024 tree canopy</div>
              <button className="btn-browse-file" type="button">Select File</button>
            </div>
          ) : (
            <div className="dem-telemetry-card">
              <div className="dem-file-row">
                <div className="dem-file-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
                <div className="dem-filename" title={demMetadata.fileName}>{demMetadata.fileName}</div>
              </div>

              <div className="dem-stats-matrix">
                <div className="stat-pill">
                  <span className="stat-pill-label">GRID</span>
                  <span className="stat-pill-val">{demMetadata.width} &times; {demMetadata.height}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">RESOLUTION</span>
                  <span className="stat-pill-val">30m GLO-30</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">CANOPY</span>
                  <span className="stat-pill-val">2024 Trees</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">DATUM</span>
                  <span className="stat-pill-val">WGS84</span>
                </div>
              </div>

              <div className="dem-actions-row">
                <button
                  className="btn-dem-sub"
                  onClick={() => setTriggerFitBounds(prev => prev + 1)}
                  title="Fit Map to Coverage Bounds"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Fit Bounds
                </button>
                <button
                  className="btn-dem-sub secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Load New DEM File"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Replace DEM
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tif,.tiff"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* Quick-load Sample DEM Button */}
          {!demMetadata && (
            <button
              className="btn-load-sample"
              onClick={handleLoadSampleSwbta}
              disabled={demLoading}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                <line x1="8" y1="2" x2="8" y2="18"></line>
                <line x1="16" y1="6" x2="16" y2="22"></line>
              </svg>
              Load Sample Area (SWBTA Australia)
            </button>
          )}

          {demLoading && demProgress && (
            <div className="loading-card">
              <div className="loading-label">{demProgress.text}</div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${demProgress.percent}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Threat Configuration Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-label">Threat Deployment</span>
            <button
              className="btn-preset-link"
              onClick={() => setIsAddThreatModalOpen(true)}
              title="Add threat site by coordinate (DD, DDM, DMS) or Military Grid (MGRS)"
            >
              + Add by Coord / MGRS
            </button>
          </div>

          <div className="deployment-hint">
            <span className="hint-crosshair">+</span>
            <span>Click map inside DEM to place threat</span>
          </div>

          {/* Default Parameters */}
          <div className="control-group">
            <div className="slider-control">
              <div className="slider-header">
                <span className="slider-label">Default Observer Height</span>
                <span className="slider-val">{defaultObsHeight} m <span className="val-secondary">({Math.round(defaultObsHeight / 0.3048)} ft)</span></span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={defaultObsHeight}
                onChange={(e) => setDefaultObsHeight(Number(e.target.value))}
                className="sleek-slider"
              />
            </div>

            <div className="slider-control">
              <div className="slider-header">
                <span className="slider-label">Default Radar / Sensor Range</span>
                <span className="slider-val">{(defaultRange / 1000).toFixed(1)} km <span className="val-secondary">({defaultRange} m)</span></span>
              </div>
              <input
                type="range"
                min="1000"
                max="20000"
                step="500"
                value={defaultRange}
                onChange={(e) => setDefaultRange(Number(e.target.value))}
                className="sleek-slider"
              />
            </div>

            <div className="color-control">
              <span className="control-label">Default Color</span>
              <div className="color-swatch-list">
                {['#FF3333', '#FF9900', '#FFFF00', '#00e5ff', '#a855f7'].map(c => (
                  <button
                    key={c}
                    className={`color-swatch ${defaultThreatColor === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setDefaultThreatColor(c)}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Threats List */}
          <div className="threats-container">
            <div className="threats-list-header">
              <span className="list-title">Active Threats</span>
              <span className="threat-counter">{threats.length}</span>
            </div>

            {threats.length === 0 ? (
              <div className="empty-threats-card">
                No threats configured. Click map inside the DEM extent to position a radar or observer site.
              </div>
            ) : (
              <div className="threats-scrollable">
                {threats.map((threat) => (
                  <div key={threat.id} className={`threat-item ${threat.enabled ? '' : 'disabled'}`}>
                    <div className="threat-row-main">
                      <label className="threat-checkbox-label" title="Toggle Threat Active">
                        <input
                          type="checkbox"
                          checked={threat.enabled}
                          onChange={() => handleToggleThreat(threat.id)}
                        />
                        <span className="threat-color-indicator" style={{ backgroundColor: threat.color }}></span>
                      </label>

                      {/* Editable Threat Name */}
                      <input
                        type="text"
                        className="threat-name-editable"
                        value={threat.name}
                        onChange={(e) => handleUpdateThreatName(threat.id, e.target.value)}
                        placeholder="Threat Name..."
                        title="Click to rename threat"
                      />

                      <button
                        className="btn-delete-threat"
                        onClick={() => handleDeleteThreat(threat.id)}
                        title="Delete Threat"
                        aria-label="Delete Threat"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>

                    <div className="threat-row-meta">
                      <span className="meta-tag mgrs-tag" title="MGRS Grid">
                        {toMGRS(threat.lat, threat.lon)}
                      </span>
                      <span className="meta-tag">{threat.lat.toFixed(4)}&deg;, {threat.lon.toFixed(4)}&deg;</span>
                      <span className="meta-tag">Obs: {threat.obsHeight}m</span>
                      <span className="meta-tag">R: {(threat.range / 1000).toFixed(1)}km</span>
                      {threat.groundElev !== null && threat.groundElev !== undefined && (
                        <span className="meta-tag elev-badge">Elev: {threat.groundElev.toFixed(0)}m</span>
                      )}
                      <button
                        type="button"
                        className="btn-locate-threat"
                        onClick={() => handleFocusThreat(threat)}
                        title="Locate threat on map"
                        aria-label="Locate threat on map"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Altitude Tiers Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-label">Target Altitude Tiers (AGL)</span>
          </div>

          <div className="tiers-container">
            {altitudeTiers.map(tier => (
              <div key={tier.id} className="tier-card">
                <label className="tier-check-wrapper">
                  <input
                    type="checkbox"
                    checked={tier.enabled}
                    onChange={() => handleToggleTier(tier.id)}
                  />
                  <span className="tier-color-bar" style={{ backgroundColor: tier.color }}></span>
                  <div className="tier-info">
                    <span className="tier-title">{tier.name}</span>
                    <span className="tier-metric">({tier.altitudeM.toFixed(1)} m Clearance)</span>
                  </div>
                </label>

                {/* Sleek SVG Eye Visibility Button */}
                <button
                  type="button"
                  className={`btn-visibility-toggle ${visibleTiers[tier.id] ? 'visible' : 'hidden'}`}
                  onClick={() => handleToggleTierVisibility(tier.id)}
                  title={visibleTiers[tier.id] ? 'Hide layer from map' : 'Show layer on map'}
                >
                  {visibleTiers[tier.id] ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
            ))}

            {/* Custom Altitude Tier */}
            <div className="tier-card custom-tier-card">
              <div className="tier-custom-header">
                <label className="tier-check-wrapper">
                  <input
                    type="checkbox"
                    checked={enableCustomAlt}
                    onChange={(e) => setEnableCustomAlt(e.target.checked)}
                  />
                  <span className="tier-color-bar" style={{ backgroundColor: '#00e5ff' }}></span>
                  <div className="tier-info">
                    <span className="tier-title">Custom Altitude</span>
                    <span className="tier-metric">({customAltFt} ft / {(customAltFt * 0.3048).toFixed(1)} m AGL)</span>
                  </div>
                </label>
              </div>

              {enableCustomAlt && (
                <div className="custom-slider-wrap">
                  <input
                    type="range"
                    min="20"
                    max="5000"
                    step="50"
                    value={customAltFt}
                    onChange={(e) => setCustomAltFt(Number(e.target.value))}
                    className="sleek-slider"
                  />
                  <div className="slider-ticks">
                    <span>20 ft</span>
                    <span>2500 ft</span>
                    <span>5000 ft</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Execution & Export Section */}
        <div className="sidebar-section execution-panel">
          <button
            className={`btn-calculate-viewshed ${analyzing ? 'is-analyzing' : ''}`}
            onClick={handleRunLosAnalysis}
            disabled={analyzing || !demMetadata || threats.length === 0}
          >
            {analyzing ? (
              <>
                <span className="spinner-ring"></span>
                <span>Calculating Raycasts...</span>
              </>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Calculate Viewshed</span>
              </>
            )}
          </button>

          {analyzing && analysisProgress && (
            <div className="calc-progress-hud">
              <div className="progress-status-line">
                <span>Threat {analysisProgress.current} of {analysisProgress.total}</span>
                <span className="percent-num">{analysisProgress.percent}%</span>
              </div>
              <div className="progress-threat-title">{analysisProgress.threatName}</div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill animated"
                  style={{ width: `${analysisProgress.percent}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="export-actions">
            <button
              className="btn-export-primary"
              onClick={handleExportMissionKmz}
              disabled={viewshedLayers.length === 0}
              title="Export Full 3D Viewshed Mission KMZ for Google Earth"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Mission KMZ
            </button>

            <button
              className="btn-clear-session"
              onClick={handleClearAll}
              title="Clear all threats and viewshed results"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <footer className="sidebar-footer">
          <div className="footer-brand-row">
            <span className="footer-brand-title">TACTICAL LOS ENGINE</span>
            <span className="engine-tag">v2.4 &bull; GLO-30</span>
          </div>
          <div className="footer-meta-row">
            <span>EPSG:4326 &bull; Web Worker LOS &bull; 2024 Canopy</span>
          </div>
        </footer>
      </aside>

      {/* Main Tactical Map */}
      <main className="map-wrapper">
        <MapComponent
          onMapClick={handleMapClick}
          viewshedData={viewshedLayers}
          threats={threats}
          onDeleteThreat={handleDeleteThreat}
          onUpdateThreatName={handleUpdateThreatName}
          demBbox={demMetadata?.bbox}
          triggerFitBounds={triggerFitBounds}
          focusTarget={focusTarget}
          visibleTiers={visibleTiers}
          showRangeRings={true}
        />
      </main>

      {/* Add Threat by Coordinates / MGRS Modal */}
      <AddThreatModal
        isOpen={isAddThreatModalOpen}
        onClose={() => setIsAddThreatModalOpen(false)}
        onAddThreat={handleAddThreatFromModal}
        demMetadata={demMetadata}
        defaultObsHeight={defaultObsHeight}
        defaultRange={defaultRange}
        defaultThreatColor={defaultThreatColor}
        threatsCount={threats.length}
      />
    </div>
  );
}

export default App;
