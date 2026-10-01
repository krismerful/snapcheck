# Copernicus Line-of-Sight (LOS) & Viewshed Tactical Planner

A modern, 100% client-side tactical Line-of-Sight (LOS) and Viewshed planning web application powered by **Copernicus GLO-30 DEM/DSM** files (`.tif`), **Web Workers**, and **Leaflet**.

Zero backend required. Fully deployable to **Vercel**, **GitHub Pages**, or any static host with a single click.

---

## Key Features

- **Client-Side GeoTIFF Ingestion:**
  - Drag-and-drop or browse local Copernicus GLO-30 GeoTIFF DEMs directly in the browser using `geotiff.js`.
  - Extracts bounding box, raster dimensions, and decompresses 30m elevation rasters into an in-memory `Float32Array`.
  - Displays operational coverage boundary boxes directly on Leaflet satellite/dark-mode maps.

- **High-Performance Bilinear Elevation Sampler:**
  - Fast continuous coordinate-to-elevation lookup:
    $$x = \left\lfloor \frac{\text{lon} - \text{minX}}{\text{maxX} - \text{minX}} \times \text{width} \right\rfloor, \quad y = \left\lfloor \frac{\text{maxY} - \text{lat}}{\text{maxY} - \text{minY}} \times \text{height} \right\rfloor$$
  - 4-neighbor bilinear interpolation ($z_{00}, z_{10}, z_{01}, z_{11}$) prevents staircase terrain artifacts during raymarching.
  - Robust handling of raster boundaries, coastlines, and NoData pockets.

- **Non-Blocking Web Worker Raymarching:**
  - Offloads heavy terrain raymarching to a background Web Worker via zero-copy `ArrayBuffer` transfer.
  - Spherical Earth curvature and standard $4/3$ atmospheric refraction ($\Delta_{\text{drop}} = d^2 / (2 R_{\text{eff}})$).
  - Evaluates multiple altitude tiers simultaneously (**50 ft, 200 ft, 500 ft AGL**, and custom target altitudes) along radial profiles.
  - Fast vector contour polygon generation using `d3-contour`.

- **Tactical Multi-Threat Management:**
  - Place multiple radar / air defense / sensor threats on the map with individual observer heights ($m/\text{ft}$), detection ranges, and colors.
  - Batch **"Run LOS Analysis"** execution with animated real-time progress indicators.
  - Includes SWBTA presets (Shoalwater Bay Training Area) for instant mission demonstrations.

- **Interactive Altitude Tier Visualization:**
  - Multi-tiered color-coded viewshed layers (**50 ft AGL** High Hazard / Red, **200 ft AGL** Medium Hazard / Orange, **500 ft AGL** Low Hazard / Yellow).
  - Toggle layer visibility on the fly without re-calculating.

- **Terrain Eraser Cutout Tool:**
  - Draw custom polygon rings and blockify/subtract viewshed segments using `turf.js`.

- **Client-Side Google Earth KMZ Export:**
  - Packages complete multi-threat mission viewsheds into `.kmz` archives in-browser using `jszip` and HTML5 Canvas (high-res transparent PNG overlays, `LatLonBox` geo-referencing, and threat placemarks).
  - Preserves edited/erased viewshed vector export.

---

## Architecture

```
+-----------------------------------------------------------+
|                        Browser UI                         |
|  - Leaflet Map (Satellite / Dark / OSM)                   |
|  - Threat Placement & Configuration Controls               |
|  - Copernicus GLO-30 File Ingestion (Drag & Drop)          |
+-----------------------------+-----------------------------+
                              |
                     Transferable ArrayBuffer
                              |
                              v
+-----------------------------------------------------------+
|                   Web Worker (losWorker)                  |
|  - In-memory Float32Array elevation raster                |
|  - 4-neighbor Bilinear Elevation Sampler                  |
|  - Radial LOS Raymarching (Curvature + 4/3 Refraction)    |
|  - 50ft / 200ft / 500ft AGL Tier Classification           |
|  - d3-contour GeoJSON Contour Generation                  |
+-----------------------------+-----------------------------+
                              |
                   GeoJSON & Raster Payloads
                              |
                              v
+-----------------------------------------------------------+
|                    Browser Exports                        |
|  - Interactive Leaflet GeoJSON Vector Layers              |
|  - In-Browser JSZip KMZ Packager (PNG + doc.kml)          |
+-----------------------------------------------------------+
```

---

## Getting Started Locally

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22 / 24)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/<your-username>/copernicus-los-viewshed.git
cd copernicus-los-viewshed

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Building for Production
```bash
npm run build
```
Builds the static application to the `dist/` directory.

---

## Deploying to Vercel

Because this application is 100% client-side with zero backend dependencies, deploying to Vercel takes under 1 minute:

1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Vercel automatically detects **Vite**:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Click **"Deploy"**.

---

## Copernicus GLO-30 DEM Data Note
Copernicus GLO-30 DSM tiles (`.tif`) are typically ~100MB each. Due to GitHub's 100MB file limit, `.tif` files are excluded in `.gitignore`. 

Simply drag & drop any Copernicus GLO-30 GeoTIFF tile into the app's dropzone in your browser—all parsing and processing happens locally on your machine with zero server upload required.
