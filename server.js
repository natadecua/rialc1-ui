const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const csv = require('csv-parser');
const readline = require('readline');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// --- Static File Serving ---
// 1. Serve the main frontend files (index.html, script.js, etc.) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// 1a. Expose the Three.js ESM build so the standalone viewer can import modules without hitting a CDN
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(
  '/vendor/three/examples/jsm',
  express.static(path.join(__dirname, 'node_modules/three/examples/jsm'))
);

// 2. Serve the raw_data directory from the project root with long-lived caching for large binaries
const rawDataDir = path.join(__dirname, 'raw_data');
const pointCloudFilePath = path.join(rawDataDir, 'newgroups_adjusted_all_v3.csv');
const precomputedSamplesPath = path.join(rawDataDir, 'tree_point_samples.json');

const MAX_RESERVOIR_SIZE = 50000;
const pointCloudCache = new Map();
const pointCloudInflight = new Map();
let precomputedSamples = null;
let precomputedSamplesPromise = null;

async function loadPrecomputedSamples() {
  if (precomputedSamples !== null) {
    return precomputedSamples;
  }

  if (precomputedSamplesPromise) {
    return precomputedSamplesPromise;
  }

  if (!fs.existsSync(precomputedSamplesPath)) {
    precomputedSamples = false;
    return precomputedSamples;
  }

  precomputedSamplesPromise = new Promise((resolve, reject) => {
    console.log(`[Cache] Starting to load precomputed samples from ${precomputedSamplesPath}...`);
    const metadata = {
      source: path.basename(pointCloudFilePath),
      generatedAt: null,
      maxSamplesPerTree: null,
      totalTrees: null,
      totalPointsInSource: null,
      totalSampledPoints: null,
    };
    const treeEntries = new Map();

    const input = fs.createReadStream(precomputedSamplesPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    let aborted = false;

    const abortWithError = (error) => {
      if (aborted) {
        return;
      }
      aborted = true;
      rl.close();
      input.destroy();
      reject(error);
    };

    rl.on('line', (line) => {
      if (aborted) {
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let record;
      try {
        record = JSON.parse(trimmed);
      } catch (error) {
        abortWithError(
          new Error(
            `Invalid JSON encountered while streaming ${precomputedSamplesPath}: ${error.message}`
          )
        );
        return;
      }

      if (record.type === 'metadata') {
        metadata.source = record.source ?? metadata.source;
        metadata.generatedAt = record.generatedAt ?? metadata.generatedAt;
        metadata.maxSamplesPerTree = record.maxSamplesPerTree ?? metadata.maxSamplesPerTree;
        metadata.totalTrees = record.totalTrees ?? metadata.totalTrees;
        metadata.totalPointsInSource = record.totalPointsInSource ?? metadata.totalPointsInSource;
        metadata.totalSampledPoints = record.totalSampledPoints ?? metadata.totalSampledPoints;
        return;
      }

      if (record.type === 'tree') {
        const normalisedId = normaliseTreeId(record.treeId);
        if (!normalisedId || !Array.isArray(record.sampledPoints)) {
          return;
        }

        const tuples = record.sampledPoints.filter(
          (tuple) => Array.isArray(tuple) && tuple.length >= 2
        );

        const totalPoints = Number.isFinite(record.totalPoints)
          ? Number(record.totalPoints)
          : tuples.length;

        treeEntries.set(normalisedId, {
          totalPoints,
          tuples,
          materialised: null,
        });
        return;
      }

      abortWithError(
        new Error(
          'Unsupported cache format detected. Please regenerate tree_point_samples.json using the updated cache builder script.'
        )
      );
    });

    rl.once('close', () => {
      if (aborted) {
        return;
      }
      console.log(`[Cache] Successfully loaded ${treeEntries.size} trees into memory.`);
      resolve({
        metadata,
        trees: treeEntries,
      });
    });

    rl.once('error', (error) => {
      abortWithError(error);
    });

    input.once('error', (error) => {
      abortWithError(error);
    });
  })
    .then((result) => {
      precomputedSamples = result;
      console.log(
        `Loaded precomputed tree samples for ${result.trees.size} trees from ${precomputedSamplesPath}`
      );
      return result;
    })
    .catch((error) => {
      console.error('Failed to read precomputed tree samples:', error);
      precomputedSamples = false;
      return precomputedSamples;
    })
    .finally(() => {
      precomputedSamplesPromise = null;
    });

  return precomputedSamplesPromise;
}

function toNumericId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function normaliseTreeId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const stringValue = value.toString().trim();
  if (!stringValue) {
    return null;
  }

  const stripped = stringValue.replace(/^0+/, '');
  return stripped || '0';
}

function prepareCachedResponse(treeIdKey, originalTreeId, cacheEntry, maxPoints) {
  const limit = Math.min(maxPoints, MAX_RESERVOIR_SIZE);
  const slicedPoints =
    cacheEntry.points.length > limit ? cacheEntry.points.slice(0, limit) : cacheEntry.points;

  return {
    treeId: treeIdKey,
    requestedTreeId: originalTreeId,
    totalPoints: cacheEntry.totalPoints,
    sampledPoints: slicedPoints.length,
    points: slicedPoints,
  };
}

async function loadTreePointCloud(treeId, maxPoints = MAX_RESERVOIR_SIZE) {
  const treeIdKey = normaliseTreeId(treeId);
  if (!treeIdKey) {
    return {
      treeId: treeId ?? '',
      requestedTreeId: treeId,
      totalPoints: 0,
      sampledPoints: 0,
      points: [],
    };
  }

  const precomputed = await loadPrecomputedSamples();
  if (precomputed && precomputed.trees.has(treeIdKey)) {
    const entry = precomputed.trees.get(treeIdKey);

    if (!entry.materialised) {
      entry.materialised = entry.tuples.map((tuple) => {
        let sampleX = Number(tuple[0]);
        let sampleY = Number(tuple[1]);
        let sampleZ = Number(tuple[2]);
        let sampleIntensity = tuple.length > 3 ? Number(tuple[3]) : null;

        if (tuple.length === 3) {
          // Backwards compatibility with earlier cache format [y, z, intensity]
          sampleX = Number.NaN;
          sampleY = Number(tuple[0]);
          sampleZ = Number(tuple[1]);
          sampleIntensity = Number(tuple[2]);
        }

        const intensityValue = Number.isFinite(sampleIntensity) ? sampleIntensity : null;
        return {
          x: Number.isFinite(sampleX) ? sampleX : null,
          y: Number.isFinite(sampleY) ? sampleY : null,
          z: Number.isFinite(sampleZ) ? sampleZ : null,
          intensity: Number.isFinite(intensityValue) ? intensityValue : null,
        };
      });
    }

    const limit = Math.min(maxPoints, entry.materialised.length);
    const sampledPoints = entry.materialised.slice(0, limit);

    pointCloudCache.set(treeIdKey, {
      totalPoints: entry.totalPoints,
      points: entry.materialised,
    });

    return {
      treeId: treeIdKey,
      requestedTreeId: treeId,
      totalPoints: entry.totalPoints,
      sampledPoints: sampledPoints.length,
      points: sampledPoints,
    };
  }

  if (pointCloudCache.has(treeIdKey)) {
    const cacheEntry = pointCloudCache.get(treeIdKey);
    return prepareCachedResponse(treeIdKey, treeId, cacheEntry, maxPoints);
  }

  if (pointCloudInflight.has(treeIdKey)) {
    const inflightPromise = pointCloudInflight.get(treeIdKey);
    return inflightPromise.then((cacheEntry) =>
      prepareCachedResponse(treeIdKey, treeId, cacheEntry, maxPoints)
    );
  }

  console.warn(`[Performance] Cache miss for tree ${treeIdKey}. Falling back to slow CSV scan.`);

  if (!fs.existsSync(pointCloudFilePath)) {
    throw new Error('Point cloud source file not found.');
  }

  const reservoir = [];
  let totalMatches = 0;
  let lastNumericId = null;
  const requestedNumericId = toNumericId(treeIdKey);
  let assumeSorted = requestedNumericId !== null;
  let finished = false;

  const loadPromise = new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(pointCloudFilePath);
    const parser = fileStream.pipe(csv());

    const finalize = () => {
      if (finished) {
        return;
      }
      finished = true;

      const cacheEntry = {
        treeId: treeIdKey,
        totalPoints: totalMatches,
        points: reservoir,
      };

      pointCloudCache.set(treeIdKey, cacheEntry);
      resolve(cacheEntry);
    };

    fileStream.on('error', (error) => {
      if (finished) {
        return;
      }
      finished = true;
      reject(error);
    });

    parser
      .on('data', (row) => {
        const rowTreeId = normaliseTreeId(row.tree_id ?? row.treeId);
        if (rowTreeId !== treeIdKey) {
          if (!assumeSorted || requestedNumericId === null) {
            return;
          }

          const rowNumericId = toNumericId(rowTreeId);
          if (rowNumericId === null) {
            assumeSorted = false;
            return;
          }

          if (lastNumericId !== null && rowNumericId < lastNumericId) {
            assumeSorted = false;
            return;
          }

          lastNumericId = rowNumericId;

          if (rowNumericId > requestedNumericId && !finished) {
            parser.destroy();
            fileStream.destroy();
            finalize();
          }

          return;
        }

        const rowNumericId = toNumericId(rowTreeId);
        if (rowNumericId !== null) {
          if (lastNumericId !== null && rowNumericId < lastNumericId) {
            assumeSorted = false;
          }
          lastNumericId = rowNumericId;
        }

        const point = {
          x: Number.parseFloat(row.X ?? row.x),
          y: Number.parseFloat(row.Y ?? row.y),
          z: Number.parseFloat(row.Z ?? row.z),
          intensity: Number.parseFloat(
            row.Intensity ?? row.intensity ?? row.intensity_return ?? row.intensity_returned
          ),
        };

        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
          return;
        }

        totalMatches += 1;

        if (reservoir.length < MAX_RESERVOIR_SIZE) {
          reservoir.push(point);
          return;
        }

        const randomIndex = Math.floor(Math.random() * totalMatches);
        if (randomIndex < MAX_RESERVOIR_SIZE) {
          reservoir[randomIndex] = point;
        }
      })
      .on('error', (error) => {
        if (finished) {
          return;
        }
        finished = true;
        fileStream.destroy(error);
        reject(error);
      })
      .on('end', finalize)
      .on('close', finalize);
  });

  pointCloudInflight.set(treeIdKey, loadPromise);

  try {
    const cacheEntry = await loadPromise;
    return prepareCachedResponse(treeIdKey, treeId, cacheEntry, maxPoints);
  } finally {
    pointCloudInflight.delete(treeIdKey);
  }
}

