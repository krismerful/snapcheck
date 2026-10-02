import React, { useState, useEffect, useMemo } from 'react';
import {
  parseCoordinateInput,
  fromDDM,
  fromDMS,
  toDD,
  toDDM,
  toDMS,
  toMGRS
} from '../utils/coordinates';

const PRESET_LOCATIONS = [
  { name: 'SWBTA Radar Alpha (Falcon E)', coord: '-22.65, 150.15', mgrs: '56K KV 07094 92417', height: 12, range: 6000, color: '#ef4444' },
  { name: 'SWBTA SAM Site Bravo (Eagle)', coord: '-22.75, 150.25', mgrs: '56K KV 17469 81389', height: 10, range: 5000, color: '#f97316' },
  { name: 'SWBTA Post Charlie', coord: '-22.58, 150.05', mgrs: '56K KV 96734 99981', height: 15, range: 4500, color: '#eab308' }
];

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

    if (activeTab === 'mgrs') {
      return parseCoordinateInput(mgrsInput);
    }

    return { valid: false, error: 'Select a valid coordinate mode.' };
  }, [
    activeTab,
    autoInput,
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
    dmsLonHem,
    mgrsInput
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
        message: 'No DEM file loaded yet. Threat will be positioned on the base map.'
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
        message: `Within loaded Copernicus GLO-30 DEM bounds (${minY.toFixed(2)}° to ${maxY.toFixed(2)}° Lat).`
      };
    } else {
      return {
        status: 'outside',
        message: `Notice: Coordinate is outside current DEM coverage bounds [${minY.toFixed(2)}°, ${minX.toFixed(2)}° to ${maxY.toFixed(2)}°, ${maxX.toFixed(2)}°].`
      };
    }
  }, [parsedCoord, demMetadata]);

  const handleLoadPreset = (preset) => {
    setAutoInput(preset.coord);
    setMgrsInput(preset.mgrs);
    setThreatName(preset.name);
    setObsHeight(preset.height);
    setRange(preset.range);
    setColor(preset.color);

    const parsed = parseCoordinateInput(preset.coord);
    if (parsed.valid) {
      const lat = parsed.lat;
      const lon = parsed.lon;
      setDdLat(Math.abs(lat).toFixed(6));
      setDdLatHem(lat >= 0 ? 'N' : 'S');
      setDdLon(Math.abs(lon).toFixed(6));
      setDdLonHem(lon >= 0 ? 'E' : 'W');

      const ddm = toDDM(lat, lon);
      if (ddm.latParts && ddm.lonParts) {
        setDdmLatDeg(String(ddm.latParts.deg));
        setDdmLatMin(String(ddm.latParts.min));
        setDdmLatHem(ddm.latParts.hem);
        setDdmLonDeg(String(ddm.lonParts.deg));
        setDdmLonMin(String(ddm.lonParts.min));
        setDdmLonHem(ddm.lonParts.hem);
      }

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
    }
  };

  const handleCopy = (text, formatKey) => {
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
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-xl w-full p-6 text-zinc-100 flex flex-col max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Deploy Threat / Radar Site</h2>
              <p className="text-xs text-zinc-400">Position radar or observer site via DD, DDM, DMS, or MGRS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Samples Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
          <span className="text-zinc-500 font-medium">Quick Fill:</span>
          {PRESET_LOCATIONS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 rounded-full transition-colors font-medium text-xs"
              onClick={() => handleLoadPreset(preset)}
            >
              {preset.name.split(' ')[0]} {preset.name.split(' ')[1]}
            </button>
          ))}
        </div>

        {/* Segmented Format Tabs */}
        <div className="flex p-1 bg-zinc-950 rounded-xl border border-zinc-800/80 mb-4 gap-1">
          {[
            { id: 'auto', label: 'Auto-Detect', badge: 'SMART' },
            { id: 'dd', label: 'DD' },
            { id: 'ddm', label: 'DDM' },
            { id: 'dms', label: 'DMS' },
            { id: 'mgrs', label: 'MGRS' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.badge && (
                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold px-1 rounded">
                  {tab.badge}
                </span>
              )}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Format Input Content Card */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            {activeTab === 'auto' && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-zinc-300">Single Coordinate String or MGRS Grid</label>
                  <span className="text-zinc-500">Paste any format freely</span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                    value={autoInput}
                    onChange={(e) => setAutoInput(e.target.value)}
                    placeholder="e.g. -22.65, 150.15 or 56K KV 07094 92417 or 22° 39.0' S, 150° 09.0' E"
                    autoFocus
                  />
                  {autoInput && (
                    <button
                      type="button"
                      className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 text-base"
                      onClick={() => setAutoInput('')}
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500 mt-1">
                  <span>Examples:</span>
                  <code className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300 font-mono">-22.65, 150.15</code>
                  <code className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300 font-mono">22° 39.00' S, 150° 09.00' E</code>
                  <code className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300 font-mono">56K KV 07094 92417</code>
                </div>
              </div>
            )}

            {activeTab === 'dd' && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Latitude (DD)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                      value={ddLat}
                      onChange={(e) => setDdLat(e.target.value)}
                      placeholder="22.65"
                    />
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-sm font-semibold text-blue-400 focus:outline-none"
                      value={ddLatHem}
                      onChange={(e) => setDdLatHem(e.target.value)}
                    >
                      <option value="S">S (-)</option>
                      <option value="N">N (+)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Longitude (DD)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                      value={ddLon}
                      onChange={(e) => setDdLon(e.target.value)}
                      placeholder="150.15"
                    />
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-sm font-semibold text-blue-400 focus:outline-none"
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
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Latitude (Deg &amp; Min)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="90"
                      className="w-16 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2 py-2 text-sm font-mono text-zinc-100 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      value={ddmLatDeg}
                      onChange={(e) => setDdmLatDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span className="text-zinc-500 font-bold">&deg;</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.9999"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      value={ddmLatMin}
                      onChange={(e) => setDdmLatMin(e.target.value)}
                      placeholder="Minutes"
                    />
                    <span className="text-zinc-500 font-bold">'</span>
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-2 py-2 text-sm font-semibold text-blue-400 focus:outline-none"
                      value={ddmLatHem}
                      onChange={(e) => setDdmLatHem(e.target.value)}
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Longitude (Deg &amp; Min)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="180"
                      className="w-16 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2 py-2 text-sm font-mono text-zinc-100 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      value={ddmLonDeg}
                      onChange={(e) => setDdmLonDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span className="text-zinc-500 font-bold">&deg;</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.9999"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      value={ddmLonMin}
                      onChange={(e) => setDdmLonMin(e.target.value)}
                      placeholder="Minutes"
                    />
                    <span className="text-zinc-500 font-bold">'</span>
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-2 py-2 text-sm font-semibold text-blue-400 focus:outline-none"
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
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Latitude (Deg Min Sec)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="90"
                      className="w-12 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1 py-1.5 text-xs font-mono text-zinc-100 text-center focus:outline-none"
                      value={dmsLatDeg}
                      onChange={(e) => setDmsLatDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span className="text-zinc-500">&deg;</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="w-12 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1 py-1.5 text-xs font-mono text-zinc-100 text-center focus:outline-none"
                      value={dmsLatMin}
                      onChange={(e) => setDmsLatMin(e.target.value)}
                      placeholder="Min"
                    />
                    <span className="text-zinc-500">'</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.99"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none"
                      value={dmsLatSec}
                      onChange={(e) => setDmsLatSec(e.target.value)}
                      placeholder="Sec"
                    />
                    <span className="text-zinc-500">"</span>
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-1.5 py-1.5 text-xs font-semibold text-blue-400 focus:outline-none"
                      value={dmsLatHem}
                      onChange={(e) => setDmsLatHem(e.target.value)}
                    >
                      <option value="S">S</option>
                      <option value="N">N</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-zinc-300">Longitude (Deg Min Sec)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="180"
                      className="w-12 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1 py-1.5 text-xs font-mono text-zinc-100 text-center focus:outline-none"
                      value={dmsLonDeg}
                      onChange={(e) => setDmsLonDeg(e.target.value)}
                      placeholder="Deg"
                    />
                    <span className="text-zinc-500">&deg;</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="w-12 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1 py-1.5 text-xs font-mono text-zinc-100 text-center focus:outline-none"
                      value={dmsLonMin}
                      onChange={(e) => setDmsLonMin(e.target.value)}
                      placeholder="Min"
                    />
                    <span className="text-zinc-500">'</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="59.99"
                      className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-1.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none"
                      value={dmsLonSec}
                      onChange={(e) => setDmsLonSec(e.target.value)}
                      placeholder="Sec"
                    />
                    <span className="text-zinc-500">"</span>
                    <select
                      className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-1.5 py-1.5 text-xs font-semibold text-blue-400 focus:outline-none"
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

            {activeTab === 'mgrs' && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-zinc-300">Military Grid Reference System (MGRS)</label>
                  <span className="text-zinc-500">4, 6, 8, or 10-digit grids</span>
                </div>
                <input
                  type="text"
                  className="w-full bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                  value={mgrsInput}
                  onChange={(e) => setMgrsInput(e.target.value)}
                  placeholder="e.g. 56K KV 07094 92417 or 56KKV0709492417"
                />
              </div>
            )}
          </div>

          {/* Real-time Conversion & Validation Card */}
          <div className={`p-4 rounded-xl border transition-colors ${
            parsedCoord.valid 
              ? 'bg-zinc-950/70 border-zinc-800' 
              : 'bg-rose-500/5 border-rose-500/20'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${parsedCoord.valid ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-400'}`}></span>
                <span className={`text-xs font-semibold uppercase tracking-wider ${parsedCoord.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {parsedCoord.valid ? `Valid Position (${parsedCoord.detectedFormat})` : 'Invalid Coordinate'}
                </span>
              </div>
              {parsedCoord.valid && (
                <span className="text-xs font-mono text-zinc-400">
                  {parsedCoord.lat.toFixed(5)}&deg;, {parsedCoord.lon.toFixed(5)}&deg;
                </span>
              )}
            </div>

            {parsedCoord.valid ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div 
                  className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-2.5 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => handleCopy(parsedCoord.representations.mgrs, 'mgrs')}
                >
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">MGRS Grid</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-blue-400 truncate">{parsedCoord.representations.mgrs}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 group-hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 font-medium">
                      {copiedFormat === 'mgrs' ? '✓ Copied' : 'Copy'}
                    </span>
                  </div>
                </div>

                <div 
                  className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-2.5 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => handleCopy(parsedCoord.representations.dd, 'dd')}
                >
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Decimal Degrees (DD)</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-zinc-200 truncate">{parsedCoord.representations.dd}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 group-hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 font-medium">
                      {copiedFormat === 'dd' ? '✓ Copied' : 'Copy'}
                    </span>
                  </div>
                </div>

                <div 
                  className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-2.5 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => handleCopy(parsedCoord.representations.ddm, 'ddm')}
                >
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Deg Decimal Min (DDM)</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-zinc-200 truncate">{parsedCoord.representations.ddm}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 group-hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 font-medium">
                      {copiedFormat === 'ddm' ? '✓ Copied' : 'Copy'}
                    </span>
                  </div>
                </div>

                <div 
                  className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-2.5 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => handleCopy(parsedCoord.representations.dms, 'dms')}
                >
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Deg Min Sec (DMS)</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-zinc-200 truncate">{parsedCoord.representations.dms}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 group-hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 font-medium">
                      {copiedFormat === 'dms' ? '✓ Copied' : 'Copy'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-rose-400 font-medium">{parsedCoord.error}</p>
            )}

            {/* DEM Coverage Status */}
            {demCoverageStatus && (
              <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                demCoverageStatus.status === 'inside'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : (demCoverageStatus.status === 'outside'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300')
              }`}>
                <span>{demCoverageStatus.status === 'inside' ? '✓' : (demCoverageStatus.status === 'outside' ? '⚠️' : 'ℹ️')}</span>
                <span>{demCoverageStatus.message}</span>
              </div>
            )}
          </div>

          {/* Threat Site Parameters */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Radar / Threat Site Parameters</span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">Threat / Site Name</label>
                <input
                  type="text"
                  className="bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  value={threatName}
                  onChange={(e) => setThreatName(e.target.value)}
                  placeholder="e.g. Radar Site Alpha"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">Marker Color</label>
                <div className="flex items-center gap-2 h-9">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                  <input
                    type="color"
                    className="w-7 h-7 rounded-lg border border-zinc-700/60 bg-transparent cursor-pointer ml-1"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-zinc-300">Observer Height</span>
                  <span className="font-mono text-blue-400 font-semibold">{obsHeight}m ({Math.round(obsHeight / 0.3048)}ft)</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="60"
                  step="1"
                  value={obsHeight}
                  onChange={(e) => setObsHeight(Number(e.target.value))}
                  className="accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-zinc-300">Radar Range</span>
                  <span className="font-mono text-blue-400 font-semibold">{(range / 1000).toFixed(1)}km ({range}m)</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="25000"
                  step="500"
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                  className="accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700/60 rounded-lg transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!parsedCoord.valid}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
