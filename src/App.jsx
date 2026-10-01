import React, { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import MapComponent from './components/MapComponent';
import { parseGeoTiff } from './utils/geotiffLoader';
import { exportMissionKmz, exportEditedGeoJsonKmz } from './utils/kmzExporter';
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

  // --- Operational Mode ---
  // 'threat' (place threats), 'flight' (place flight waypoints), 'eraser' (cutout shapes)
  const [mode, setMode] = useState('threat');

  // --- Threats State ---
  const [threats, setThreats] = useState([]);
  const [defaultObsHeight, setDefaultObsHeight] = useState(10); // meters (e.g. 33 ft)
  const [defaultRange, setDefaultRange] = useState(5000); // meters (e.g. 5 km)
  const [defaultThreatColor, setDefaultThreatColor] = useState('#FF3333');

  // --- Altitude Tiers State ---
  const [altitudeTiers, setAltitudeTiers] = useState(DEFAULT_ALTITUDE_TIERS);
  const [visibleTiers, setVisibleTiers] = useState({
    '50ft': true,
    '200ft': true,
    '500ft': true,
    'custom': true
  });

  // --- Custom Target Altitude (Weapon / Custom Mode) ---
  const [enableCustomAlt, setEnableCustomAlt] = useState(false);
  const [customAltFt, setCustomAltFt] = useState(100);

  // --- Flight Waypoints (Preserved Feature) ---
  const [waypoints, setWaypoints] = useState([]);

  // --- Viewshed & Analysis State ---
  const [viewshedLayers, setViewshedLayers] = useState([]);
  const [lastRawResults, setLastRawResults] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);

  // --- Eraser Tool State ---
  const [blockSize, setBlockSize] = useState(50); // meters
  const [eraserPoints, setEraserPoints] = useState([]);

  // --- Drag & Drop state ---
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);

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
        // Trigger map to fit to new DEM extent
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

      // Transfer ArrayBuffer to Web Worker as a transferable object (zero-copy memory transfer)
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
      alert(`Could not load local SWBTA.tif. Please drag & drop the file directly.`);
    }
  };

  // Map Click Handler
  const handleMapClick = (latlng) => {
    if (analyzing) return;

    if (mode === 'eraser') {
      setEraserPoints(prev => [...prev, latlng]);
      return;
    }

    if (mode === 'threat') {
      // Check DEM bounds
      if (demMetadata && demMetadata.bbox) {
        const [minX, minY, maxX, maxY] = demMetadata.bbox;
        if (latlng.lng < minX || latlng.lng > maxX || latlng.lat < minY || latlng.lat > maxY) {
          alert('Warning: Placed threat is outside DEM operational coverage area.');
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
    } else if (mode === 'flight') {
      // Friendly waypoint
      const wpId = Date.now();
      const newWp = {
        id: wpId,
        lat: latlng.lat,
        lon: latlng.lng,
        dispAlt: 100,
        unit: 'm',
        radius: defaultRange,
        color: '#00FF00'
      };
      setWaypoints(prev => [...prev, newWp]);
    }
  };

  // Load tactical sample threats in SWBTA area
  const handleLoadSampleThreats = () => {
    // Preset coordinates corresponding to Shoalwater Bay Training Area (SWBTA)
    const presets = [
      {
        id: Date.now() + 1,
        name: 'Radar Alpha (Falcon E)',
        lat: -22.65,
        lon: 150.15,
        obsHeight: 12,
        range: 6000,
        color: '#FF3333',
        enabled: true
      },
      {
        id: Date.now() + 2,
        name: 'SAM Site Bravo (Eagle)',
        lat: -22.75,
        lon: 150.25,
        obsHeight: 10,
        range: 5000,
        color: '#FF9900',
        enabled: true
      },
      {
        id: Date.now() + 3,
        name: 'Observer Post Charlie',
        lat: -22.58,
        lon: 150.05,
        obsHeight: 15,
        range: 4500,
        color: '#FFFF00',
        enabled: true
      }
    ];
    setThreats(presets);
  };

  // Batch Execution: Run LOS Analysis across all enabled threats & active altitude tiers
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

    // Assemble altitude tiers
    const activeTiers = altitudeTiers.filter(t => t.enabled);
    if (enableCustomAlt) {
      activeTiers.push({
        id: 'custom',
        name: `${customAltFt} ft AGL (Custom)`,
        altitudeFt: customAltFt,
        altitudeM: customAltFt * 0.3048,
        color: '#00FFFF',
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

  // Delete Waypoint
  const handleDeleteWaypoint = (id) => {
    setWaypoints(prev => prev.filter(w => w.id !== id));
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

  // Eraser Tool Cutout
  const handleConfirmErasure = () => {
    if (eraserPoints.length < 3) {
      alert('Please draw at least 3 points on the map to define the cutout polygon.');
      return;
    }

    const coords = eraserPoints.map(p => [p.lng, p.lat]);
    coords.push(coords[0]); // Close ring

    const userPoly = turf.polygon([coords]);
    const bbox = turf.bbox(userPoly);
    const grid = turf.squareGrid(bbox, blockSize / 1000, { units: 'kilometers' });

    const intersectingSquares = grid.features.filter(square => turf.booleanIntersects(square, userPoly));

    if (intersectingSquares.length === 0) {
      setEraserPoints([]);
      return;
    }

    const eraserShape = turf.union(turf.featureCollection(intersectingSquares));

    setViewshedLayers(prevLayers => {
      return prevLayers.map(layer => {
        try {
          const clippedFeatures = layer.geojson.features.map(f => {
            if (f.properties?.DN !== 255) return f;

            try {
              const diff = turf.difference(turf.featureCollection([f, eraserShape]));
              if (!diff) return null;
              diff.properties = { ...f.properties };
              return diff;
            } catch (e) {
              console.warn('Clipping feature error:', e);
              return f;
            }
          }).filter(Boolean);

          return {
            ...layer,
            geojson: {
              ...layer.geojson,
              features: clippedFeatures
            }
          };
        } catch (e) {
          console.error('Viewshed layer erasure error:', e);
          return layer;
        }
      });
    });

    setEraserPoints([]);
  };

  // Export Mission KMZ (All Tiers)
  const handleExportMissionKmz = async () => {
    if (!lastRawResults || lastRawResults.length === 0) {
      alert('No LOS analysis results available to export. Run analysis first.');
      return;
    }

    try {
      await exportMissionKmz({
        threats,
        losResults: lastRawResults,
        filename: 'mission_viewshed_copernicus.kmz'
      });
    } catch (e) {
      console.error('KMZ Export failed:', e);
      alert(`KMZ Export failed: ${e.message}`);
    }
  };

  // Export Edited KMZ
  const handleExportEditedKmz = async () => {
    if (viewshedLayers.length === 0) {
      alert('No viewshed data to export.');
      return;
    }

    try {
      // Combine all features
      const allFeatures = [];
      viewshedLayers.forEach(l => {
        if (l.geojson && l.geojson.features) {
          allFeatures.push(...l.geojson.features);
        }
      });

      const combinedGeoJson = {
        type: 'FeatureCollection',
        features: allFeatures
      };

      await exportEditedGeoJsonKmz({
        geojson: combinedGeoJson,
        color: '#FF9900',
        name: 'Edited_LOS_Viewshed',
        filename: 'viewshed_edited.kmz'
      });
    } catch (e) {
      console.error('Edited KMZ export failed:', e);
      alert(`Edited KMZ export failed: ${e.message}`);
    }
  };

  // Clear All
  const handleClearAll = () => {
    setThreats([]);
    setWaypoints([]);
    setViewshedLayers([]);
    setLastRawResults(null);
    setEraserPoints([]);
  };

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-badge">GLO-30</div>
          <h2>LOS Mission Planner</h2>
        </div>

        {/* DEM Ingestion Section */}
        <div className="sidebar-section dem-section">
          <div className="section-title">
            <span>Terrain Elevation (DEM)</span>
            {demMetadata && <span className="status-badge ready">READY</span>}
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
              <div className="dropzone-icon">&#8681;</div>
              <div className="dropzone-text">Drop Copernicus GLO-30 (.tif)</div>
              <button className="btn-browse" type="button">Browse Local File</button>
            </div>
          ) : (
            <div className="dem-info-card">
              <div className="dem-filename">{demMetadata.fileName}</div>
              <div className="dem-grid">
                <div><strong>Grid:</strong> {demMetadata.width} &times; {demMetadata.height}</div>
                <div><strong>Resolution:</strong> ~30m (GLO-30)</div>
                <div><strong>Format:</strong> GeoTIFF / EPSG:4326</div>
              </div>
              <div className="dem-actions">
                <button
                  className="btn-dem-action"
                  onClick={() => setTriggerFitBounds(prev => prev + 1)}
                  title="Fit Map to DEM Coverage"
                >
                  Fit DEM Bounds
                </button>
                <button
                  className="btn-dem-action secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change DEM File"
                >
                  Change File
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

          {/* Quick-load button for SWBTA.tif */}
          <button
            className="btn-sample-load"
            onClick={handleLoadSampleSwbta}
            disabled={demLoading}
          >
            &#9881; Load Local SWBTA.tif
          </button>

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

        {/* Operational Mode Selection */}
        <div className="sidebar-section">
          <div className="section-title">Operational Mode</div>
          <div className="mode-toggle-group">
            <button
              className={`mode-btn ${mode === 'threat' ? 'active' : ''}`}
              onClick={() => setMode('threat')}
            >
              &#9673; Threat Placement
            </button>
            <button
              className={`mode-btn ${mode === 'flight' ? 'active' : ''}`}
              onClick={() => setMode('flight')}
            >
              &#9992; Flight Plan
            </button>
            <button
              className={`mode-btn ${mode === 'eraser' ? 'active' : ''}`}
              onClick={() => setMode('eraser')}
            >
              &#9986; Eraser Tool
            </button>
          </div>
        </div>

        {/* Threat Placement Controls */}
        {mode === 'threat' && (
          <div className="sidebar-section">
            <div className="section-title">
              <span>Threat Configuration</span>
              <button
                className="btn-tiny"
                onClick={handleLoadSampleThreats}
                title="Load SWBTA sample threat radar sites"
              >
                + SWBTA Presets
              </button>
            </div>

            <div className="control-row">
              <label>Default Observer Height: {defaultObsHeight} m ({Math.round(defaultObsHeight / 0.3048)} ft)</label>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={defaultObsHeight}
                onChange={(e) => setDefaultObsHeight(Number(e.target.value))}
              />
            </div>

            <div className="control-row">
              <label>Default Radar / Sensor Range: {defaultRange} m ({(defaultRange / 1000).toFixed(1)} km)</label>
              <input
                type="range"
                min="1000"
                max="20000"
                step="500"
                value={defaultRange}
                onChange={(e) => setDefaultRange(Number(e.target.value))}
              />
            </div>

            <div className="control-row">
              <label>Threat Color:</label>
              <div className="color-picker-row">
                {['#FF3333', '#FF9900', '#FFFF00', '#FF00FF', '#00FFFF'].map(c => (
                  <button
                    key={c}
                    className={`color-dot ${defaultThreatColor === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setDefaultThreatColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="threats-list-container">
              <div className="threats-header">
                <strong>Threat List ({threats.length})</strong>
                <small>Click map to place</small>
              </div>

              {threats.length === 0 ? (
                <div className="empty-hint">No threats placed. Click on map inside DEM to place a threat.</div>
              ) : (
                <div className="threats-scroll">
                  {threats.map((threat) => (
                    <div key={threat.id} className={`threat-card ${threat.enabled ? '' : 'disabled'}`}>
                      <div className="threat-card-top">
                        <input
                          type="checkbox"
                          checked={threat.enabled}
                          onChange={() => handleToggleThreat(threat.id)}
                          title="Toggle Threat Active"
                        />
                        <span className="threat-card-name" style={{ color: threat.color }}>
                          {threat.name}
                        </span>
                        <button
                          className="btn-threat-delete"
                          onClick={() => handleDeleteThreat(threat.id)}
                          title="Delete Threat"
                        >
                          &times;
                        </button>
                      </div>
                      <div className="threat-card-details">
                        <span>{threat.lat.toFixed(4)}&deg;, {threat.lon.toFixed(4)}&deg;</span>
                        <span>Obs: {threat.obsHeight}m | R: {threat.range}m</span>
                        {threat.groundElev !== null && threat.groundElev !== undefined && (
                          <span className="elev-tag">Elev: {threat.groundElev.toFixed(0)}m</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Altitude Tiers Section */}
        <div className="sidebar-section">
          <div className="section-title">Altitude Tiers (AGL)</div>
          <div className="tiers-list">
            {altitudeTiers.map(tier => (
              <div key={tier.id} className="tier-row">
                <label className="tier-label">
                  <input
                    type="checkbox"
                    checked={tier.enabled}
                    onChange={() => handleToggleTier(tier.id)}
                  />
                  <span className="tier-swatch" style={{ backgroundColor: tier.color }}></span>
                  <span className="tier-name">{tier.name}</span>
                </label>
                <button
                  className={`btn-tier-view ${visibleTiers[tier.id] ? 'active' : ''}`}
                  onClick={() => handleToggleTierVisibility(tier.id)}
                  title="Toggle Layer Visibility on Map"
                >
                  {visibleTiers[tier.id] ? '👁' : '🚫'}
                </button>
              </div>
            ))}

            <div className="custom-tier-toggle">
              <label className="tier-label">
                <input
                  type="checkbox"
                  checked={enableCustomAlt}
                  onChange={(e) => setEnableCustomAlt(e.target.checked)}
                />
                <span className="tier-swatch" style={{ backgroundColor: '#00FFFF' }}></span>
                <span>Custom Altitude ({customAltFt} ft AGL)</span>
              </label>
              {enableCustomAlt && (
                <input
                  type="range"
                  min="20"
                  max="5000"
                  step="50"
                  value={customAltFt}
                  onChange={(e) => setCustomAltFt(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '5px' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Eraser Tool Controls */}
        {mode === 'eraser' && (
          <div className="sidebar-section eraser-box">
            <div className="section-title" style={{ color: '#ff6666' }}>Eraser Cutout Tool</div>
            <div className="control-row">
              <label>Block Grid Size: {blockSize} m</label>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={blockSize}
                onChange={(e) => setBlockSize(Number(e.target.value))}
              />
              <small style={{ color: '#aaa' }}>
                Click map to draw polygon ring. Click Confirm to subtract terrain block cutout.
              </small>
            </div>
            <div className="eraser-buttons">
              <button className="btn-confirm-eraser" onClick={handleConfirmErasure}>
                Confirm Cutout ({eraserPoints.length} pts)
              </button>
              <button className="btn-clear-eraser" onClick={() => setEraserPoints([])}>
                Clear Points
              </button>
            </div>
          </div>
        )}

        {/* Run LOS Analysis & KMZ Export Buttons */}
        <div className="sidebar-section execution-section">
          <button
            className={`btn-run-los ${analyzing ? 'pulse' : ''}`}
            onClick={handleRunLosAnalysis}
            disabled={analyzing || !demMetadata || threats.length === 0}
          >
            {analyzing ? '⚡ Calculating LOS...' : '▶ Run LOS Analysis'}
          </button>

          {analyzing && analysisProgress && (
            <div className="los-progress-box">
              <div>Processing Threat {analysisProgress.current} / {analysisProgress.total}</div>
              <small>{analysisProgress.threatName}</small>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${analysisProgress.percent}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="kmz-export-group">
            <button
              className="btn-export-kmz"
              onClick={handleExportMissionKmz}
              disabled={viewshedLayers.length === 0}
            >
              &#128190; Export Mission KMZ
            </button>
            <button
              className="btn-export-kmz secondary"
              onClick={handleExportEditedKmz}
              disabled={viewshedLayers.length === 0}
            >
              Export Edited KMZ
            </button>
          </div>

          <button className="btn-clear-all" onClick={handleClearAll}>
            Clear All
          </button>
        </div>

        {/* Status / Footer */}
        <div className="sidebar-footer">
          <div>Engine: Web Worker + GeoTIFF Bilinear Sampler</div>
          <div>CRS: WGS-84 / EPSG:4326</div>
        </div>
      </div>

      {/* Main Leaflet Map Wrapper */}
      <div className="map-wrapper">
        <MapComponent
          onMapClick={handleMapClick}
          viewshedData={viewshedLayers}
          threats={threats}
          waypoints={waypoints}
          mode={mode}
          onDeleteThreat={handleDeleteThreat}
          onDeleteWaypoint={handleDeleteWaypoint}
          eraserPoints={eraserPoints}
          demBbox={demMetadata?.bbox}
          triggerFitBounds={triggerFitBounds}
          visibleTiers={visibleTiers}
          showRangeRings={true}
        />
      </div>
    </div>
  );
}

export default App;