app.use(
  '/raw_data',
  express.static(rawDataDir, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.bin' || ext === '.laz' || ext === '.las') {
        // Allow caching for large files but require revalidation to handle updates
        // This helps with Cloudflare Tunnel performance while maintaining correctness
        res.setHeader('Cache-Control', 'public, max-age=3600, no-transform');
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

// 3. Serve the pre-generated map tiles from our final tiles directory with aggressive caching
app.use(
  '/tiles',
  express.static(path.join(__dirname, 'lamesa_forest_final_fixed'), {
    maxAge: '30d', // Cache tiles for 30 days in browser
    etag: true, // Enable ETags for efficient revalidation
    lastModified: true, // Use Last-Modified headers
    immutable: true, // Tell browser these files never change
    setHeaders: (res) => {
      // Add cache control headers
      res.set('Cache-Control', 'public, max-age=2592000, immutable');
      // Add CORS headers for tiles
      res.set('Access-Control-Allow-Origin', '*');
    },
  })
);

// 4. Serve the Potree library files
app.use('/Potree_1.8.2', express.static(path.join(__dirname, 'Potree_1.8.2')));

// --- API Endpoints ---
// A simple endpoint to check if the server is running
app.get('/api/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.get('/api/trees/:treeId/pointcloud', async (req, res) => {
  const { treeId } = req.params;
  const limitParam = Number.parseInt(req.query.limit, 10);
  const maxPoints =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_RESERVOIR_SIZE)
      : MAX_RESERVOIR_SIZE;

  try {
    const data = await loadTreePointCloud(treeId, maxPoints);

    if (!data.totalPoints) {
      res.status(404).json({ error: `No point cloud data found for tree ${treeId}.` });
      return;
    }

    res.json({
      treeId: data.treeId,
      requestedTreeId: data.requestedTreeId,
      totalPoints: data.totalPoints,
      sampledPoints: data.sampledPoints,
      points: data.points,
    });
  } catch (error) {
    console.error('Point cloud fetch error:', error);
    res.status(500).json({ error: 'Failed to load point cloud data.' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log('Serving frontend from the "public" directory.');
  console.log('Serving raw data from the "raw_data" directory.');
  console.log('Serving map tiles from the "lamesa_forest_final_fixed" directory.');

  // Pre-load the cache on startup so the first request is fast
  console.log('Background loading tree point samples...');
  loadPrecomputedSamples();
});
