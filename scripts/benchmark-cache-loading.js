const fs = require('fs');
const path = require('path');
const readline = require('readline');

const precomputedSamplesPath = path.join(__dirname, '../raw_data/tree_point_samples.json');

async function loadPrecomputedSamples() {
  console.time('Load Cache');
  console.log(`[Cache] Starting to load precomputed samples from ${precomputedSamplesPath}...`);
  
  if (!fs.existsSync(precomputedSamplesPath)) {
    console.error('File not found!');
    return;
  }

  const treeEntries = new Map();
  const input = fs.createReadStream(precomputedSamplesPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let count = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const record = JSON.parse(trimmed);
      if (record.type === 'tree') {
        treeEntries.set(record.treeId, true); // Just store boolean to save memory for benchmark
        count++;
      }
    } catch (error) {
      console.error('JSON parse error:', error);
    }
  }

  console.log(`[Cache] Successfully loaded ${count} trees.`);
  console.timeEnd('Load Cache');
}

loadPrecomputedSamples();
