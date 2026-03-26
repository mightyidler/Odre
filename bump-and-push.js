const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd) {
  console.log(`▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// 1. package.json 읽고 버전 올리기
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const parts = oldVersion.split('.');
parts[2] = parseInt(parts[2], 10) + 1;
const newVersion = parts.join('.');

console.log(`📌 버전 업데이트: ${oldVersion} -> ${newVersion}`);

// package.json 갱신
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. tauri.conf.json 갱신
const tauriPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf-8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n');

// 3. Cargo.toml 갱신
const cargoPath = path.join(__dirname, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, 'utf-8');
  cargoContent = cargoContent.replace(/^version = ".*?"/m, `version = "${newVersion}"`);
  fs.writeFileSync(cargoPath, cargoContent);
}

// 4. Git 커밋 및 태그 생성, 푸시
try {
  // 혹시 모를 로컬 변경사항 저장 및 원격 동기화
  run('git stash');
  run('git pull origin main --rebase');
  run('git stash pop || echo "No stash to pop"');

  run('git add -A');
  
  // 변경사항이 있을 때만 커밋하도록 오류 무시처리
  try {
    execSync(`git commit -m "chore: bump version to v${newVersion}"`, { stdio: 'inherit' });
  } catch(e) {
    console.log("No changes to commit, proceeding to tag and push...");
  }
  
  run(`git tag v${newVersion} || echo "Tag already exists"`);
  
  console.log('\n🚀 GitHub으로 푸시 중 (이 작업이 완료되면 GitHub Actions에서 클라우드 빌드가 시작됩니다!)...');
  run('git push origin main');
  run(`git push origin v${newVersion}`);
  
  console.log(`\n✅ v${newVersion} 버전 펌핑 및 푸시가 완료되었습니다!`);
  console.log('이제 GitHub Actions가 클라우드에서 빌드, 서명, 배포 및 update.json 갱신을 자동으로 처리합니다.');
} catch (err) {
  console.error('\n❌ Git 작업 중 오류가 발생했습니다:', err.message);
  console.log('버전이 변경된 파일을 확인하고 수동으로 커밋/푸시해 주세요.');
  process.exit(1);
}
