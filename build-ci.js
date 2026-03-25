/**
 * build-release.js
 * 
 * 하나의 명령으로 전체 릴리스 프로세스를 실행합니다:
 * 1. .env에서 pubkey를 읽어 tauri.conf.json에 주입
 * 2. updater.key에서 TAURI_SIGNING_PRIVATE_KEY를 설정하고 tauri build 실행
 * 3. 빌드 산출물을 루트로 복사
 * 4. GitHub Release 생성 + 업로드 + update.json 갱신 + push
 * 5. pubkey를 플레이스홀더로 복원
 *
 * 사용법: npm run release
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const KEY_PATH = path.join(ROOT, 'updater.key');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnvValue(key) {
  if (!fs.existsSync(ENV_PATH)) return '';
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function run(cmd, extraEnv = {}) {
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

async function main() {
  let privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
  let password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || loadEnvValue('TAURI_SIGNING_PRIVATE_KEY_PASSWORD');

  if (!privateKey) {
    if (!fs.existsSync(KEY_PATH)) {
      console.error('❌ updater.key 파일을 찾을 수 없으며, 환경변수(TAURI_SIGNING_PRIVATE_KEY)도 설정되지 않았습니다. 먼저 npx tauri signer generate 를 실행해 주세요.');
      process.exit(1);
    }
    privateKey = fs.readFileSync(KEY_PATH, 'utf-8').trim();
  }

  // 1. pubkey 주입
  console.log('━━━ [1/5] pubkey 주입 ━━━');
  run('node inject-updater-key.js inject');

  // 2. tauri build (서명 환경변수 포함)
  console.log('━━━ [2/5] tauri build ━━━');
  console.log(`[build-release] TAURI_SIGNING_PRIVATE_KEY 설정됨: ${privateKey.substring(0, 20)}...`);
  try {
    run('npx tauri build --bundles nsis', {
      TAURI_SIGNING_PRIVATE_KEY: privateKey,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password || '',
    });
  } catch (err) {
    console.error('❌ 빌드 실패. pubkey를 복원합니다.');
    run('node inject-updater-key.js restore');
    process.exit(1);
  }

  // 3. 빌드 산출물 복사
  console.log('━━━ [3/5] 빌드 파일 복사 ━━━');
  run('node copy-build-output.js');

  // 4. GitHub 배포
  console.log('━━━ [4/5] GitHub 배포 ━━━');
  run('node publish-update.js');

  // 5. pubkey 복원
  console.log('━━━ [5/5] pubkey 복원 ━━━');
  run('node inject-updater-key.js restore');

  console.log('\n✅ 릴리스 프로세스가 완료되었습니다!\n');
}

main().catch(err => {
  console.error('❌ 릴리스 오류:', err.message);
  // 안전장치: 실패해도 pubkey 복원
  try { execSync('node inject-updater-key.js restore', { cwd: ROOT, stdio: 'inherit' }); } catch {}
  process.exit(1);
});
