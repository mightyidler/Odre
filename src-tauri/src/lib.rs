use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, State, Window,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::mpsc;

// ─── 데이터 모델 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderRule {
    pub id: u32,
    pub name: String,
    pub exts: Vec<String>,
    pub patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub watch_folders: Vec<String>,
    pub rules: Vec<FolderRule>,
    pub enabled: bool,
    pub sort_in_watch: bool,
    pub dest_folder: Option<String>,
    pub move_delay_secs: u64,
    pub duplicate_action: String, // "number" | "overwrite" | "skip"
    pub language: String,
    pub autostart: bool,
    pub theme: String, // "dark" | "light"
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            watch_folders: vec![],
            rules: vec![],
            enabled: false,
            sort_in_watch: true,
            dest_folder: None,
            move_delay_secs: 0,
            duplicate_action: "number".into(),
            language: "auto".into(),
            autostart: true,
            theme: "system".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveRecord {
    pub from: String,
    pub to: String,
    pub rule_name: String,
    pub timestamp: u64,
}

pub struct OdreState {
    pub settings: Mutex<AppSettings>,
    pub history: Mutex<Vec<MoveRecord>>,
    pub pending: Mutex<HashMap<PathBuf, Instant>>,
}

// ─── 설정 파일 경로 ───────────────────────────────────────────

fn config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("config dir")
        .join("settings.json")
}

fn load_settings(app: &AppHandle) -> AppSettings {
    let path = config_path(app);
    if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppSettings::default()
    }
}

fn save_settings_to_disk(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn get_folder_name(rule: &FolderRule, settings: &AppSettings) -> String {
    if let Some(pos) = settings.rules.iter().position(|r| r.id == rule.id) {
        format!("{:02}. {}", pos + 1, rule.name)
    } else {
        rule.name.clone()
    }
}

fn is_odre_folder_name(name: &str) -> bool {
    name.len() >= 4
        && name.as_bytes()[0].is_ascii_digit()
        && name.as_bytes()[1].is_ascii_digit()
        && name[2..].starts_with(". ")
}

// ─── 규칙 매칭 ────────────────────────────────────────────────

fn find_rule<'a>(path: &Path, rules: &'a [FolderRule]) -> Option<&'a FolderRule> {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 1순위: 파일명 패턴 검사
    for rule in rules {
        for pattern in &rule.patterns {
            let kw = pattern
                .trim_start_matches('*')
                .trim_end_matches('*')
                .to_lowercase();
            if !kw.is_empty() && filename.contains(&kw) {
                return Some(rule);
            }
        }
    }

    // 2순위: 확장자 검사
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        for rule in rules {
            if rule.exts.iter().any(|e| e.to_lowercase() == ext_lower) {
                return Some(rule);
            }
        }
    }

    None
}

// ─── 파일 이동 ────────────────────────────────────────────────

fn is_file_locked(path: &Path) -> bool {
    // 🌟 .append(true)를 추가하면 브라우저가 파일을 점유하고 있을 때 더 민감하게 반응합니다. 
    // 하지만 읽기 전용 파일에서 권한 에러가 발생하므로 일반적인 배타적 공유 위반만 검출하기 위해 read(true)로 검사합니다.
    match fs::OpenOptions::new()
        .read(true)
        .open(path) 
    {
        Ok(_) => false, // 성공하면 잠겨있지 않음
        Err(_) => true,  // 에러 나면 누군가(엣지) 사용 중임
    }
}

fn safe_move_file(src: &Path, dest: &Path) -> std::io::Result<()> {
    if fs::rename(src, dest).is_err() {
        fs::copy(src, dest)?;
        fs::remove_file(src)?;
    }
    Ok(())
}

/// 동일 이름 폴더가 있으면 파일을 병합하며 이동, 비어있는 원본 폴더 삭제
fn merge_move_dir(src: &Path, dest: &Path, dup_action: &str) -> Result<u32, String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut count = 0u32;

    let entries = fs::read_dir(src).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            if dup_action == "skip" && dest.join(filename).exists() {
                continue;
            }

            let dest_path = unique_dest_path(dest, filename, dup_action);
            if safe_move_file(&path, &dest_path).is_ok() {
                count += 1;
            }
        }
    }

    // 빈 원본 폴더 삭제 시도
    let _ = fs::remove_dir(src);
    Ok(count)
}

