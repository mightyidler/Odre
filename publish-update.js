/**
 * publish-update.js
 * 
 * tauri-apps/tauri-action이 이미 GitHub Release 및 파일 업로드를 마친 후 실행됩니다.
 * 1. 해당 태그의 GitHub Release에서 -setup.exe 자산 URL과 서명(.sig)을 가져옴
 * 2. update.json을 새 버전 정보로 갱신
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

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

function githubGet(apiPath, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Odre-Updater',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const env = loadEnv();
  const token = process.env.GITHUB_TOKEN || env.GITHUB_TOKEN;

  if (!token) {
    console.error('[publish-update] GITHUB_TOKEN이 설정되지 않았습니다.');
    process.exit(1);
  }

  const version = readVersion();
  const tag = `v${version}`;
  console.log(`[publish-update] ${tag} 릴리스에서 자산 정보를 가져오는 중...`);

  // 릴리스 조회 (tauri-action이 이미 생성함)
  let release;
  let retries = 5;
  while (retries-- > 0) {
    try {
      release = await githubGet(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`, token);
      break;
    } catch (err) {
      if (retries === 0) {
        console.error(`[publish-update] 릴리스를 찾을 수 없습니다: ${err.message}`);
        process.exit(1);
      }
      console.log(`[publish-update] 릴리스 아직 없음, 5초 후 재시도... (${retries}회 남음)`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`[publish-update] 릴리스 찾음: ${release.html_url}`);
  console.log(`[publish-update] 자산 목록:`);
  release.assets.forEach(a => console.log(`  - ${a.name}`));

  // -setup.exe 자산 찾기 (Tauri v2는 .nsis.zip 대신 서명된 .exe를 사용)
  const exeAsset = release.assets.find(a => a.name.endsWith('-setup.exe'));
  if (!exeAsset) {
    console.error('[publish-update] -setup.exe 자산을 찾을 수 없습니다. tauri-action이 서명과 함께 빌드했는지 확인하세요.');
    console.error('사용 가능한 자산:', release.assets.map(a => a.name).join(', '));
    process.exit(1);
  }

  // -setup.exe.sig 서명 파일 찾기
  const sigAsset = release.assets.find(a => a.name.endsWith('-setup.exe.sig'));
  if (!sigAsset) {
    console.error('[publish-update] -setup.exe.sig 서명 파일을 찾을 수 없습니다.');
    console.error('사용 가능한 자산:', release.assets.map(a => a.name).join(', '));
    process.exit(1);
  }

  // 서명 파일 내용 다운로드
  console.log(`[publish-update] 서명 파일 다운로드: ${sigAsset.browser_download_url}`);
  const signature = (await fetchUrl(sigAsset.browser_download_url)).trim();

  // update.json 갱신
  const updateData = {
    version: version,
    notes: `Odre ${version} 업데이트`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: signature,
        url: exeAsset.browser_download_url,
      },
    },
  };

  fs.writeFileSync(UPDATE_JSON_PATH, JSON.stringify(updateData, null, 2) + '\n', 'utf-8');
  console.log(`[publish-update] update.json 갱신 완료`);
  console.log(`  버전: ${version}`);
  console.log(`  URL: ${exeAsset.browser_download_url}`);
  console.log(`  서명: ${signature.substring(0, 30)}...`);
}

main().catch(err => {
  console.error('[publish-update] 오류:', err.message);
  process.exit(1);
});
