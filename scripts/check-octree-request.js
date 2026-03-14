const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  cwd: path.join(__dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (data.toString().includes('Server listening')) {
    makeRequest();
  }
});

server.stderr.on('data', (data) => {
  process.stderr.write(data);
});

function makeRequest() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/raw_data/modified_merged_converted/octree.bin',
    method: 'GET',
    headers: {
      'Range': 'bytes=0-1023',
      'content-type': 'multipart/byteranges'
    }
  };

  const req = http.request(options, (res) => {
    console.log('statusCode:', res.statusCode);
    console.log('headers:', res.headers);

    res.on('data', () => {});
    res.on('end', () => {
      server.kill();
    });
  });

  req.on('error', (error) => {
    console.error('request error:', error);
    server.kill();
  });

  req.end();
}

process.on('exit', () => {
  if (!server.killed) {
    server.kill();
  }
});