fn resolve_dest(src: &Path, rule: &FolderRule, settings: &AppSettings) -> PathBuf {
    let folder_name = get_folder_name(rule, settings);

    let mut base_dir = src.parent().unwrap_or(Path::new(".")).to_path_buf();
    if let Some(parent_name) = base_dir.file_name().and_then(|n| n.to_str()) {
        if parent_name.len() >= 4 
            && parent_name.as_bytes()[0].is_ascii_digit() 
            && parent_name.as_bytes()[1].is_ascii_digit() 
            && parent_name[2..].starts_with(". ") 
        {
            base_dir = base_dir.parent().unwrap_or(Path::new(".")).to_path_buf();
        }
    }

    if settings.sort_in_watch {
        base_dir.join(&folder_name)
    } else if let Some(ref dest) = settings.dest_folder {
        PathBuf::from(dest).join(&folder_name)
    } else {
        base_dir.join(&folder_name)
    }
}

fn unique_dest_path(dest_dir: &Path, filename: &str, action: &str) -> PathBuf {
    let dest = dest_dir.join(filename);
    if !dest.exists() {
        return dest;
    }
    match action {
        "overwrite" => dest,
        "skip" => dest,
        _ => {
            let path = Path::new(filename);
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
            let ext = path.extension().and_then(|e| e.to_str());
            let mut n = 1u32;
            loop {
                let new_name = match ext {
                    Some(e) => format!("{}({}){}.{}", stem, n, "", e),
                    None => format!("{}({})", stem, n),
                };
                let candidate = dest_dir.join(&new_name);
                if !candidate.exists() {
                    return candidate;
                }
                n += 1;
            }
        }
    }
}

fn move_file(
    _app: &AppHandle,
    src: PathBuf,
    rule: &FolderRule,
    settings: &AppSettings,
    state: &OdreState,
) {
    let dest_dir = resolve_dest(&src, rule, settings);
    let folder_name = get_folder_name(rule, settings);

    let filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    if src == dest_dir.join(filename) {
        return;
    }

    if let Err(e) = fs::create_dir_all(&dest_dir) {
        log::error!("dest dir 생성 실패: {}", e);
        return;
    }

    if settings.duplicate_action == "skip" {
        let candidate = dest_dir.join(filename);
        if candidate.exists() {
            log::info!("skip (중복): {:?}", src);
            return;
        }
    }

    let dest_path = unique_dest_path(&dest_dir, filename, &settings.duplicate_action);

    // 파일 잠금 해제 때까지 대기하지 않고, 현재 잠겨있으면 바로 건너뜁니다.
    // 다운로드가 완료되면 OS가 발생시키는 이벤트로 인해 다시 호출됩니다.
    if is_file_locked(&src) {
        log::warn!("파일이 사용 중(다운로드 중 등)입니다. 나중에 처리합니다: {:?}", src);
        return;
    }

    // 🌟 프리징 버그 해결: 무식한 while 20초 대기 루프를 삭제했습니다.
    // 대신 OS 네이티브 기능(rename)을 사용해 잠겨있지 않을 때만 즉시 이동을 시도합니다.
    let mut success = false;
    
    match fs::rename(&src, &dest_path) {
        Ok(_) => { success = true; }
        Err(_) => {
            // 다른 프로세스가 쓰고 있어서 실패했다면, 강제 복사 후 삭제를 1회 시도합니다.
            if fs::copy(&src, &dest_path).is_ok() {
                if fs::remove_file(&src).is_ok() {
                    success = true;
                } else {
                    // 원본 삭제 실패 시 롤백 (안전 장치)
                    let _ = fs::remove_file(&dest_path);
                }
            }
        }
    }

    if success {
        log::info!("이동: {:?} → {:?}", src, dest_path);
        let record = MoveRecord {
            from: src.to_string_lossy().into(),
            to: dest_path.to_string_lossy().into(),
            rule_name: folder_name,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };
        state.history.lock().unwrap().push(record.clone());
    } else {
        // 파일이 다운로드 중이라 락이 걸려있다면 미련 없이 건너뜁니다. (앱 멈춤 방지)
        log::warn!("파일이 사용 중이라 이번 턴은 건너뜁니다: {:?}", src);
    }
}

