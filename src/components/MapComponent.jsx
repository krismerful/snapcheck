import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
  GeoJSON,
  LayersControl,
  Polygon,
  Circle,
  CircleMarker,
  Rectangle,
  Tooltip
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default marker icons in Vite/bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

const { BaseLayer } = LayersControl;

// Custom colored radar/threat marker icon
function createThreatIcon(color = '#ff3333') {
  return L.divIcon({
    className: 'custom-threat-icon',
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${color};
          opacity: 0.25;
          animation: pulse-ring 2s infinite;
        "></div>
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid #ffffff;
          box-shadow: 0 0 6px rgba(0,0,0,0.6);
        "></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}

// Controller component to zoom and center when DEM bounds change
function MapController({ demBbox, triggerFitBounds }) {
  const map = useMap();

  useEffect(() => {
    if (demBbox && demBbox.length === 4) {
      const [minX, minY, maxX, maxY] = demBbox;
      map.fitBounds(
        [
          [minY, minX],
          [maxY, maxX]
        ],
        { padding: [30, 30], maxZoom: 13, animate: true }
      );
    }
  }, [demBbox, triggerFitBounds, map]);

  return null;
}

const MapComponent = ({
  onMapClick,
  viewshedData = [],
  threats = [],
  waypoints = [],
  mode = 'threat',
  onDeleteThreat,
  onDeleteWaypoint,
  eraserPoints = [],
  demBbox = null,
  triggerFitBounds = 0,
  visibleTiers = { '50ft': true, '200ft': true, '500ft': true, 'custom': true },
  showRangeRings = true
}) => {
  const MapEvents = () => {
    const map = useMap();

    useEffect(() => {
      map.dragging.enable();
    }, [map]);

    useMapEvents({
      click(e) {
        onMapClick(e.latlng);
      }
    });
    return null;
  };

  // Convert GeoTIFF bbox [minX, minY, maxX, maxY] to Leaflet rectangle [[minY, minX], [maxY, maxX]]
  const demBounds = demBbox && demBbox.length === 4
    ? [
        [demBbox[1], demBbox[0]],
        [demBbox[3], demBbox[2]]
      ]
    : null;

  return (
    <div
      className={`map-container-inner ${mode === 'eraser' ? 'eraser-cursor' : ''}`}
      style={{ height: '100%', width: '100%', position: 'relative' }}
    >
      <MapContainer
        center={demBounds ? [(demBounds[0][0] + demBounds[1][0]) / 2, (demBounds[0][1] + demBounds[1][1]) / 2] : [1.35, 103.8]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
      >
        <MapController demBbox={demBbox} triggerFitBounds={triggerFitBounds} />

        <LayersControl position="topright">
          <BaseLayer checked name="Satellite (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
            />
          </BaseLayer>

          <BaseLayer name="Dark Grey (Carto)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; CartoDB"
            />
          </BaseLayer>

          <BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
          </BaseLayer>
        </LayersControl>

        <MapEvents />

        {/* DEM Coverage Boundary Box */}
        {demBounds && (
          <Rectangle
            bounds={demBounds}
            pathOptions={{
              color: '#00e5ff',
              weight: 2,
              dashArray: '6, 6',
              fillColor: '#00e5ff',
              fillOpacity: 0.04
            }}
          >
            <Tooltip permanent={false} direction="top">
              <strong>DEM Operational Coverage (Copernicus GLO-30)</strong>
              <br />
              Lat: {demBounds[0][0].toFixed(3)}&deg; to {demBounds[1][0].toFixed(3)}&deg;
              <br />
              Lon: {demBounds[0][1].toFixed(3)}&deg; to {demBounds[1][1].toFixed(3)}&deg;
            </Tooltip>
          </Rectangle>
        )}

        {/* Range Rings around Threats */}
        {showRangeRings && threats.filter(t => t.enabled !== false).map(t => (
          <Circle
            key={`range-${t.id}`}
            center={[t.lat, t.lon]}
            radius={t.range || 5000}
            pathOptions={{
              color: t.color || '#ff3333',
              weight: 1,
              dashArray: '4, 4',
              fillOpacity: 0.02
            }}
            interactive={false}
          />
        ))}

        {/* Threat Markers */}
        {threats.map((threat, idx) => (
          <Marker
            key={threat.id}
            position={[threat.lat, threat.lon]}
            icon={createThreatIcon(threat.color || '#ff3333', threat.name)}
          >
            <Popup>
              <div style={{ minWidth: '170px' }}>
                <strong style={{ color: threat.color || '#ff3333', fontSize: '14px' }}>
                  {threat.name || `Threat ${idx + 1}`}
                </strong>
                <hr style={{ margin: '4px 0', borderColor: '#444' }} />
                <div><strong>Lat:</strong> {threat.lat.toFixed(5)}&deg;</div>
                <div><strong>Lon:</strong> {threat.lon.toFixed(5)}&deg;</div>
                <div><strong>Obs Height:</strong> {threat.obsHeight} m ({Math.round(threat.obsHeight / 0.3048)} ft)</div>
                <div><strong>Range:</strong> {threat.range} m</div>
                {threat.groundElev !== undefined && threat.groundElev !== null && (
                  <div><strong>Terrain Elev:</strong> {threat.groundElev.toFixed(1)} m</div>
                )}
                {onDeleteThreat && (
                  <button
                    style={{
                      marginTop: '8px',
                      background: '#ff4444',
                      color: 'white',
                      border: 'none',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: 'bold'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThreat(threat.id);
                    }}
                  >
                    Delete Threat
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Flight Waypoints Markers */}
        {waypoints.map((wp, idx) => (
          <Marker key={wp.id} position={[wp.lat, wp.lon]}>
            <Popup>
              <div>
                <strong>Waypoint {idx + 1}</strong>
                <br />
                Alt: {wp.dispAlt} {wp.unit}
                <br />
                R: {wp.radius}m
                <br />
                {onDeleteWaypoint && (
                  <button
                    style={{
                      marginTop: '5px',
                      background: '#ff4444',
                      color: 'white',
                      border: 'none',
                      padding: '5px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteWaypoint(wp.id);
                    }}
                  >
                    Delete Waypoint
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Eraser Polygon Preview */}
        {mode === 'eraser' && eraserPoints.length > 0 && (
          <>
            <Polygon
              positions={eraserPoints.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: '#ff4444', weight: 2, dashArray: '5, 5', fillOpacity: 0.25 }}
            />
            {eraserPoints.map((p, i) => (
              <CircleMarker
                key={`ep-${i}`}
                center={[p.lat, p.lng]}
                radius={4}
                pathOptions={{ color: '#ff4444', fillColor: 'white', fillOpacity: 1 }}
                interactive={false}
              />
            ))}
          </>
        )}

        {/* Viewshed Layers (altitude tiers or individual features) */}
        {viewshedData.map((layer) => {
          // If layer has tierId and it is toggled off, skip rendering
          if (layer.tierId && visibleTiers[layer.tierId] === false) {
            return null;
          }

          if (!layer.geojson || !layer.geojson.features || layer.geojson.features.length === 0) {
            return null;
          }

          return (
            <GeoJSON
              key={layer.key || `${layer.id}-${layer.tierId || 'tier'}-${layer.geojson.features.length}`}
              data={layer.geojson}
              interactive={mode !== 'eraser'}
              style={(feature) => {
                if (feature.properties && feature.properties.DN === 255) {
                  const featureColor = feature.properties.color || layer.color || '#FFFF00';
                  // Stack tiers with subtle opacity
                  let fillOpacity = 0.45;
                  if (feature.properties.tierId === '50ft') fillOpacity = 0.6;
                  else if (feature.properties.tierId === '200ft') fillOpacity = 0.45;
                  else if (feature.properties.tierId === '500ft') fillOpacity = 0.35;

                  return {
                    color: featureColor,
                    weight: 0.5,
                    fillColor: featureColor,
                    fillOpacity: fillOpacity
                  };
                }
                return { stroke: false, fill: false };
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
