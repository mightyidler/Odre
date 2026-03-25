/**
 * inject-updater-key.js
 * 빌드 전: .env에서 TAURI_UPDATER_PUBKEY를 읽어 tauri.conf.json에 주입합니다.
 * 빌드 후: 플레이스홀더로 되돌립니다.
 *
 * 사용법:
 *   node inject-updater-key.js inject   (prebuild)
 *   node inject-updater-key.js restore  (postbuild)
 */
const fs = require('fs');
const path = require('path');

const CONF_PATH = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
const ENV_PATH = path.join(__dirname, '.env');
const PLACEHOLDER = 'REPLACE_WITH_UPDATER_PUBKEY';

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('[inject-updater-key] .env 파일을 찾을 수 없습니다. updater.key.pub 에서 TAURI_UPDATER_PUBKEY를 .env에 설정해 주세요.');
    process.exit(1);
  }
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const match = content.match(/^TAURI_UPDATER_PUBKEY=(.+)$/m);
  if (!match || !match[1].trim()) {
    console.error('[inject-updater-key] .env에 TAURI_UPDATER_PUBKEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  return match[1].trim();
}

function inject() {
  const pubkey = readEnv();
  const conf = fs.readFileSync(CONF_PATH, 'utf-8');
  const updated = conf.replace(`"pubkey": "${PLACEHOLDER}"`, `"pubkey": "${pubkey}"`);

  if (conf === updated) {
    // 이미 실제 키가 들어있을 수도 있으므로, 플레이스홀더가 없으면 직접 교체 시도
    const keyRegex = /"pubkey"\s*:\s*"(.+?)"/;
    const m = conf.match(keyRegex);
    if (m && m[1] === pubkey) {
      console.log('[inject-updater-key] 이미 실제 키가 적용되어 있습니다.');
      return;
    }
    const replaced = conf.replace(keyRegex, `"pubkey": "${pubkey}"`);
    fs.writeFileSync(CONF_PATH, replaced, 'utf-8');
    console.log('[inject-updater-key] pubkey 주입 완료 (기존 값 교체)');
    return;
  }

  fs.writeFileSync(CONF_PATH, updated, 'utf-8');
  console.log('[inject-updater-key] pubkey 주입 완료');
}

function restore() {
  const conf = fs.readFileSync(CONF_PATH, 'utf-8');
  const keyRegex = /"pubkey"\s*:\s*"(.+?)"/;
  const updated = conf.replace(keyRegex, `"pubkey": "${PLACEHOLDER}"`);
  fs.writeFileSync(CONF_PATH, updated, 'utf-8');
  console.log('[inject-updater-key] pubkey를 플레이스홀더로 복원 완료');
}

const action = process.argv[2];
if (action === 'inject') {
  inject();
} else if (action === 'restore') {
  restore();
} else {
  console.log('사용법: node inject-updater-key.js [inject|restore]');
}