// ─── 파일 모니터링 루프 ───────────────────────────────────────────

fn start_watcher(app: AppHandle, state: Arc<OdreState>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            let (tx, mut rx) = mpsc::channel::<notify::Result<Event>>(256);

            let mut watcher = RecommendedWatcher::new(
                move |res| {
                    let _ = tx.blocking_send(res);
                },
                Config::default().with_poll_interval(Duration::from_secs(2)),
            )
            .expect("watcher 생성 실패");

            {
                let settings = state.settings.lock().unwrap();
                for folder in &settings.watch_folders {
                    let p = PathBuf::from(folder);
                    if p.exists() {
                        let _ = watcher.watch(&p, RecursiveMode::NonRecursive);
                        log::info!("모니터링 시작: {:?}", p);
                    }
                }
            }

            let app_clone = app.clone();
            let state_clone = state.clone();
            app.listen("watch-folders-changed", move |_| {
                log::info!("모니터링 폴더 변경됨 — 재시작 필요");
                let _ = app_clone.emit("restart-required", ());
                drop(state_clone.settings.lock());
            });

            loop {
                tokio::select! {
                    Some(res) = rx.recv() => {
                        match res {
                            Ok(event) => {
                                handle_event(&state, event).await;
                            }
                            Err(e) => log::error!("watcher 오류: {}", e),
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(1)) => {
                        process_pending(&app, &state).await;
                    }
                }
            }
        });
    });
}

async fn handle_event(state: &Arc<OdreState>, event: Event) {
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            let settings = state.settings.lock().unwrap();
            if !settings.enabled {
                return;
            }
            drop(settings);

            for path in event.paths {
                if path.is_dir() {
                    continue;
                }

                if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) == 0 {
                    continue; 
                }
                
                // 브라우저 다운로드 등 임시 파일 확장자 강력 예외 처리
                // handle_event 내부
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let name_lower = name.to_lowercase();
                    
                    // 1. 숨김 파일 및 오피스 임시 파일 (~$)
                    if name.starts_with('.') || name.starts_with("~$") {
                        continue;
                    }

                    // 2. 금지된 확장자들
                    let forbidden_exts = vec![
                        "tmp", "crdownload", "part", "download", "opdownload", 
                        "aria2", "torrent", "db", "ini", "lnk", "!ut"
                    ];

                    if forbidden_exts.iter().any(|ext| name_lower.ends_with(ext)) {
                        continue;
                    }
                }
                
                {
                    let settings = state.settings.lock().unwrap();
                    let is_rule_folder = settings.rules.iter().enumerate().any(|(i, r)| {
                        let expected_name = format!("{:02}. {}", i + 1, r.name);
                        path.parent()
                            .and_then(|p| p.file_name())
                            .and_then(|n| n.to_str())
                            .map(|n| n == expected_name || n == r.name)
                            .unwrap_or(false)
                    });
                    if is_rule_folder {
                        continue;
                    }
                }

                // 이벤트를 받는 족족 펜딩 맵에 넣고 시간을 갱신합니다. (Debounce 구현)
                state
                    .pending
                    .lock()
                    .unwrap()
                    .insert(path, Instant::now());
            }
        }
        _ => {}
    }
}

async fn process_pending(app: &AppHandle, state: &Arc<OdreState>) {
    let settings = state.settings.lock().unwrap().clone();
    if !settings.enabled {
        return;
    }

    // "즉시(0)" 설정이더라도 브라우저 다운로드 직후 파일 접근 충돌 방지를 위해 최소 2초 유예(Debounce)를 둡니다.
    let delay_secs = if settings.move_delay_secs == 0 { 2 } else { settings.move_delay_secs };
    let delay = Duration::from_secs(delay_secs);
    let mut ready: Vec<PathBuf> = vec![];

    {
        let pending = state.pending.lock().unwrap();
        for (path, instant) in pending.iter() {
            if instant.elapsed() >= delay {
                ready.push(path.clone());
            }
        }
    }

    for path in ready {
        state.pending.lock().unwrap().remove(&path);
        if !path.exists() {
            continue;
        }
        if let Some(rule) = find_rule(&path, &settings.rules) {
            let rule = rule.clone();
            move_file(app, path, &rule, &settings, state);
        }
    }
}

