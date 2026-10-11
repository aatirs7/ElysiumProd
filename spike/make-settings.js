// Writes settings.spike.json: a status line shim and every hook event pointed at hooklog.js.
// Loaded with `claude --settings`, so no config directory is edited.
const fs = require('fs');
const path = require('path');
const H = __dirname.split(path.sep).join('/');
const events = ['SessionStart', 'SessionEnd', 'Stop', 'Notification', 'PreCompact', 'PostCompact', 'PreModelSwitch', 'PostModelSwitch', 'UserPromptSubmit'];
const hooks = {};
for (const e of events) hooks[e] = [{ hooks: [{ type: 'command', command: `node "${H}/hooklog.js" ${e}` }] }];
fs.writeFileSync(path.join(__dirname, 'settings.spike.json'), JSON.stringify({
  statusLine: { type: 'command', command: `node "${H}/statusline.js"` },
  hooks,
}, null, 2));
console.log('written');
