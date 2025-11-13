/*
 * Build a lightweight cache of per-tree point samples from the newgroups_adjusted_all_v3.csv file.
 *
 * Usage:
 *   node scripts/build-tree-point-samples.js [maxPointsPerTree]
 *
 * The script performs a single streaming pass over the CSV (≈5 GB) and keeps a
 * reservoir sample of points for each tree. The output JSON lives in
 * raw_data/tree_point_samples.json and is ignored by git. The cache is written
 * as newline-delimited JSON (first record = metadata, subsequent records = trees).
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { once } = require('events');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RAW_DATA_DIR = path.join(PROJECT_ROOT, 'raw_data');
const SOURCE_FILE = path.join(RAW_DATA_DIR, 'newgroups_adjusted_all_v3.csv');
const OUTPUT_FILE = path.join(RAW_DATA_DIR, 'tree_point_samples.json');

const DEFAULT_MAX_POINTS = 50000;
const REPORT_INTERVAL = 500_000;

const userSuppliedLimit = Number.parseInt(process.argv[2], 10);
const MAX_POINTS_PER_TREE =
  Number.isFinite(userSuppliedLimit) && userSuppliedLimit > 0
    ? userSuppliedLimit
    : DEFAULT_MAX_POINTS;

if (!fs.existsSync(SOURCE_FILE)) {
  console.error(`Source CSV not found at ${SOURCE_FILE}`);
  process.exit(1);
}

console.log('Building per-tree point cloud cache');
console.log(`  Source: ${SOURCE_FILE}`);
console.log(`  Output: ${OUTPUT_FILE}`);
console.log(`  Max samples per tree: ${MAX_POINTS_PER_TREE}`);

const startTime = Date.now();
const reservoirs = new Map();
let rowCount = 0;
let skippedRows = 0;

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) {
    await once(stream, 'drain');
  }
}

function normaliseTreeId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSamplePoint(row) {
  const x = Number.parseFloat(row.X ?? row.x);
  const y = Number.parseFloat(row.Y ?? row.y);
  const z = Number.parseFloat(row.Z ?? row.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  const intensityRaw = Number.parseFloat(
    row.Intensity ?? row.intensity ?? row.intensity_return ?? row.intensity_returned
  );
  const intensity = Number.isFinite(intensityRaw) ? Math.round(intensityRaw * 100) / 100 : null;

  // Round coordinates slightly to keep file size manageable.
  const sampleX = Math.round(x * 1000) / 1000;
  const sampleY = Math.round(y * 1000) / 1000;
  const sampleZ = Math.round(z * 1000) / 1000;

  return [sampleX, sampleY, sampleZ, intensity];
}

function getReservoir(treeId) {
  if (!reservoirs.has(treeId)) {
    reservoirs.set(treeId, {
      totalPoints: 0,
      points: [],
    });
  }
  return reservoirs.get(treeId);
}

function addSample(treeId, point) {
  const entry = getReservoir(treeId);
  entry.totalPoints += 1;

  if (entry.points.length < MAX_POINTS_PER_TREE) {
    entry.points.push(point);
    return;
  }

  const replaceIndex = Math.floor(Math.random() * entry.totalPoints);
  if (replaceIndex < MAX_POINTS_PER_TREE) {
    entry.points[replaceIndex] = point;
  }
}

console.log('Streaming CSV… this may take several minutes.');

const stream = fs
  .createReadStream(SOURCE_FILE)
  .pipe(csv())
  .on('data', (row) => {
    rowCount += 1;

    if (rowCount % REPORT_INTERVAL === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`  Processed ${rowCount.toLocaleString()} rows in ${elapsed.toFixed(1)}s`);
    }

    const treeId = normaliseTreeId(row.tree_id ?? row.treeId ?? row.TREE_ID);
    if (!treeId) {
      skippedRows += 1;
      return;
    }

    const point = toSamplePoint(row);
    if (!point) {
      skippedRows += 1;
      return;
    }

    addSample(treeId, point);
  })
  .on('error', (error) => {
    console.error('CSV streaming error:', error);
    process.exit(1);
  })
  .on('end', async () => {
    const elapsedMs = Date.now() - startTime;
    const totalTrees = reservoirs.size;
    const totalRetainedPoints = Array.from(reservoirs.values()).reduce(
      (sum, entry) => sum + entry.points.length,
      0
    );
    const totalSourcePoints = Array.from(reservoirs.values()).reduce(
      (sum, entry) => sum + entry.totalPoints,
      0
    );

    console.log('Finished streaming CSV');
    console.log(`  Rows processed: ${rowCount.toLocaleString()}`);
    console.log(`  Rows skipped:   ${skippedRows.toLocaleString()}`);
    console.log(`  Trees seen:     ${totalTrees.toLocaleString()}`);

    const tempFile = `${OUTPUT_FILE}.tmp`;
    const writeStream = fs.createWriteStream(tempFile, { encoding: 'utf8' });

    writeStream.on('error', (error) => {
      console.error('Failed to write cache file:', error);
      process.exit(1);
    });

    try {
      const metadataRecord = {
        type: 'metadata',
        source: path.basename(SOURCE_FILE),
        generatedAt: new Date().toISOString(),
        maxSamplesPerTree: MAX_POINTS_PER_TREE,
        totalTrees,
        totalPointsInSource: totalSourcePoints,
        totalSampledPoints: totalRetainedPoints,
      };

      await writeChunk(writeStream, `${JSON.stringify(metadataRecord)}\n`);

      const entries = Array.from(reservoirs.entries());
      for (let index = 0; index < entries.length; index += 1) {
        const [treeId, entry] = entries[index];
        const treeRecord = {
          type: 'tree',
          treeId,
          totalPoints: entry.totalPoints,
          sampledPoints: entry.points,
        };

        await writeChunk(writeStream, `${JSON.stringify(treeRecord)}\n`);
      }

      await new Promise((resolve, reject) => {
        writeStream.end((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      fs.rename(tempFile, OUTPUT_FILE, (renameError) => {
        if (renameError) {
          console.error('Failed to finalize cache file:', renameError);
          process.exit(1);
        }

        console.log(`Cache written to ${OUTPUT_FILE}`);
        console.log(`Total runtime: ${(elapsedMs / 1000 / 60).toFixed(2)} minutes`);
      });
    } catch (error) {
      console.error('Failed while streaming cache file:', error);
      writeStream.destroy();
      fs.rm(tempFile, { force: true }, () => process.exit(1));
    }
  });

process.on('SIGINT', () => {
  console.warn('\nInterrupted. Partial cache will not be written.');
  stream.destroy(new Error('Interrupted by user'));
  process.exit(1);
});