// ─── Tauri UI Control Commands ────────────────────────────────
#[tauri::command]
fn minimize_window(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_window(window: Window) {
    let _ = window.hide(); 
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn show_main_window(window: Window) {
    // 자동 실행(--autostart) 꼬리표가 있으면 창을 숨긴 채 트레이에만 머뭅니다.
    let args: Vec<String> = std::env::args().collect();
    if !args.contains(&"--autostart".to_string()) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn select_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

// ─── Tauri Settings Commands ──────────────────────────────────
#[tauri::command]
fn get_settings(state: State<Arc<OdreState>>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<Arc<OdreState>>,
    settings: AppSettings,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let autostart = app.autolaunch();
        if settings.autostart {
            let _ = autostart.enable();
        } else {
            let _ = autostart.disable();
        }
    }

    *state.settings.lock().unwrap() = settings.clone();
    save_settings_to_disk(&app, &settings)?;
    let _ = app.emit("watch-folders-changed", ());
    Ok(())
}

#[tauri::command]
fn get_history(state: State<Arc<OdreState>>) -> Vec<MoveRecord> {
    state.history.lock().unwrap().clone()
}

#[tauri::command]
fn clear_history(state: State<Arc<OdreState>>) {
    state.history.lock().unwrap().clear();
}

// 파일 이동 및 폴더 껍데기 삭제
#[tauri::command]
fn organize_now(app: AppHandle, state: State<Arc<OdreState>>) -> Result<u32, String> {
    let settings = state.settings.lock().unwrap().clone();
    let mut count = 0u32;
    let mut empty_dirs_to_check = Vec::new();

    for folder in &settings.watch_folders {
        let dir = PathBuf::from(folder);
        if !dir.exists() {
            continue;
        }
        
        let mut files_to_process = Vec::new();

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    files_to_process.push(path);
                } else if path.is_dir() {
                    // 하위 Odre 폴더 탐색
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.len() >= 4 
                            && name.as_bytes()[0].is_ascii_digit() 
                            && name.as_bytes()[1].is_ascii_digit() 
                            && name[2..].starts_with(". ") 
                        {
                            empty_dirs_to_check.push(path.clone());
                            if let Ok(sub_entries) = fs::read_dir(&path) {
                                for sub_entry in sub_entries.flatten() {
                                    if sub_entry.path().is_file() {
                                        files_to_process.push(sub_entry.path());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        for path in files_to_process {
            if let Some(rule) = find_rule(&path, &settings.rules) {
                let rule = rule.clone();
                move_file(&app, path, &rule, &settings, &state);
                count += 1;
            }
        }
    }

    // 파일 이동 완료 후 남은 빈 폴더 삭제
    for empty_dir in empty_dirs_to_check {
        let _ = fs::remove_dir(&empty_dir); 
    }

    Ok(count)
}

// 폴더 해체 기능 구현
#[tauri::command]
fn dissolve_folders(app: AppHandle, state: State<Arc<OdreState>>) -> Result<u32, String> {
    // 1. 버그 픽스: 파일 해체를 시작하기 전에 모니터링자(Watcher)부터 끕니다!
    let mut settings = state.settings.lock().unwrap().clone();
    settings.enabled = false;
    *state.settings.lock().unwrap() = settings.clone();
    let _ = save_settings_to_disk(&app, &settings);
    let _ = app.emit("watch-folders-changed", ());

    let mut count = 0u32;
    
    // 설정된 모든 모니터링 폴더(및 대상 폴더)를 스캔 범위에 넣음
    let mut base_dirs = settings.watch_folders.iter().map(PathBuf::from).collect::<Vec<_>>();
    if let Some(dest) = &settings.dest_folder {
        base_dirs.push(PathBuf::from(dest));
    }

    for base_dir in base_dirs {
        if !base_dir.exists() { continue; }

        if let Ok(entries) = fs::read_dir(&base_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // "01. XXX" 형태의 Odre 폴더인지 확인
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.len() >= 4 && name.as_bytes()[0].is_ascii_digit() && name.as_bytes()[1].is_ascii_digit() && name[2..].starts_with(". ") {
                            
                            // 폴더 안의 모든 파일(숨김 포함)을 위로 꺼냄
                            if let Ok(sub_entries) = fs::read_dir(&path) {
                                for sub_entry in sub_entries.flatten() {
                                    if sub_entry.path().is_file() {
                                        if let Some(filename) = sub_entry.path().file_name().and_then(|n| n.to_str()) {
                                            let dest = unique_dest_path(&base_dir, filename, &settings.duplicate_action);
                                            // safe_move_file을 사용하여 유실 0% 보장
                                            if safe_move_file(&sub_entry.path(), &dest).is_ok() {
                                                count += 1;
                                            }
                                        }
                                    }
                                }
                            }
                            // 안의 파일들을 모두 꺼냈으므로 빈 껍데기 폴더 삭제 시도
                            let _ = fs::remove_dir(&path); 
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}

#[tauri::command]
fn migrate_sorted_folders(
    state: State<Arc<OdreState>>,
    to_dest: bool,
) -> Result<u32, String> {
    let settings = state.settings.lock().unwrap().clone();
    let dest_folder = match &settings.dest_folder {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => return Ok(0),
    };

    let mut count = 0u32;

    if to_dest {
        // 모니터링 폴더 → 대상 폴더
        for watch_folder in &settings.watch_folders {
            let watch_dir = PathBuf::from(watch_folder);
            if !watch_dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(&watch_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if is_odre_folder_name(name) {
                            let target = dest_folder.join(name);
                            match merge_move_dir(&path, &target, &settings.duplicate_action) {
                                Ok(n) => count += n,
                                Err(e) => log::error!("폴더 이동 실패: {:?} → {:?}: {}", path, target, e),
                            }
                        }
                    }
                }
            }
        }
    } else {
        // 대상 폴더 → 모니터링 폴더 (첫 번째)
        if settings.watch_folders.is_empty() || !dest_folder.exists() {
            return Ok(0);
        }
        let target_watch = PathBuf::from(&settings.watch_folders[0]);

        if let Ok(entries) = fs::read_dir(&dest_folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if is_odre_folder_name(name) {
                        let target = target_watch.join(name);
                        match merge_move_dir(&path, &target, &settings.duplicate_action) {
                            Ok(n) => count += n,
                            Err(e) => log::error!("폴더 복원 실패: {:?} → {:?}: {}", path, target, e),
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}

#[tauri::command]
fn reset_settings(app: AppHandle, state: State<Arc<OdreState>>) -> Result<(), String> {
    let defaults = AppSettings::default();
    *state.settings.lock().unwrap() = defaults.clone();
    save_settings_to_disk(&app, &defaults)
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn check_for_updates_manual(app: AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                log::info!("수동 업데이트 발견: {}", update.version);
                if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                    return Err(format!("업데이트 설치 실패: {}", e));
                }
                app.restart();
                Ok(format!("업데이트 완료: {}", update.version))
            }
            Ok(None) => Ok("LATEST".to_string()),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    }
}

// ─── 앱 진입점 ────────────────────────────────────────────────

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let settings = load_settings(app.handle());

            // 완전 자동 무설정 묵시적 백그라운드 업데이트 프로세스
            let app_clone = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = app_clone.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        log::info!("배경 자동 업데이트 발견: {}", update.version);
                        match update.download_and_install(|_, _| {}, || {}).await {
                            Ok(_) => {
                                log::info!("자동 업데이트 완료, 앱을 재시작합니다.");
                                app_clone.restart();
                            }
                            Err(e) => {
                                log::error!("자동 업데이트 실패: {}", e);
                            }
                        }
                    }
                }
            });

            // 자동 실행이 활성화되어 있으면 레지스트리 항목을 재등록하여
            // --autostart 플래그가 포함되도록 합니다.
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart = app.autolaunch();
                if settings.autostart {
                    let _ = autostart.disable();
                    let _ = autostart.enable();
                }
            }

            let state = Arc::new(OdreState {
                settings: Mutex::new(settings),
                history: Mutex::new(vec![]),
                pending: Mutex::new(HashMap::new()),
            });

            app.manage(state.clone());

            let show_i = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            start_watcher(app.handle().clone(), state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_history,
            clear_history,
            organize_now,
            dissolve_folders,
            migrate_sorted_folders,
            reset_settings,
            minimize_window,
            close_window,
            exit_app,
            select_folder,
            show_main_window,
            check_for_updates_manual,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 실패");
}