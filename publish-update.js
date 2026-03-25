/**
 * publish-update.js
 * 
 * npm run build 이후 자동 실행되어:
 * 1. 빌드된 .nsis.zip 파일을 GitHub Release로 업로드
 * 2. update.json을 새 버전 정보로 갱신
 * 3. update.json을 git commit + push
 *
 * 필요 환경변수 (.env):
 *   GITHUB_TOKEN=ghp_xxxxxxxxxxxx
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// ─── 설정 읽기 ──────────────────────────────────────────────
const CONF_PATH = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
const UPDATE_JSON_PATH = path.join(__dirname, 'update.json');
const ENV_PATH = path.join(__dirname, '.env');

const OWNER = 'mightyidler';
const REPO = 'Odre';

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env = {};
  fs.readFileSync(ENV_PATH, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  });
  return env;
}

function readVersion() {
  const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
  return conf.version;
}

// ─── GitHub API 헬퍼 ────────────────────────────────────────
function githubApi(method, apiPath, token, body = null, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: apiPath.startsWith('uploads.') ? 'uploads.github.com' : 'api.github.com',
      path: apiPath.startsWith('uploads.') ? apiPath.replace('uploads.github.com', '') : apiPath,
      method,
      headers: {
        'User-Agent': 'Odre-Updater',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    if (body && contentType === 'application/json') {
      const jsonStr = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(jsonStr);
    } else if (body) {
      options.headers['Content-Type'] = contentType;
      options.headers['Content-Length'] = body.length;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);

    if (body && contentType === 'application/json') {
      req.write(JSON.stringify(body));
    } else if (body) {
      req.write(body);
    }
    req.end();
  });
}

function uploadAsset(uploadUrl, token, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`));

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Odre-Updater',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

// ─── 메인 ───────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const token = env.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn('[publish-update] GITHUB_TOKEN이 설정되지 않았습니다. update.json 갱신 및 GitHub Release를 건너뜁니다.');
    console.warn('[publish-update] .env에 GITHUB_TOKEN=ghp_xxx 형태로 추가해 주세요.');
    return;
  }

  const version = readVersion();
  const tag = `v${version}`;
  console.log(`[publish-update] 버전 ${version} 배포를 시작합니다...`);

  // 빌드 산출물 경로
  const nsisDir = path.join(__dirname, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  const zipName = `Odre_${version}_x64-setup.nsis.zip`;
  const sigName = `${zipName}.sig`;
  const zipPath = path.join(nsisDir, zipName);
  const sigPath = path.join(nsisDir, sigName);

  if (!fs.existsSync(zipPath)) {
    console.error(`[publish-update] 빌드 파일을 찾을 수 없습니다: ${zipPath}`);
    return;
  }
  if (!fs.existsSync(sigPath)) {
    console.error(`[publish-update] 서명 파일을 찾을 수 없습니다: ${sigPath}`);
    return;
  }

  const signature = fs.readFileSync(sigPath, 'utf-8').trim();

  // 1. GitHub Release 생성
  console.log(`[publish-update] GitHub Release ${tag} 생성 중...`);
  let release;
  try {
    release = await githubApi('POST', `/repos/${OWNER}/${REPO}/releases`, token, {
      tag_name: tag,
      name: `Odre ${tag}`,
      body: `Odre ${version} 릴리스`,
      draft: false,
      prerelease: false,
    });
    console.log(`[publish-update] Release 생성 완료: ${release.html_url}`);
  } catch (err) {
    // 이미 존재하는 태그일 수 있음
    console.warn(`[publish-update] Release 생성 실패 (이미 존재할 수 있음): ${err.message}`);
    // 기존 릴리스 조회 시도
    try {
      release = await githubApi('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, token);
      console.log(`[publish-update] 기존 Release 사용: ${release.html_url}`);
    } catch {
      console.error('[publish-update] Release를 찾을 수 없습니다. 중단합니다.');
      return;
    }
  }

  // 2. .nsis.zip 파일 업로드
  console.log(`[publish-update] ${zipName} 업로드 중...`);
  let asset;
  try {
    asset = await uploadAsset(release.upload_url, token, zipPath, zipName);
    console.log(`[publish-update] 업로드 완료: ${asset.browser_download_url}`);
  } catch (err) {
    console.error(`[publish-update] 업로드 실패: ${err.message}`);
    return;
  }

  // 3. update.json 갱신
  const updateData = {
    version: version,
    notes: `Odre ${version} 업데이트`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: signature,
        url: asset.browser_download_url,
      },
    },
  };

  fs.writeFileSync(UPDATE_JSON_PATH, JSON.stringify(updateData, null, 2) + '\n', 'utf-8');
  console.log('[publish-update] update.json 갱신 완료');

  // 4. update.json을 git commit + push
  try {
    execSync('git add update.json', { cwd: __dirname, stdio: 'pipe' });
    execSync(`git commit -m "chore: update update.json for ${tag}"`, { cwd: __dirname, stdio: 'pipe' });
    execSync('git push origin main', { cwd: __dirname, stdio: 'pipe' });
    console.log('[publish-update] update.json을 GitHub에 push 완료');
  } catch (err) {
    console.warn(`[publish-update] git push 실패 (수동으로 push 해주세요): ${err.message}`);
  }

  console.log(`\n✅ 배포 완료! 기존 사용자의 앱이 자동으로 v${version}으로 업데이트됩니다.`);
}

main().catch(err => {
  console.error('[publish-update] 오류:', err.message);
  process.exit(1);
});
