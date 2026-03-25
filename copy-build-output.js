const fs = require('fs');
const path = require('path');

const tauriConfPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
let version = '0.1.0';

if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    version = tauriConf.version || version;
  } catch (err) {
    console.error('Failed to read tauri.conf.json:', err);
  }
}

const exeName = 'Odre.exe';
const setupName = `Odre_${version}_x64-setup.exe`;

const srcExe = path.join(__dirname, 'src-tauri', 'target', 'release', exeName);
const srcSetup = path.join(__dirname, 'src-tauri', 'target', 'release', 'bundle', 'nsis', setupName);

const destExe = path.join(__dirname, exeName);
const destSetup = path.join(__dirname, setupName);

function copyFile(src, dest, name) {
  if (fs.existsSync(src)) {
    try {
      // fs.copyFileSync overwrites existing files by default
      fs.copyFileSync(src, dest);
      console.log(`[Build] Successfully copied ${name} to project root.`);
    } catch (err) {
      console.error(`[Build] Failed to copy ${name}:`, err.message);
    }
  } else {
    console.warn(`[Build] Source file not found: ${src}`);
  }
}

copyFile(srcExe, destExe, exeName);
copyFile(srcSetup, destSetup, setupName);
