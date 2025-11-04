const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// --- Static File Serving ---
// 1. Serve the main frontend files (index.html, script.js, etc.) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// 2. Serve the raw_data directory from the project root with long-lived caching for large binaries
const rawDataDir = path.join(__dirname, 'raw_data');
app.use(
  '/raw_data',
  express.static(rawDataDir, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.bin' || ext === '.laz' || ext === '.las') {
        // Range requests for large Potree assets can trip browser cache limitations
        // when immutable caching is enabled. Prefer no-store so partial fetches succeed.
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
      } else if (
        ext === '.json' ||
        ext === '.shp' ||
        ext === '.dbf' ||
        ext === '.prj' ||
        ext === '.shx'
      ) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  })
);

// 3. Serve the pre-generated map tiles from our final tiles directory
app.use('/tiles', express.static(path.join(__dirname, 'lamesa_forest_final_fixed')));

// 4. Serve the Potree library files
app.use('/Potree_1.8.2', express.static(path.join(__dirname, 'Potree_1.8.2')));

// --- API Endpoints ---
// A simple endpoint to check if the server is running
app.get('/api/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log('Serving frontend from the "public" directory.');
  console.log('Serving raw data from the "raw_data" directory.');
  console.log('Serving map tiles from the "lamesa_forest_final_fixed" directory.');
});
