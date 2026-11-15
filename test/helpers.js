const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadData() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('data.js'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.POST_DATA));
}

module.exports = { ROOT, read, loadData };
