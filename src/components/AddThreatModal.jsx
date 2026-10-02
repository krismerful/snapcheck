import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  parseCoordinateInput,
  fromDDM,
  fromDMS,
  toDD,
  toDDM,
  toDMS,
  toMGRS
} from '../utils/coordinates';

const COLOR_PALETTE = ['#ef4444', '#f97316', '#eab308', '#38bdf8', '#a855f7', '#22c55e'];

export default function AddThreatModal({
  isOpen,
  onClose,
  onAddThreat,
  demMetadata = null,
  defaultObsHeight = 10,
  defaultRange = 5000,
  defaultThreatColor = '#ef4444',
  threatsCount = 0
}) {
  const [activeTab, setActiveTab] = useState('auto');
  const colorInputRef = useRef(null);

  // Input states
  const [autoInput, setAutoInput] = useState('-22.65, 150.15');

  // Structured DD inputs
  const [ddLat, setDdLat] = useState('22.65');
  const [ddLatHem, setDdLatHem] = useState('S');
  const [ddLon, setDdLon] = useState('150.15');
  const [ddLonHem, setDdLonHem] = useState('E');

  // Structured DDM inputs
  const [ddmLatDeg, setDdmLatDeg] = useState('22');
  const [ddmLatMin, setDdmLatMin] = useState('39.000');
  const [ddmLatHem, setDdmLatHem] = useState('S');
  const [ddmLonDeg, setDdmLonDeg] = useState('150');
  const [ddmLonMin, setDdmLonMin] = useState('09.000');
  const [ddmLonHem, setDdmLonHem] = useState('E');

  // Structured DMS inputs
  const [dmsLatDeg, setDmsLatDeg] = useState('22');
  const [dmsLatMin, setDmsLatMin] = useState('39');
  const [dmsLatSec, setDmsLatSec] = useState('00.0');
  const [dmsLatHem, setDmsLatHem] = useState('S');
  const [dmsLonDeg, setDmsLonDeg] = useState('150');
  const [dmsLonMin, setDmsLonMin] = useState('09');
  const [dmsLonSec, setDmsLonSec] = useState('00.0');
  const [dmsLonHem, setDmsLonHem] = useState('E');

  // Structured MGRS input
  const [mgrsInput, setMgrsInput] = useState('56K KV 07094 92417');

  // Threat configuration parameters
  const [threatName, setThreatName] = useState('');
  const [obsHeight, setObsHeight] = useState(defaultObsHeight);
  const [range, setRange] = useState(defaultRange);
  const [color, setColor] = useState(defaultThreatColor);
  const [copiedFormat, setCopiedFormat] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setThreatName(`Threat ${threatsCount + 1}`);
      setObsHeight(defaultObsHeight);
      setRange(defaultRange);
      setColor(defaultThreatColor);
    }
  }, [isOpen, threatsCount, defaultObsHeight, defaultRange, defaultThreatColor]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Parse current coordinates based on active tab
  const parsedCoord = useMemo(() => {
    if (activeTab === 'auto') {
      return parseCoordinateInput(autoInput);
    }

    if (activeTab === 'mgrs') {
      return parseCoordinateInput(mgrsInput);
    }

    if (activeTab === 'dd') {
      const latVal = parseFloat(ddLat);
      const lonVal = parseFloat(ddLon);
      if (isNaN(latVal) || isNaN(lonVal)) {
        return { valid: false, error: 'Please enter valid numbers for DD latitude and longitude.' };
      }
      let finalLat = Math.abs(latVal);
      if (ddLatHem === 'S') finalLat = -finalLat;
      let finalLon = Math.abs(lonVal);
      if (ddLonHem === 'W') finalLon = -finalLon;

      if (finalLat < -90 || finalLat > 90 || finalLon < -180 || finalLon > 180) {
        return { valid: false, error: 'Coordinates out of bounds (-90..90, -180..180)' };
      }

      return {
        valid: true,
        lat: finalLat,
        lon: finalLon,
        detectedFormat: 'DD',
        representations: {
          dd: toDD(finalLat, finalLon).formatted,
          ddSigned: toDD(finalLat, finalLon).signed,
          ddm: toDDM(finalLat, finalLon).formatted,
          dms: toDMS(finalLat, finalLon).formatted,
          mgrs: toMGRS(finalLat, finalLon)
        }
      };
    }

    if (activeTab === 'ddm') {
      return fromDDM(ddmLatDeg, ddmLatMin, ddmLatHem, ddmLonDeg, ddmLonMin, ddmLonHem);
    }

    if (activeTab === 'dms') {
      return fromDMS(dmsLatDeg, dmsLatMin, dmsLatSec, dmsLatHem, dmsLonDeg, dmsLonMin, dmsLonSec, dmsLonHem);
    }

    return { valid: false, error: 'Select a valid coordinate mode.' };
  }, [
    activeTab,
    autoInput,
    mgrsInput,
    ddLat,
    ddLatHem,
    ddLon,
    ddLonHem,
    ddmLatDeg,
    ddmLatMin,
    ddmLatHem,
    ddmLonDeg,
    ddmLonMin,
    ddmLonHem,
    dmsLatDeg,
    dmsLatMin,
    dmsLatSec,
    dmsLatHem,
    dmsLonDeg,
    dmsLonMin,
    dmsLonSec,
    dmsLonHem
  ]);

  const handleTabChange = (newTab) => {
    if (parsedCoord.valid) {
      const lat = parsedCoord.lat;
      const lon = parsedCoord.lon;

      if (newTab === 'dd') {
        setDdLat(Math.abs(lat).toFixed(6));
        setDdLatHem(lat >= 0 ? 'N' : 'S');
        setDdLon(Math.abs(lon).toFixed(6));
        setDdLonHem(lon >= 0 ? 'E' : 'W');
      } else if (newTab === 'ddm') {
        const ddm = toDDM(lat, lon);
        if (ddm.latParts && ddm.lonParts) {
          setDdmLatDeg(String(ddm.latParts.deg));
          setDdmLatMin(String(ddm.latParts.min));
          setDdmLatHem(ddm.latParts.hem);
          setDdmLonDeg(String(ddm.lonParts.deg));
          setDdmLonMin(String(ddm.lonParts.min));
          setDdmLonHem(ddm.lonParts.hem);
        }
      } else if (newTab === 'dms') {
        const dms = toDMS(lat, lon);
        if (dms.latParts && dms.lonParts) {
          setDmsLatDeg(String(dms.latParts.deg));
          setDmsLatMin(String(dms.latParts.min));
          setDmsLatSec(String(dms.latParts.sec));
          setDmsLatHem(dms.latParts.hem);
          setDmsLonDeg(String(dms.lonParts.deg));
          setDmsLonMin(String(dms.lonParts.min));
          setDmsLonSec(String(dms.lonParts.sec));
          setDmsLonHem(dms.lonParts.hem);
        }
      } else if (newTab === 'mgrs') {
        setMgrsInput(toMGRS(lat, lon));
      } else if (newTab === 'auto') {
        setAutoInput(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      }
    }
    setActiveTab(newTab);
  };

  const demCoverageStatus = useMemo(() => {
    if (!parsedCoord.valid) return null;
    if (!demMetadata || !demMetadata.bbox) {
      return {
        status: 'no_dem',
        message: 'No DEM coverage loaded yet. Threat will be placed on base terrain.'
      };
    }

    const [minX, minY, maxX, maxY] = demMetadata.bbox;
    const isInside = (
      parsedCoord.lon >= minX &&
      parsedCoord.lon <= maxX &&
      parsedCoord.lat >= minY &&
      parsedCoord.lat <= maxY
    );

    if (isInside) {
      return {
        status: 'inside',
        message: `Within loaded Copernicus GLO-30 DEM coverage bounds.`
      };
    } else {
      return {
        status: 'outside',
        message: `Warning: Outside loaded DEM bounds [${minY.toFixed(2)}°, ${minX.toFixed(2)}° to ${maxY.toFixed(2)}°, ${maxX.toFixed(2)}°].`
      };
    }
  }, [parsedCoord, demMetadata]);

  const handleCopy = (e, text, formatKey) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedFormat(formatKey);
    setTimeout(() => setCopiedFormat(null), 1800);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!parsedCoord.valid) return;

    onAddThreat({
      name: threatName.trim() || `Threat ${threatsCount + 1}`,
      lat: parsedCoord.lat,
      lon: parsedCoord.lon,
      obsHeight: Number(obsHeight),
      range: Number(range),
      color: color
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Deploy Threat / Radar Site</h2>
              <p className="modal-subtitle">Position radar or observer site via MGRS, DD, DDM, or DMS</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="modal-tabs">
          {[
            { id: 'auto', label: 'Auto-Detect' },
            { id: 'mgrs', label: 'MGRS Grid' },
            { id: 'dd', label: 'DD' },
            { id: 'ddm', label: 'DDM' },
            { id: 'dms', label: 'DMS' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`modal-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Format Input Content Card */}
          <div className="modal-input-card">
            {activeTab === 'auto' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="modal-input-label-row">
                  <label className="modal-input-label">Coordinate String or MGRS Grid</label>
                  <span className="modal-input-hint">Paste any format freely</span>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="modal-text-input"
                    value={autoInput}
                    onChange={(e) => setAutoInput(e.target.value)}
                    placeholder="e.g. 56K KV 07094 92417 or -22.65, 150.15"
                    autoFocus
                  />
                  {autoInput && (
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#71717a',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '2px'
                      }}
                      onClick={() => setAutoInput('')}
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="modal-chips-row">
                  <span>Try sample:</span>
                  <button
                    type="button"
                    className="modal-chip"
                    onClick={() => setAutoInput('56K KV 07094 92417')}
                  >
                    56K KV 07094 92417
                  </button>
                  <button
                    type="button"
                    className="modal-chip"
                    onClick={() => setAutoInput('-22.6500, 150.1500')}
                  >
                    -22.6500, 150.1500
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'mgrs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="modal-input-label-row">
                  <label className="modal-input-label">Military Grid Reference System (MGRS)</label>
                  <span className="modal-input-hint">4, 6, 8, or 10-digit grids</span>
                </div>
                <input
                  type="text"
                  className="modal-text-input"
                  style={{ letterSpacing: '0.04em' }}
                  value={mgrsInput}
                  onChange={(e) => setMgrsInput(e.target.value)}
                  placeholder="e.g. 56K KV 07094 92417 or 56KKV0709492417"
                  autoFocus
                />
                <div className="modal-chips-row">
                  <span>Quick grids:</span>
                  <button
                    type="button"
                    className="modal-chip"
                    onClick={() => setMgrsInput('56K KV 07094 92417')}
                  >
                    Alpha: 56K KV 07094 92417
                  </button>
                  <button
                    type="button"
                    className="modal-chip"
                    onClick={() => setMgrsInput('56K KV 17469 81389')}
                  >
                    Bravo: 56K KV 17469 81389
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'dd' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Latitude (DD)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      step="any"
                      className="modal-text-input"
                      style={{ flex: 1 }}
                      value={ddLat}
                      onChange={(e) => setDdLat(e.target.value)}
                      placeholder="22.65"
                    />
                    <select
                      className="modal-select"
                      value={ddLatHem}
                      onChange={(e) => setDdLatHem(e.target.value)}
                    >
                      <option value="S">S (-)</option>
                      <option value="N">N (+)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Longitude (DD)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      step="any"
                      className="modal-text-input"
                      style={{ flex: 1 }}
                      value={ddLon}
                      onChange={(e) => setDdLon(e.target.value)}
                      placeholder="150.15"
                    />
                    <select
                      className="modal-select"
                      value={ddLonHem}
                      onChange={(e) => setDdLonHem(e.target.value)}
                    >
                      <option value="E">E (+)</option>
                      <option value="W">W (-)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ddm' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Latitude (Deg Min)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      className="modal-text-input"
                      style={{ width: '56px', textAlign: 'center', padding: '8px 4px' }}
                      value={ddmLatDeg}
                      onChange={(e) => setDdmLatDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span style={{ color: '#71717a', fontWeight: 'bold' }}>&deg;</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.9999"
                      className="modal-text-input"
                      style={{ flex: 1, padding: '8px 8px' }}
                      value={ddmLatMin}
                      onChange={(e) => setDdmLatMin(e.target.value)}
                      placeholder="Minutes"
                    />
                    <span style={{ color: '#71717a', fontWeight: 'bold' }}>'</span>
                    <select
                      className="modal-select"
                      style={{ padding: '8px 6px' }}
                      value={ddmLatHem}
                      onChange={(e) => setDdmLatHem(e.target.value)}
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Longitude (Deg Min)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      max="180"
                      className="modal-text-input"
                      style={{ width: '56px', textAlign: 'center', padding: '8px 4px' }}
                      value={ddmLonDeg}
                      onChange={(e) => setDdmLonDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span style={{ color: '#71717a', fontWeight: 'bold' }}>&deg;</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.9999"
                      className="modal-text-input"
                      style={{ flex: 1, padding: '8px 8px' }}
                      value={ddmLonMin}
                      onChange={(e) => setDdmLonMin(e.target.value)}
                      placeholder="Minutes"
                    />
                    <span style={{ color: '#71717a', fontWeight: 'bold' }}>'</span>
                    <select
                      className="modal-select"
                      style={{ padding: '8px 6px' }}
                      value={ddmLonHem}
                      onChange={(e) => setDdmLonHem(e.target.value)}
                    >
                      <option value="E">E</option>
                      <option value="W">W</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dms' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Latitude (Deg Min Sec)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      className="modal-text-input"
                      style={{ width: '42px', textAlign: 'center', padding: '8px 2px', fontSize: '0.78rem' }}
                      value={dmsLatDeg}
                      onChange={(e) => setDmsLatDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span style={{ color: '#71717a' }}>&deg;</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="modal-text-input"
                      style={{ width: '42px', textAlign: 'center', padding: '8px 2px', fontSize: '0.78rem' }}
                      value={dmsLatMin}
                      onChange={(e) => setDmsLatMin(e.target.value)}
                      placeholder="Min"
                    />
                    <span style={{ color: '#71717a' }}>'</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.99"
                      className="modal-text-input"
                      style={{ flex: 1, padding: '8px 4px', fontSize: '0.78rem' }}
                      value={dmsLatSec}
                      onChange={(e) => setDmsLatSec(e.target.value)}
                      placeholder="Sec"
                    />
                    <span style={{ color: '#71717a' }}>"</span>
                    <select
                      className="modal-select"
                      style={{ padding: '8px 4px', fontSize: '0.78rem' }}
                      value={dmsLatHem}
                      onChange={(e) => setDmsLatHem(e.target.value)}
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="modal-input-label">Longitude (Deg Min Sec)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <input
                      type="number"
                      min="0"
                      max="180"
                      className="modal-text-input"
                      style={{ width: '42px', textAlign: 'center', padding: '8px 2px', fontSize: '0.78rem' }}
                      value={dmsLonDeg}
                      onChange={(e) => setDmsLonDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span style={{ color: '#71717a' }}>&deg;</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="modal-text-input"
                      style={{ width: '42px', textAlign: 'center', padding: '8px 2px', fontSize: '0.78rem' }}
                      value={dmsLonMin}
                      onChange={(e) => setDmsLonMin(e.target.value)}
                      placeholder="Min"
                    />
                    <span style={{ color: '#71717a' }}>'</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.99"
                      className="modal-text-input"
                      style={{ flex: 1, padding: '8px 4px', fontSize: '0.78rem' }}
                      value={dmsLonSec}
                      onChange={(e) => setDmsLonSec(e.target.value)}
                      placeholder="Sec"
                    />
                    <span style={{ color: '#71717a' }}>"</span>
                    <select
                      className="modal-select"
                      style={{ padding: '8px 4px', fontSize: '0.78rem' }}
                      value={dmsLonHem}
                      onChange={(e) => setDmsLonHem(e.target.value)}
                    >
                      <option value="E">E</option>
                      <option value="W">W</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Real-time Conversion & Validation Card */}
          <div className={`modal-breakdown-card ${parsedCoord.valid ? '' : 'invalid'}`}>
            <div className="modal-breakdown-header">
              <div className="modal-status-pill">
                <span className={`modal-status-dot ${parsedCoord.valid ? 'valid' : 'invalid'}`}></span>
                <span style={{
                  color: parsedCoord.valid ? '#4ade80' : '#fb7185',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {parsedCoord.valid ? `Valid Position (${parsedCoord.detectedFormat})` : 'Invalid Coordinate'}
                </span>
              </div>
              {parsedCoord.valid && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#a1a1aa' }}>
                  {parsedCoord.lat.toFixed(5)}&deg;, {parsedCoord.lon.toFixed(5)}&deg;
                </span>
              )}
            </div>

            {parsedCoord.valid ? (
              <div className="modal-grid-2x2">
                {/* MGRS Card */}
                <div
                  className="modal-coord-card"
                  onClick={(e) => handleCopy(e, parsedCoord.representations.mgrs, 'mgrs')}
                  title="Click to copy MGRS grid"
                >
                  <div className="modal-coord-card-top">
                    <span className="modal-coord-title">MGRS Grid</span>
                    <button
                      type="button"
                      className={`modal-coord-copy-btn ${copiedFormat === 'mgrs' ? 'copied' : ''}`}
                      onClick={(e) => handleCopy(e, parsedCoord.representations.mgrs, 'mgrs')}
                    >
                      {copiedFormat === 'mgrs' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="modal-coord-val mgrs">
                    {parsedCoord.representations.mgrs}
                  </div>
                </div>

                {/* DD Card */}
                <div
                  className="modal-coord-card"
                  onClick={(e) => handleCopy(e, parsedCoord.representations.dd, 'dd')}
                  title="Click to copy Decimal Degrees"
                >
                  <div className="modal-coord-card-top">
                    <span className="modal-coord-title">Decimal Degrees (DD)</span>
                    <button
                      type="button"
                      className={`modal-coord-copy-btn ${copiedFormat === 'dd' ? 'copied' : ''}`}
                      onClick={(e) => handleCopy(e, parsedCoord.representations.dd, 'dd')}
                    >
                      {copiedFormat === 'dd' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="modal-coord-val">
                    {parsedCoord.representations.dd}
                  </div>
                </div>

                {/* DDM Card */}
                <div
                  className="modal-coord-card"
                  onClick={(e) => handleCopy(e, parsedCoord.representations.ddm, 'ddm')}
                  title="Click to copy Deg Decimal Min"
                >
                  <div className="modal-coord-card-top">
                    <span className="modal-coord-title">Deg Decimal Min (DDM)</span>
                    <button
                      type="button"
                      className={`modal-coord-copy-btn ${copiedFormat === 'ddm' ? 'copied' : ''}`}
                      onClick={(e) => handleCopy(e, parsedCoord.representations.ddm, 'ddm')}
                    >
                      {copiedFormat === 'ddm' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="modal-coord-val">
                    {parsedCoord.representations.ddm}
                  </div>
                </div>

                {/* DMS Card */}
                <div
                  className="modal-coord-card"
                  onClick={(e) => handleCopy(e, parsedCoord.representations.dms, 'dms')}
                  title="Click to copy Deg Min Sec"
                >
                  <div className="modal-coord-card-top">
                    <span className="modal-coord-title">Deg Min Sec (DMS)</span>
                    <button
                      type="button"
                      className={`modal-coord-copy-btn ${copiedFormat === 'dms' ? 'copied' : ''}`}
                      onClick={(e) => handleCopy(e, parsedCoord.representations.dms, 'dms')}
                    >
                      {copiedFormat === 'dms' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="modal-coord-val">
                    {parsedCoord.representations.dms}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#fb7185', margin: 0 }}>
                {parsedCoord.error}
              </p>
            )}

            {/* DEM Coverage Status */}
            {demCoverageStatus && (
              <div style={{
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: demCoverageStatus.status === 'inside'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : (demCoverageStatus.status === 'outside' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(39, 39, 42, 0.6)'),
                border: `1px solid ${demCoverageStatus.status === 'inside'
                  ? 'rgba(16, 185, 129, 0.25)'
                  : (demCoverageStatus.status === 'outside' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(63, 63, 70, 0.4)')}`,
                color: demCoverageStatus.status === 'inside'
                  ? '#34d399'
                  : (demCoverageStatus.status === 'outside' ? '#fbbf24' : '#d4d4d8')
              }}>
                <span>{demCoverageStatus.status === 'inside' ? '✓' : (demCoverageStatus.status === 'outside' ? '⚠️' : 'ℹ️')}</span>
                <span>{demCoverageStatus.message}</span>
              </div>
            )}
          </div>

          {/* Threat Site Parameters */}
          <div className="modal-params-card">
            <span className="modal-params-title">Radar / Threat Site Parameters</span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="modal-input-label">Threat / Site Name</label>
                <input
                  type="text"
                  className="modal-text-input"
                  style={{ fontFamily: 'inherit', fontSize: '0.82rem' }}
                  value={threatName}
                  onChange={(e) => setThreatName(e.target.value)}
                  placeholder="e.g. Radar Site Alpha"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="modal-input-label">Marker Color</label>
                <div className="modal-colors-row" style={{ height: '36px' }}>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`modal-color-swatch ${color === c ? 'active' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                  {/* Custom color circle button */}
                  <button
                    type="button"
                    className={`modal-custom-color-btn ${!COLOR_PALETTE.includes(color) ? 'active' : ''}`}
                    style={!COLOR_PALETTE.includes(color) ? { backgroundColor: color, color: '#fff' } : {}}
                    onClick={() => colorInputRef.current?.click()}
                    title="Choose custom color"
                    aria-label="Choose custom color"
                  >
                    {!COLOR_PALETTE.includes(color) ? '✓' : '+'}
                  </button>
                  <input
                    ref={colorInputRef}
                    type="color"
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="modal-input-label">Observer Height</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#38bdf8', fontWeight: 600, fontSize: '0.75rem' }}>
                    {obsHeight}m ({Math.round(obsHeight / 0.3048)}ft)
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="60"
                  step="1"
                  value={obsHeight}
                  onChange={(e) => setObsHeight(Number(e.target.value))}
                  style={{ accentColor: '#2563eb', cursor: 'pointer', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="modal-input-label">Radar Range</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#38bdf8', fontWeight: 600, fontSize: '0.75rem' }}>
                    {(range / 1000).toFixed(1)}km ({range}m)
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="25000"
                  step="500"
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                  style={{ accentColor: '#2563eb', cursor: 'pointer', width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="modal-footer">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!parsedCoord.valid}
              className="modal-btn-deploy"
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M12 7v10m-5-5h10" />
              </svg>
              Deploy Threat to Map
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
