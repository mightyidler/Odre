/* ── UI 윈도우 버튼 제어 ── */
document.getElementById('btnMinimize')?.addEventListener('click', () => tauriBridge.invoke('minimize_window'));
document.getElementById('btnClose')?.addEventListener('click', () => tauriBridge.invoke('close_window'));

/* ── TAB BAR ── */
const tabBar  = document.getElementById('tabBar');
const thumb   = document.getElementById('tabThumb');
const tabs    = [...tabBar.querySelectorAll('.tab-btn')];
let activeIdx = 0;

function moveThumb(idx, animate) {
  const tab = tabs[idx];
  if (!animate) {
    thumb.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => { thumb.style.transition = ''; }));
  }
  thumb.style.transform = `translateX(${tab.offsetLeft - 4}px)`;
  thumb.style.width = tab.offsetWidth + 'px';
}
tabs.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    if (idx === activeIdx) return;

    tabs[activeIdx].classList.remove('is-active');
    document.getElementById('panel-' + tabs[activeIdx].dataset.tab).classList.remove('is-active');
    
    activeIdx = idx;
    btn.classList.add('is-active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('is-active');
    moveThumb(idx, true);

    if (btn.dataset.tab === 'rules') {
      document.querySelectorAll('#rulesList .rule-item').forEach(item => {
        if (item._initThumb) item._initThumb();
      });
    }
  });
});
window.addEventListener('load',   () => moveThumb(0, false));
window.addEventListener('resize', () => moveThumb(activeIdx, false));

/* ── THEME (OS 동기화 및 실시간 감지) ── */
let currentThemeMode = 'system'; // 'system' | 'dark' | 'light'
let isDark = document.documentElement.getAttribute('data-theme') === 'dark';

function updateThemeUI() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.documentElement.style.backgroundColor = isDark ? '#000000' : '#F2F2F7';
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');
  if (iconSun && iconMoon) {
    iconSun.style.display  = isDark ? '' : 'none';
    iconMoon.style.display = isDark ? 'none' : '';
  }
  setTimeout(() => moveThumb(activeIdx, false), 30);
}

// 윈도우 OS 테마 변경 감지
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  // 🌟 핵심 수정: 사용자가 직접 테마를 고정(dark/light)했다면 OS 변경을 무시합니다.
  if (currentThemeMode === 'system') {
    isDark = e.matches;
    updateThemeUI();
  }
});

// 헤더의 해/달 버튼 클릭 시 (수동 고정 모드로 전환)
document.getElementById('themeBtn')?.addEventListener('click', async () => {
  isDark = !isDark;
  currentThemeMode = isDark ? 'dark' : 'light'; // 수동 모드로 고정
  updateThemeUI();
  
  // 드롭다운 UI 텍스트도 업데이트
  updateThemeDropdownUI(currentThemeMode);
  
  if (typeof tauriBridge !== 'undefined') {
    await tauriBridge.saveSettings({ theme: currentThemeMode });
  }
});

// 테마 드롭다운 UI 글자 맞추기 함수
function updateThemeDropdownUI(mode) {
  const themeMenu = document.getElementById('dd-theme-menu');
  if (themeMenu) {
    themeMenu.querySelectorAll('.dropdown-item').forEach(item => { 
      item.classList.toggle('is-selected', item.dataset.val === mode); 
    });
    const t = i18n[currentLang] || i18n['한국어'];
    const themeValEl = document.getElementById('dd-theme-val');
    if (themeValEl) themeValEl.textContent = t[`theme_${mode}`] || t.theme_system;
  }
}

/* ── DROPDOWN ── */
let openDD = null;
function toggleDD(id) {
  if (openDD && openDD !== id) closeAllDD();
  const wrap = document.getElementById(id);
  const menu = document.getElementById(id + '-menu');
  const open = !wrap.classList.contains('is-open');
  if (open) {
    const trigger = wrap.querySelector('.dropdown-trigger');
    const r = trigger.getBoundingClientRect();
    const app = document.querySelector('.app');
    const appR = app.getBoundingClientRect();
    const right = window.innerWidth - appR.right + 20;

    const itemCount = menu.querySelectorAll('.dropdown-item').length;
    const menuHeight = itemCount * 42 + 8;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const opensUp = spaceBelow < menuHeight && r.top > menuHeight;

    menu.classList.toggle('opens-up', opensUp);
    menu.style.left  = 'auto';
    menu.style.right = right + 'px';

    if (opensUp) {
      menu.style.top    = 'auto';
      menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    } else {
      menu.style.top    = (r.bottom + 8) + 'px';
      menu.style.bottom = 'auto';
    }
  }
  wrap.classList.toggle('is-open', open);
  menu.classList.toggle('is-open', open);
  document.getElementById('overlay').classList.toggle('is-open', open);
  openDD = open ? id : null;
}
function closeAllDD() {
  document.querySelectorAll('.dropdown-wrap.is-open').forEach(w => {
    w.classList.remove('is-open');
    w.querySelector('.dropdown-menu').classList.remove('is-open');
  });
  document.getElementById('overlay').classList.remove('is-open');
  openDD = null;
}

let scrollTimeout = null;
function handleScroll() {
  if (openDD) closeAllDD();
  if (!document.body.classList.contains('is-scrolling')) {
    document.body.classList.add('is-scrolling');
  }
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    document.body.classList.remove('is-scrolling');
  }, 150);
}

document.querySelectorAll('.tab-panel').forEach(panel => {
  panel.addEventListener('scroll', handleScroll, { passive: true });
});
window.addEventListener('scroll', handleScroll, { passive: true });

const i18n = {
  '한국어': {
    autoClean: '자동 정리', autoCleanDesc: '백그라운드에서 실시간으로 모니터링하며 폴더의 질서를 유지합니다.',
    cleanNow: '지금 정리하기', dissolve: '폴더 해체',
    watchFolder: '모니터링 폴더', addFolder: '폴더 추가',
    saveLocation: '저장 위치', sortInWatch: '모니터링 폴더 내 분류',
    sortInWatchDesc: '비활성화 시 모든 파일을 지정된 다른 폴더로 이동하여 분류합니다.',
    unset: '미설정', select: '선택',
    actionSettings: '동작 설정', moveDelay: '이동 지연', duplicate: '중복 파일',
    autoRun: 'Windows 시작 시 자동 실행', autoRunDesc: '시스템 시작 시 자동으로 실행되어 실시간 정리를 시작합니다.',
    language: '언어 및 테마', displayLang: '언어',
    reset: '설정 초기화', quit: 'Odre 종료',
    general: '일반', folderRules: '폴더 규칙', addFolderRule: '폴더 추가',
    unsaved: '변경사항이 있어요', cancel: '취소', apply: '적용',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: '확장자 입력 (예: mp4)',
    filenamePlaceholder: '파일명 입력 (예: invoice)',
    extLabel: '확장자', filenameLabel: '파일명', status: '상태',
    delay_instant: '즉시', delay_30s: '30초', delay_1m: '1분', delay_5m: '5분', delay_10m: '10분',
    dup_number: '번호 추가(권장)', dup_overwrite: '덮어쓰기', dup_skip: '건너뛰기',
    folderName: '폴더 이름', newFolder: '새 폴더',
    theme: '테마', theme_system: '시스템 설정', theme_dark: '다크 모드', theme_light: '라이트 모드',
  },
  'English': {
    autoClean: 'Auto-Organize', autoCleanDesc: 'Runs in the background and keeps your folders tidy in real time.',
    cleanNow: 'Organize Now', dissolve: 'Remove',
    watchFolder: 'Monitored Folders', addFolder: 'Add Folder',
    saveLocation: 'Save Location', sortInWatch: 'Sort into Monitored Folder',
    sortInWatchDesc: 'When off, all files are moved to a separate designated folder.',
    unset: 'Not Set', select: 'Select',
    actionSettings: 'Behavior', moveDelay: 'Move Delay', duplicate: 'Duplicates',
    autoRun: 'Launch at Windows Startup', autoRunDesc: 'Starts automatically at login and begins organizing right away.',
    language: 'Language & Theme', displayLang: 'Display Language',
    reset: 'Reset Settings', quit: 'Quit Odre',
    general: 'General', folderRules: 'Folder Rules', addFolderRule: 'Add Rule',
    unsaved: 'You have unsaved changes', cancel: 'Cancel', apply: 'Apply',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: 'e.g. mp4, pdf',
    filenamePlaceholder: 'e.g. invoice, report',
    extLabel: 'Extension', filenameLabel: 'Filename', status: 'Status',
    delay_instant: 'Immediately', delay_30s: '30 sec', delay_1m: '1 min', delay_5m: '5 min', delay_10m: '10 min',
    dup_number: 'Add Number Suffix (Recommended)', dup_overwrite: 'Overwrite', dup_skip: 'Skip',
    folderName: 'Folder Name', newFolder: 'New Folder',
    theme: 'Theme', theme_system: 'System Default', theme_dark: 'Dark Mode', theme_light: 'Light Mode',
  },
  '中文': {
    autoClean: '自动整理', autoCleanDesc: '在后台实时运行，自动保持文件夹井然有序。',
    cleanNow: '立即整理', dissolve: '取消管理',
    watchFolder: '管理文件夹', addFolder: '添加文件夹',
    saveLocation: '保存位置', sortInWatch: '在管理文件夹内整理',
    sortInWatchDesc: '关闭后，所有文件将移动到指定的其他文件夹进行整理。',
    unset: '未设置', select: '选择',
    actionSettings: '操作设置', moveDelay: '移动延迟', duplicate: '重复文件',
    autoRun: 'Windows 启动时自动运行', autoRunDesc: '系统启动时自动运行，立即开始实时整理。',
    language: '语言与主题', displayLang: '显示语言',
    reset: '重置设置', quit: '退出 Odre',
    general: '常规', folderRules: '文件夹规则', addFolderRule: '添加规则',
    unsaved: '有未保存的更改', cancel: '取消', apply: '应用',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: '如：mp4、pdf',
    filenamePlaceholder: '如：invoice、report',
    extLabel: '扩展名', filenameLabel: '文件名', status: '状态',
    delay_instant: '立即', delay_30s: '30秒', delay_1m: '1分钟', delay_5m: '5分钟', delay_10m: '10分钟',
    dup_number: '添加编号（推荐）', dup_overwrite: '覆盖', dup_skip: '跳过',
    folderName: '文件夹名称', newFolder: '新建文件夹',
    theme: '主题', theme_system: '系统设置', theme_dark: '深色模式', theme_light: '浅色模式',
  },
  '日本語': {
    autoClean: '自動整理', autoCleanDesc: 'バックグラウンドでリアルタイムに確認して、フォルダを常に整った状態に保ちます。',
    cleanNow: '今すぐ整理', dissolve: '管理を解除',
    watchFolder: '対象フォルダ', addFolder: 'フォルダを追加',
    saveLocation: '保存先', sortInWatch: '対象フォルダ内で整理',
    sortInWatchDesc: 'オフにすると、すべてのファイルを別の指定フォルダへ移動して整理します。',
    unset: '未設定', select: '選択',
    actionSettings: '動作設定', moveDelay: '移動の遅延', duplicate: '重複ファイル',
    autoRun: 'Windows起動時に自動実行', autoRunDesc: 'ログイン時に自動で起動し、リアルタイム整理をすぐに開始します。',
    language: '言語とテーマ', displayLang: '表示言語',
    reset: '設定をリセット', quit: 'Odreを終了',
    general: '一般', folderRules: 'フォルダルール', addFolderRule: 'ルールを追加',
    unsaved: '未保存の変更があります', cancel: 'キャンセル', apply: '適用',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: '例: mp4、pdf',
    filenamePlaceholder: '例: invoice、report',
    extLabel: '拡張子', filenameLabel: 'ファイル名', status: '状態',
    delay_instant: '即時', delay_30s: '30秒', delay_1m: '1分', delay_5m: '5分', delay_10m: '10分',
    dup_number: '番号を付けて保存（推奨）', dup_overwrite: '上書き', dup_skip: 'スキップ',
    folderName: 'フォルダ名', newFolder: '新しいフォルダ',
    theme: 'テーマ', theme_system: 'システム設定', theme_dark: 'ダークモード', theme_light: 'ライトモード',
  },
  'Français': {
    autoClean: 'Organisation auto', autoCleanDesc: 'Surveille en arrière-plan et maintient vos dossiers organisés en temps réel.',
    cleanNow: 'Organiser maintenant', dissolve: 'Supprimer',
    watchFolder: 'Dossiers gérés', addFolder: 'Ajouter un dossier',
    saveLocation: 'Emplacement', sortInWatch: 'Trier dans le dossier géré',
    sortInWatchDesc: 'Si désactivé, tous les fichiers sont déplacés vers un dossier désigné.',
    unset: 'Non défini', select: 'Choisir',
    actionSettings: 'Comportement', moveDelay: 'Délai de déplacement', duplicate: 'Doublons',
    autoRun: 'Démarrer avec Windows', autoRunDesc: 'Démarre automatiquement à la connexion et commence l\'organisation immédiatement.',
    language: 'Langue et Thème', displayLang: 'Langue d\'affichage',
    reset: 'Réinitialiser', quit: 'Quitter Odre',
    general: 'Général', folderRules: 'Règles', addFolderRule: 'Ajouter une règle',
    unsaved: 'Des modifications sont en attente', cancel: 'Annuler', apply: 'Appliquer',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: 'ex. mp4, pdf',
    filenamePlaceholder: 'ex. facture, rapport',
    extLabel: 'Extension', filenameLabel: 'Nom de fichier', status: 'État',
    delay_instant: 'Immédiatement', delay_30s: '30 sec', delay_1m: '1 min', delay_5m: '5 min', delay_10m: '10 min',
    dup_number: 'Ajouter un numéro (Recommandé)', dup_overwrite: 'Écraser', dup_skip: 'Ignorer',
    folderName: 'Nom du dossier', newFolder: 'Nouveau dossier',
    theme: 'Thème', theme_system: 'Système', theme_dark: 'Mode sombre', theme_light: 'Mode clair',
  },
  'Español': {
    autoClean: 'Organización auto', autoCleanDesc: 'Supervisa en segundo plano y mantiene tus carpetas ordenadas en tiempo real.',
    cleanNow: 'Organizar ahora', dissolve: 'Eliminar',
    watchFolder: 'Carpetas administradas', addFolder: 'Añadir carpeta',
    saveLocation: 'Destino', sortInWatch: 'Organizar dentro de la carpeta administrada',
    sortInWatchDesc: 'Si está desactivado, todos los archivos se mueven a una carpeta designada.',
    unset: 'No definido', select: 'Seleccionar',
    actionSettings: 'Comportamiento', moveDelay: 'Retraso de movimiento', duplicate: 'Duplicados',
    autoRun: 'Iniciar con Windows', autoRunDesc: 'Se inicia automáticamente al arrancar y comienza a organizar de inmediato.',
    language: 'Idioma y Tema', displayLang: 'Idioma de visualización',
    reset: 'Restablecer ajustes', quit: 'Salir de Odre',
    general: 'General', folderRules: 'Reglas de carpetas', addFolderRule: 'Añadir regla',
    unsaved: 'Hay cambios sin guardar', cancel: 'Cancelar', apply: 'Aplicar',
    tagline: 'Make Folder Sexy Again',
    extPlaceholder: 'ej. mp4, pdf',
    filenamePlaceholder: 'ej. factura, informe',
    extLabel: 'Extensión', filenameLabel: 'Nombre de archivo', status: 'Estado',
    delay_instant: 'De inmediato', delay_30s: '30 seg', delay_1m: '1 min', delay_5m: '5 min', delay_10m: '10 min',
    dup_number: 'Agregar número (Recomendado)', dup_overwrite: 'Sobrescribir', dup_skip: 'Omitir',
    folderName: 'Nombre de carpeta', newFolder: 'Nueva carpeta',
    theme: 'Tema', theme_system: 'Sistema', theme_dark: 'Modo oscuro', theme_light: 'Modo claro',
  }
};

function applyLang(lang) {
  currentLang = lang;
  const t = i18n[lang] || i18n['English'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-key]').forEach(el => {
    const key = el.dataset.i18nKey;
    if (t[key] !== undefined) {
      if (el.classList.contains('dropdown-item')) {
        const svg = el.querySelector('svg');
        el.textContent = t[key];
        if (svg) el.appendChild(svg);
      } else {
        el.textContent = t[key];
      }
    }
  });
  const addRuleBtn = document.getElementById('addRuleBtn');
  if (addRuleBtn) addRuleBtn.innerHTML = `<svg width="20" height="20"><use href="icons.svg#icon-plus"></use></svg> ${t.addFolderRule}`;
  
  const addFolderBtn = document.querySelector('.add-folder-btn');
  if (addFolderBtn) addFolderBtn.innerHTML = `<svg width="20" height="20"><use href="icons.svg#icon-plus"></use></svg> ${t.addFolder}`;
  
  const tagline = document.querySelector('.logo-tagline');
  if (tagline) tagline.textContent = t.tagline;

  document.querySelectorAll('.dropdown-item[data-i18n-key]').forEach(item => {
    const key = item.dataset.i18nKey;
    if (t[key]) {
      const svg = item.querySelector('svg');
      item.textContent = t[key];
      if (svg) item.appendChild(svg);
    }
  });
  ['dd-delay', 'dd-dup'].forEach(ddId => {
    const selected = document.querySelector(`#${ddId}-menu .dropdown-item.is-selected`);
    const valEl = document.getElementById(`${ddId}-val`);
    if (selected && valEl) {
      const key = selected.dataset.i18nKey;
      if (t[key]) valEl.textContent = t[key];
    }
  });
  document.querySelectorAll('.rule-item').forEach(item => {
    item.querySelectorAll('.switch-btn').forEach(btn => {
      btn.textContent = btn.dataset.mode === 'filename' ? t.filenameLabel : t.extLabel;
    });
    const nameInp = item.querySelector('.rule-name-input');
    if (nameInp) nameInp.placeholder = t.folderName || '폴더 이름';
    const inp = item.querySelector('.rule-text-input');
    const activeMode = item.querySelector('.switch-btn.is-active')?.dataset.mode;
    if (inp && activeMode) inp.placeholder = activeMode === 'filename' ? t.filenamePlaceholder : t.extPlaceholder;
    if (item._initThumb) item._initThumb();
    item.querySelectorAll('.tag-type-label').forEach(label => {
      const isFilename = label.closest('.ext-tag') &&
        label.closest('.ext-tag').querySelector('.ext-tag__remove')?.dataset.type === 'pattern';
      label.textContent = isFilename ? t.filenameLabel : t.extLabel;
    });
  });
}

document.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', async () => { // 👈 여기 async 추가!
    const dd = item.dataset.dd;
    document.getElementById(dd + '-menu').querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('is-selected'));
    item.classList.add('is-selected');
    
    const key = item.dataset.i18nKey;
    const t = i18n[currentLang] || i18n['English'];
    const displayVal = (key && t[key]) ? t[key] : item.dataset.val;
    document.getElementById(dd + '-val').textContent = displayVal;
    
    if (dd === 'dd-lang') { 
      currentLang = item.dataset.val; 
      applyLang(item.dataset.val); 
    }
    
    if (dd === 'dd-theme') {
      currentThemeMode = item.dataset.val;
      
      if (currentThemeMode === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = (currentThemeMode === 'dark');
      }
      
      updateThemeUI();
      if (typeof tauriBridge !== 'undefined') {
        // 이제 async가 붙어서 여기서 에러가 나지 않습니다.
        await tauriBridge.saveSettings({ theme: currentThemeMode });
      }
    }

    // 설정 변경 즉시 저장 (지연시간, 중복결정 등)
    if (dd === 'dd-delay' || dd === 'dd-dup') {
      if (typeof tauriBridge !== 'undefined') {
        await tauriBridge.saveSettings();
      }
    }
    closeAllDD();
  });
});

document.getElementById('sortToggle').addEventListener('change', function() {
  document.getElementById('destWrap').classList.toggle('is-hidden', this.checked);
});

const defaultRules = [
  { id:1, name:'Video',    exts:['mp4','mov','avi','mkv','wmv'], patterns:[] },
  { id:2, name:'Image',    exts:['jpg','jpeg','png','gif','webp','heic','jfif','bmp','svg'], patterns:[] },
  { id:3, name:'Document', exts:['pdf','docx','xlsx','pptx','txt','md','csv','hwp'], patterns:['_report','invoice'] },
  { id:4, name:'Audio',    exts:['mp3','wav','flac','aac','m4a','ogg'], patterns:[] },
  { id:5, name:'Archive',  exts:['zip','rar','7z','tar','gz','alz','egg'], patterns:[] },
  { id:6, name:'Code',     exts:['html','css','js','ts','jsx','tsx','json','py','java','c','cpp','cs','rs','go','php'], patterns:[] },
  { id:7, name:'Design',   exts:['psd','ai','fig','xd','sketch'], patterns:[] },
];
let savedRules = JSON.parse(JSON.stringify(defaultRules));
let rules = JSON.parse(JSON.stringify(defaultRules));
let nextId = 8;
let hasChanges = false;
let currentLang = 'English';

function checkChanges() {
  // UI 전용 속성(_mode 등)을 제외하고 순수 데이터만 추출해서 비교
  const cleanRules = rules.map(r => ({ id: r.id, name: r.name, exts: r.exts, patterns: r.patterns }));
  const cleanSaved = savedRules.map(r => ({ id: r.id, name: r.name, exts: r.exts, patterns: r.patterns }));

  const isChanged = JSON.stringify(cleanRules) !== JSON.stringify(cleanSaved);
  const panel = document.getElementById('panel-rules');
  const changesBar = document.getElementById('changesBar');

  if (isChanged && !hasChanges) {
    hasChanges = true;
    changesBar.classList.add('is-visible');
    if (panel && panel.classList.contains('is-active')) {
      panel.style.paddingBottom = '100px';
    }
  } else if (!isChanged && hasChanges) {
    hasChanges = false;
    changesBar.classList.remove('is-visible');
    if (panel) panel.style.paddingBottom = '';
  }
}

function clearChanged() {
  hasChanges = false;
  document.getElementById('changesBar').classList.remove('is-visible');
  const panel = document.getElementById('panel-rules');
  const sy = panel.scrollTop;
  panel.style.paddingBottom = '';
  requestAnimationFrame(() => { if (panel.scrollTop !== sy) panel.scrollTop = sy; });
}

const xSvg = `<svg width="16" height="16"><use href="icons.svg#icon-close"></use></svg>`;

function renderRules() {
  const list = document.getElementById('rulesList');
  const prevH = list.offsetHeight;
  list.style.minHeight = prevH + 'px';
  list.innerHTML = '';
  rules.forEach((rule, idx) => {
    const item = mkRule(rule, idx);
    list.appendChild(item);
    item._initThumb();
  });
  list.style.minHeight = '';
  initDrag();
  if (currentLang && currentLang !== '한국어') applyLang(currentLang);
}

function mkRule(rule, idx) {
  const div = document.createElement('div');
  div.className = 'rule-item'; div.dataset.id = rule.id;

  function tagsHTML() {
    const t = i18n[currentLang] || i18n['한국어'];
    const extLabel      = t.extLabel      || '확장자';
    const filenameLabel = t.filenameLabel || '파일명';
    const allExts     = rules.flatMap(r => r.exts);
    const allPatterns = rules.flatMap(r => r.patterns);
    const dupExts     = new Set(allExts.filter((v, i, a) => a.indexOf(v) !== i));
    const dupPatterns = new Set(allPatterns.filter((v, i, a) => a.indexOf(v) !== i));

    const fnTags = rule.patterns.map(p => {
      const display = p.replace(/^\*|\*$/g, '');
      const isDup   = dupPatterns.has(p);
      return `<span class="ext-tag${isDup ? ' ext-tag--duplicate' : ''}">
        <span class="tag-type-label">${filenameLabel}</span>
        <span class="tag-value">${display}</span>
        <button class="ext-tag__remove" data-rid="${rule.id}" data-type="pattern" data-val="${p}">${xSvg}</button>
      </span>`;
    }).join('');

    const extTags = rule.exts.map(e => {
      const isDup = dupExts.has(e);
      return `<span class="ext-tag${isDup ? ' ext-tag--duplicate' : ''}">
        <span class="tag-type-label">${extLabel}</span>
        <span class="tag-value">.${e}</span>
        <button class="ext-tag__remove" data-rid="${rule.id}" data-type="ext" data-val="${e}">${xSvg}</button>
      </span>`;
    }).join('');

    return fnTags + extTags;
  }

  div.innerHTML = `
    <div class="rule-header">
      <div class="drag-handle"><svg width="20" height="20"><use href="icons.svg#icon-drag"></use></svg></div>
      <span class="rule-number">${String(idx+1).padStart(2,'0')}</span>
      <input class="rule-name-input" value="${rule.name}" placeholder="${(i18n[currentLang]||i18n['한국어']).folderName||'폴더 이름'}" spellcheck="false"/>
      <button class="rule-delete-btn">${xSvg}</button>
    </div>
    <div class="rule-input-row">
      <div class="input-type-switch">
        <div class="switch-thumb"></div>
        <button class="switch-btn ${rule._mode !== 'filename' ? 'is-active' : ''}" data-mode="ext">${(i18n[currentLang]||i18n['한국어']).extLabel}</button>
        <button class="switch-btn ${rule._mode === 'filename' ? 'is-active' : ''}" data-mode="filename">${(i18n[currentLang]||i18n['한국어']).filenameLabel}</button>
      </div>
      <input class="rule-text-input" placeholder="${rule._mode === 'filename' ? (i18n[currentLang]||i18n['한국어']).filenamePlaceholder : (i18n[currentLang]||i18n['한국어']).extPlaceholder}" spellcheck="false" maxlength="40"/>
      <button class="rule-input-add-btn" title="추가">
        <svg width="16" height="16"><use href="icons.svg#icon-plus"></use></svg>
      </button>
    </div>
    <div class="rule-tags" id="tags-${rule.id}">${tagsHTML()}</div>
  `;

  if (!rule._mode) rule._mode = 'ext';

  function moveSwitchThumb(btn, animate) {
    const thumb = div.querySelector('.switch-thumb');
    if (!thumb) return;
    if (!animate) thumb.style.transition = 'none';
    thumb.style.left  = btn.offsetLeft + 'px';
    thumb.style.width = btn.offsetWidth + 'px';
    if (!animate) {
      thumb.getBoundingClientRect(); 
      thumb.style.transition = '';
    }
  }

  div.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (rule._mode === btn.dataset.mode) return;
      div.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      rule._mode = btn.dataset.mode;
      moveSwitchThumb(btn, true);
      const inp = div.querySelector('.rule-text-input');
      const t2 = i18n[currentLang] || i18n['한국어'];
      inp.placeholder = rule._mode === 'filename' ? t2.filenamePlaceholder : t2.extPlaceholder;
      inp.value = '';
      div.querySelector('.rule-input-add-btn').classList.remove('is-visible');
      inp.focus();
    });
  });

  const textInput = div.querySelector('.rule-text-input');
  const addBtn = div.querySelector('.rule-input-add-btn');
  textInput.addEventListener('input', () => {
    addBtn.classList.toggle('is-visible', textInput.value.trim().length > 0);
  });

  function commitTag() {
    const raw = textInput.value.trim();
    if (!raw) return;
    const r = rules.find(r => r.id === rule.id);
    if (!r) return;
    if (rule._mode === 'filename') {
      const val = raw.startsWith('*') ? raw : `*${raw}*`;
      if (!r.patterns.includes(val)) { r.patterns.push(val); checkChanges(); }
    } else {
      const val = raw.replace(/^\./, '').toLowerCase();
      if (!r.exts.includes(val)) { r.exts.push(val); checkChanges(); }
    }
    renderRules();
  }

  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitTag(); }
    if (e.key === 'Escape') { textInput.value = ''; addBtn.classList.remove('is-visible'); }
  });
  addBtn.addEventListener('click', e => { e.stopPropagation(); commitTag(); });

  div.querySelectorAll('.ext-tag__remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const r = rules.find(r => r.id === +btn.dataset.rid); if (!r) return;
      if (btn.dataset.type === 'ext') r.exts = r.exts.filter(v => v !== btn.dataset.val);
      else r.patterns = r.patterns.filter(v => v !== btn.dataset.val);
      checkChanges();
      renderRules();
    });
  });

  div.querySelector('.rule-delete-btn').addEventListener('click', () => {
  const panel = document.getElementById('panel-rules');
  const prevScroll    = panel.scrollTop;
  const prevMaxScroll = panel.scrollHeight - panel.clientHeight;
  const wasAtBottom   = prevMaxScroll - prevScroll < 8;

  rules = rules.filter(r => r.id !== rule.id);
  checkChanges();
  renderRules();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const newMaxScroll = panel.scrollHeight - panel.clientHeight;
      if (wasAtBottom) smoothScrollTo(Math.max(0, newMaxScroll), 320);
      else if (prevScroll > newMaxScroll) smoothScrollTo(Math.max(0, newMaxScroll), 320);
    });
  });
});

  div.querySelector('.rule-name-input').addEventListener('change', e => {
    const r = rules.find(r => r.id === rule.id); if (r) { r.name = e.target.value; checkChanges(); }
  });

  div._initThumb = () => {
    const activeBtn = div.querySelector('.switch-btn.is-active');
    if (!activeBtn) return;
    const thumb = div.querySelector('.switch-thumb');
    thumb.style.transition = 'none';
    thumb.style.left  = activeBtn.offsetLeft + 'px';
    thumb.style.width = activeBtn.offsetWidth + 'px';
    thumb.style.opacity = '1';
    thumb.getBoundingClientRect();
    thumb.style.transition = '';
  };

  return div;
}

function initDrag() {
  const list = document.getElementById('rulesList');
  let pending=null, startX=0, startY=0;
  let dragging=null, clone=null, offsetY=0, currentBefore=null;
  let startIndex = -1;
  let activePanel = null;
  let isChecking = false;

  function onDown(e) {
    // 🌟 드래그 핸들뿐만 아니라 규칙 아이템 전체를 잡아 끌 수 있게 허용하되,
    // 입력창, 스위치, 삭제 버튼 등 실제 클릭해야 하는 인터랙트 요소들은 드래그에서 제외합니다.
    if (e.target.closest('input, button, .ext-tag__remove, .switch-btn, .input-type-switch')) {
      return; 
    }
    
    pending = e.currentTarget;
    startX = e.clientX; startY = e.clientY;
    document.addEventListener('pointermove', onPendingMove);
    document.addEventListener('pointerup', onPendingUp);
  }

  function onPendingMove(e) {
    if (!pending) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.sqrt(dx*dx + dy*dy) < 8) return;
    document.removeEventListener('pointermove', onPendingMove);
    document.removeEventListener('pointerup', onPendingUp);
    beginDrag(pending, e);
    pending = null;
  }
  function onPendingUp() {
    pending = null;
    document.removeEventListener('pointermove', onPendingMove);
    document.removeEventListener('pointerup', onPendingUp);
  }

  function beginDrag(item, e) {
    dragging = item;
    activePanel = item.closest('.tab-panel') || document.querySelector('.tab-panel.is-active');
    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    const items = Array.from(list.children).filter(el => el.classList.contains('rule-item'));
    startIndex = items.indexOf(item);

    clone = item.cloneNode(true);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const shadow = isDark
      ? '0 16px 40px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.40)'
      : '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)';
    const cloneBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-rule-item').trim();
    clone.style.cssText = [
      `position:fixed`, `left:${rect.left}px`, `top:${rect.top}px`, `width:${rect.width}px`, `margin:0`,
      `z-index:999`, `pointer-events:none`, `border-radius:20px`, `transform:scale(1.03)`, `box-shadow:${shadow}`,
      `opacity:1`, `background:${cloneBg}`, `transition:transform 0.22s cubic-bezier(0.34,1.3,0.64,1), box-shadow 0.22s ease`,
    ].join(';');
    document.body.appendChild(clone);

    item.classList.add('is-dragging-source');
    list.classList.add('is-dragging'); 

    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  let autoScrollRaf = null;
  let currentClientY = 0;

  function checkIntersections() {
    if (!clone || !dragging) {
      isChecking = false; return;
    }
    
    // 최적화: querySelectorAll 대신 children 기반 필터 사용
    const items = Array.from(list.children).filter(el => el.classList.contains('rule-item'));
    let newBefore = null;
    
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it === dragging) continue;
      const r = it.getBoundingClientRect();
      if (currentClientY < r.top + r.height / 2) { newBefore = it; break; }
    }

    if (newBefore !== currentBefore) {
      currentBefore = newBefore;
      const prevRects = new Map();
      items.forEach(it => { if (it !== dragging) prevRects.set(it, it.getBoundingClientRect().top); });

      if (newBefore) list.insertBefore(dragging, newBefore);
      else list.appendChild(dragging);

      items.forEach(it => {
        if (it === dragging || !prevRects.has(it)) return;
        const prev = prevRects.get(it);
        const next = it.getBoundingClientRect().top;
        const dy = prev - next;
        if (Math.abs(dy) < 1) return;
        it.style.transition = 'none';
        it.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          it.style.transition = 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)';
          it.style.transform = 'translateY(0)';
        });
      });
    }
    isChecking = false;
  }

  function doAutoScroll() {
    if (!dragging || !activePanel) return;
    const edge = 60;
    const speed = 14;
    let dy = 0;

    const r = activePanel.getBoundingClientRect();
    if (currentClientY < r.top + edge) dy = -speed;
    else if (currentClientY > r.bottom - edge) dy = speed;

    if (dy !== 0) {
      // 최적화: window.scrollBy가 아닌 해당 패널(규칙 리스트 컨테이너)의 스크롤 제어
      activePanel.scrollTop += dy;
      if (!isChecking) {
        isChecking = true;
        checkIntersections(); 
      }
    }
    autoScrollRaf = requestAnimationFrame(doAutoScroll);
  }

  function onMove(e) {
    if (!clone || !dragging) return;
    currentClientY = e.clientY;
    clone.style.top = (e.clientY - offsetY) + 'px';

    if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(doAutoScroll);

    if (!isChecking) {
      isChecking = true;
      requestAnimationFrame(checkIntersections);
    }
  }

  function onUp(e) {
    if (!dragging) return;
    if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }

    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.userSelect = '';

    const items = Array.from(list.children).filter(el => el.classList.contains('rule-item'));
    const endIndex = items.indexOf(dragging);

    clone.style.transition = 'opacity 0.18s ease';
    clone.style.opacity = '0';

    dragging.classList.remove('is-dragging-source');
    dragging.style.transition = 'none';
    dragging.style.opacity = '0';
    requestAnimationFrame(() => {
      dragging.style.transition = 'opacity 0.20s ease';
      dragging.style.opacity = '1';
    });

    setTimeout(() => {
      if (clone) { clone.remove(); clone = null; }
      list.classList.remove('is-dragging');

      const itemsFinal = Array.from(list.children).filter(el => el.classList.contains('rule-item'));
      const order = itemsFinal.map(el => +el.dataset.id);
      rules = order.map(id => rules.find(r => r.id === id));

      itemsFinal.forEach((el, i) => {
        const numEl = el.querySelector('.rule-number');
        if (numEl) numEl.textContent = String(i+1).padStart(2,'0');
      });

      const d = dragging; dragging = null; currentBefore = null; activePanel = null;
      if (d) { d.style.transition = ''; d.style.opacity = ''; }
      itemsFinal.forEach(it => { it.style.transition = ''; it.style.transform = ''; });
      
      if (startIndex !== -1 && startIndex !== endIndex) {
          checkChanges();
      }
    }, 220);
  }

  // 모든 자식 요소에게 이벤트를 주입
  const currentItems = Array.from(list.children).filter(el => el.classList.contains('rule-item'));
  currentItems.forEach(item => item.addEventListener('pointerdown', onDown));
}

let scrollAnimId = null;
function smoothScrollTo(targetY, duration) {
  duration = duration || 380;
  if (scrollAnimId) { cancelAnimationFrame(scrollAnimId); scrollAnimId = null; }
  
  // 현재 보고 있는 탭 패널을 찾아서 거기서 스크롤을 굴림
  const activePanel = document.querySelector('.tab-panel.is-active');
  if (!activePanel) return;

  const startY = activePanel.scrollTop;
  const diff   = targetY - startY;
  if (Math.abs(diff) < 1) return;
  
  let startTime = null;
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function step(now) {
    if (!startTime) startTime = now;
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    activePanel.scrollTo(0, startY + diff * ease(progress));
    if (progress < 1) { scrollAnimId = requestAnimationFrame(step); }
    else { scrollAnimId = null; }
  }
  scrollAnimId = requestAnimationFrame(step);
}

// 폴더 추가(addRuleBtn) 버튼 이벤트 
document.getElementById('addRuleBtn').addEventListener('click', () => {
  rules.push({ id: nextId++, name: '', exts: [], patterns: [] });
  
  const panel = document.getElementById('panel-rules');
  panel.style.paddingBottom = '100px'; 
  
  document.getElementById('changesBar').classList.add('is-visible');
  hasChanges = true;
  renderRules();

  requestAnimationFrame(() => {
    const targetScroll = panel.scrollHeight;
    panel.scrollTo({ top: targetScroll, behavior: 'smooth' });

    setTimeout(() => {
      const lastItem = document.querySelector('#rulesList .rule-item:last-child');
      if (lastItem) {
        const input = lastItem.querySelector('.rule-name-input');
        if (input) input.focus({ preventScroll: true });
      }
    }, 400); 
  });
});

renderRules();

// 취소(btnCancel) 버튼 이벤트
document.getElementById('btnCancel').addEventListener('click', () => {
  const panel = document.getElementById('panel-rules');
  const prevScroll = panel.scrollTop;
  
  rules = JSON.parse(JSON.stringify(savedRules));
  renderRules();

  panel.style.paddingBottom = '';
  document.getElementById('changesBar').classList.remove('is-visible');
  hasChanges = false;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const newMaxScroll = panel.scrollHeight - panel.clientHeight;
      if (prevScroll > newMaxScroll) smoothScrollTo(Math.max(0, newMaxScroll), 400);
    });
  });
});

// 적용 시 자동 정리 
document.getElementById('btnApply').addEventListener('click', async () => {
  savedRules = JSON.parse(JSON.stringify(rules));
  checkChanges(); // clearChanged() 대신 이걸 호출하면 알아서 띠가 사라짐
  await tauriBridge.saveSettings({ rules });
  await tauriBridge.invoke('organize_now');
});

/* ── Tauri 브릿지 ── */
const tauriBridge = (() => {
  const isTauri = typeof window.__TAURI__ !== 'undefined';
  async function invoke(cmd, args = {}) {
    if (!isTauri) return null;
    try { return await window.__TAURI__.core.invoke(cmd, args); } catch (e) { return null; }
  }
  async function saveSettings(partial = {}) {
    const delayMapValues = { 'delay_instant': 0, 'delay_30s': 30, 'delay_1m': 60, 'delay_5m': 300, 'delay_10m': 600 };
    const dupMapValues = { 'dup_number': 'number', 'dup_overwrite': 'overwrite', 'dup_skip': 'skip' };
    
    const selectedDelayItem = document.querySelector('#dd-delay-menu .dropdown-item.is-selected');
    const delayKey = selectedDelayItem ? selectedDelayItem.dataset.i18nKey : 'delay_instant';
    const parsedDelay = delayMapValues[delayKey] ?? 0;

    const selectedDupItem = document.querySelector('#dd-dup-menu .dropdown-item.is-selected');
    const dupKey = selectedDupItem ? selectedDupItem.dataset.i18nKey : 'dup_number';
    const parsedDup = dupMapValues[dupKey] ?? 'number';

    const settings = {
      watchFolders:     watchFolders,
      rules:            rules,
      enabled:          document.querySelector('#panel-general .toggle input')?.checked ?? true,
      sortInWatch:      document.getElementById('sortToggle')?.checked ?? true,
      destFolder:       destFolder || null,
      moveDelaySecs:    parsedDelay,
      duplicateAction:  parsedDup,
      language:         currentLang,
      autostart:        document.querySelector('[data-i18n="autoRun"]')?.closest('.card-row')?.querySelector('input')?.checked ?? false,
      theme:            currentThemeMode,
      ...partial,
    };
    await invoke('save_settings', { settings });
  }

  async function loadSettings() {
    const s = await invoke('get_settings');
    if (!s) return;

    watchFolders = s.watchFolders || [];
    renderWatchFolders();

    if (s.rules && s.rules.length > 0) {
      savedRules = JSON.parse(JSON.stringify(s.rules));
      rules = JSON.parse(JSON.stringify(s.rules));
      
      // 버그 수정: 불러온 데이터의 최고 ID 값을 찾아 nextId 업데이트
      nextId = Math.max(...rules.map(r => r.id)) + 1;
      
      renderRules();
    }
    const autoToggle = document.querySelector('#panel-general .toggle input');
    if (autoToggle) autoToggle.checked = s.enabled ?? false;

    const sortToggle = document.getElementById('sortToggle');
    if (sortToggle) {
      sortToggle.checked = s.sortInWatch ?? true;
      document.getElementById('destWrap').classList.toggle('is-hidden', sortToggle.checked);
    }
    if (s.destFolder) {
      destFolder = s.destFolder;
      const destPathEl = document.querySelector('#destWrap .folder-path');
      if (destPathEl) {
        destPathEl.textContent = s.destFolder;
        destPathEl.classList.remove('folder-path--muted');
        destPathEl.removeAttribute('data-i18n');
      }
    }

    const delayKeyMap = { 0: 'delay_instant', 30: 'delay_30s', 60: 'delay_1m', 300: 'delay_5m', 600: 'delay_10m' };
    const delayKey = delayKeyMap[s.moveDelaySecs] || 'delay_instant';
    const t = i18n[currentLang] || i18n['한국어'];
    const delayMenu = document.getElementById('dd-delay-menu');
    if (delayMenu) {
      delayMenu.querySelectorAll('.dropdown-item').forEach(item => { item.classList.toggle('is-selected', item.dataset.i18nKey === delayKey); });
      const delayValEl = document.getElementById('dd-delay-val');
      if (delayValEl) delayValEl.textContent = t[delayKey] || t.delay_instant;
    }

    const dupKeyMap = { number: 'dup_number', overwrite: 'dup_overwrite', skip: 'dup_skip' };
    const dupKey = dupKeyMap[s.duplicateAction] || 'dup_number';
    const dupMenu = document.getElementById('dd-dup-menu');
    if (dupMenu) {
      dupMenu.querySelectorAll('.dropdown-item').forEach(item => { item.classList.toggle('is-selected', item.dataset.i18nKey === dupKey); });
      const dupValEl = document.getElementById('dd-dup-val');
      if (dupValEl) dupValEl.textContent = t[dupKey] || t.dup_number;
    }

    const autoRunToggle = document.querySelector('[data-i18n="autoRun"]')?.closest('.card-row')?.querySelector('input');
    if (autoRunToggle) autoRunToggle.checked = s.autostart ?? false;

    let langToSet = s.language;
    if (!langToSet || langToSet === 'auto' || !i18n[langToSet]) {
      const osLang = navigator.language.toLowerCase();
      if (osLang.startsWith('ko')) langToSet = '한국어';
      else if (osLang.startsWith('zh')) langToSet = '中文';
      else if (osLang.startsWith('ja')) langToSet = '日本語';
      else if (osLang.startsWith('fr')) langToSet = 'Français';
      else if (osLang.startsWith('es')) langToSet = 'Español';
      else langToSet = 'English';
      
      if (s.language !== langToSet && typeof tauriBridge !== 'undefined') {
        tauriBridge.saveSettings({ language: langToSet });
      }
    }

    currentLang = langToSet;
    applyLang(langToSet);
    const langMenu = document.getElementById('dd-lang-menu');
    if (langMenu) {
      langMenu.querySelectorAll('.dropdown-item').forEach(item => { item.classList.toggle('is-selected', item.dataset.val === langToSet); });
      const langValEl = document.getElementById('dd-lang-val');
      if (langValEl) langValEl.textContent = langToSet;
    }
    if (s.theme) {
      currentThemeMode = s.theme; // 현재 모드 저장 (system/dark/light)
      
      if (currentThemeMode === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = (currentThemeMode === 'dark');
      }
      updateThemeUI();
      updateThemeDropdownUI(currentThemeMode);
    }
  }

  if (isTauri) window.__TAURI__.event.listen('file-moved', (event) => { console.log('파일 이동됨:', event.payload); });
  return { invoke, saveSettings, loadSettings };
})();

window.addEventListener('DOMContentLoaded', async () => { 
  await tauriBridge.loadSettings();  // 테마 및 세팅 완벽하게 로드
  renderWatchFolders(); 
  
  // 🌟 모든 세팅과 색상이 입혀진 뒤에 비로소 창을 짠! 하고 띄웁니다.
  await tauriBridge.invoke('show_main_window');
});

let watchFolders = [];
let destFolder = null;

function renderWatchFolders() {
  const card = document.querySelector('#panel-general .section-group:nth-child(2) .card');
  if (!card) return;

  const addBtn = card.querySelector('.add-folder-btn');
  card.querySelectorAll('.card-row--folder, .card-divider, .card-divider--full').forEach(el => el.remove());

  watchFolders.forEach((folder, idx) => {
    if (idx > 0) {
      const div = document.createElement('div');
      div.className = 'card-divider';
      card.insertBefore(div, addBtn);
    }
    const row = document.createElement('div');
    row.className = 'card-row card-row--folder';
    row.innerHTML = `
      <svg width="20" height="20" class="folder-icon" style="flex-shrink:0"><use href="icons.svg#icon-folder"></use></svg>
      <span class="folder-path">${folder}</span>
      <button class="remove-btn" data-idx="${idx}">
        <svg width="16" height="16"><use href="icons.svg#icon-close"></use></svg>
      </button>`;
    row.querySelector('.remove-btn').addEventListener('click', async () => {
      watchFolders.splice(idx, 1);
      renderWatchFolders();
      await tauriBridge.saveSettings({ watchFolders });
    });
    card.insertBefore(row, addBtn);
  });

  if (watchFolders.length > 0) {
    const div = document.createElement('div');
    div.className = 'card-divider--full';
    card.insertBefore(div, addBtn);
  }

  const dissolveBtn = document.querySelector('[data-i18n="dissolve"]');
  if (dissolveBtn) {
    if (watchFolders.length === 0) {
      dissolveBtn.disabled = true;
      dissolveBtn.style.opacity = '0.5';
      dissolveBtn.style.cursor = 'not-allowed';
    } else {
      dissolveBtn.disabled = false;
      dissolveBtn.style.opacity = '1';
      dissolveBtn.style.cursor = 'pointer';
    }
  }
}

document.querySelector('.add-folder-btn')?.addEventListener('click', async () => {
  // 원래 만들어두었던 Rust 백엔드의 안전한 폴더 선택기 호출
  const selected = await tauriBridge.invoke('select_folder');
  
  if (selected && !watchFolders.includes(selected)) {
    watchFolders.push(selected);
    renderWatchFolders();
    await tauriBridge.saveSettings({ watchFolders });
  }
});

document.querySelector('#destWrap .select-btn')?.addEventListener('click', async () => {
  // 동일하게 Rust 백엔드 폴더 선택기 호출
  const selected = await tauriBridge.invoke('select_folder');
  
  if (selected) {
    destFolder = selected;
    const pathEl = document.querySelector('#destWrap .folder-path');
    if (pathEl) {
      pathEl.textContent = selected;
      pathEl.classList.remove('folder-path--muted');
      pathEl.removeAttribute('data-i18n');
    }
    await tauriBridge.saveSettings({ destFolder });
    // sortInWatch가 꺼진 상태에서 대상 폴더를 선택하면 기존 정리 폴더들을 이동
    const sortToggle = document.getElementById('sortToggle');
    if (sortToggle && !sortToggle.checked) {
      await tauriBridge.invoke('migrate_sorted_folders', { toDest: true });
    }
  }
});

document.querySelector('[data-i18n="cleanNow"]')?.addEventListener('click', async () => {
  if (watchFolders.length === 0) {
    const selected = await tauriBridge.invoke('select_folder');
    if (selected && !watchFolders.includes(selected)) {
      watchFolders.push(selected);
      renderWatchFolders();
      await tauriBridge.saveSettings({ watchFolders });
    } else {
      return;
    }
  }
  const count = await tauriBridge.invoke('organize_now');
  if (count !== null) console.log(`${count}개 파일 정리 완료`);
});

document.querySelector('#panel-general .toggle input')?.addEventListener('change', async function() { 
  if (this.checked && watchFolders.length === 0) {
    this.checked = false;
    const selected = await tauriBridge.invoke('select_folder');
    if (selected && !watchFolders.includes(selected)) {
      watchFolders.push(selected);
      renderWatchFolders();
      await tauriBridge.saveSettings({ watchFolders });
      this.checked = true;
    } else {
      return;
    }
  }
  await tauriBridge.saveSettings({ enabled: this.checked }); 
  if (this.checked) {
    const count = await tauriBridge.invoke('organize_now');
    if (count > 0) console.log(`${count}개 파일 자동 정리 완료`);
  }
});

document.querySelector('[data-i18n="autoRun"]')?.closest('.card-row')?.querySelector('input')?.addEventListener('change', async function() { await tauriBridge.saveSettings({ autostart: this.checked }); });
document.getElementById('sortToggle')?.addEventListener('change', async function() {
  document.getElementById('destWrap').classList.toggle('is-hidden', this.checked);
  await tauriBridge.saveSettings({ sortInWatch: this.checked });
  if (this.checked) {
    // 모니터링 폴더 내 분류 활성화: 대상 폴더에서 모니터링 폴더로 복원
    await tauriBridge.invoke('migrate_sorted_folders', { toDest: false });
  } else if (destFolder) {
    // 모니터링 폴더 내 분류 비활성화 + 대상 폴더 존재: 모니터링 폴더에서 대상 폴더로 이동
    await tauriBridge.invoke('migrate_sorted_folders', { toDest: true });
  }
});

const origApplyLang = window.applyLang;
window.applyLang = async function(lang) {
  if (origApplyLang) origApplyLang.call(this, lang);
  await tauriBridge.saveSettings({ language: lang });
};

document.querySelector('[data-i18n="reset"]')?.addEventListener('click', async () => {
  if (confirm('모든 설정을 초기화하시겠습니까?')) { await tauriBridge.invoke('reset_settings'); location.reload(); }
});
document.querySelector('[data-i18n="quit"]')?.addEventListener('click', async () => {
  await tauriBridge.invoke('exit_app');
});

// 폴더 해체 버튼 이벤트
document.querySelector('[data-i18n="dissolve"]')?.addEventListener('click', async () => {
  if (watchFolders.length === 0) return;
  if (confirm('모든 정렬된 폴더를 해체하고 파일들을 원래 모니터링 폴더 위치로 되돌리시겠습니까?\n(자동 정리 기능이 비활성화됩니다)')) {
    const count = await tauriBridge.invoke('dissolve_folders');
    if (count !== null) {
      alert(`${count}개의 파일이 복구되었습니다.`);
      await tauriBridge.loadSettings(); 
    }
  }
});

// 폴더 규칙 필드 간 Tab 키 고속 이동 (중간 버튼들 스킵)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const active = document.activeElement;
    if (!active) return;
    
    if (active.classList.contains('rule-name-input') || active.classList.contains('rule-text-input')) {
      let allInputs = Array.from(document.querySelectorAll('.rule-name-input, .rule-text-input'));
      let idx = allInputs.indexOf(active);
      if (idx === -1) return;
      
      const isShift = e.shiftKey;
      let targetIdx = isShift ? idx - 1 : idx + 1;
      
      // 첫 항목에서 뒤로(Shift+Tab) 가면 맨 끝으로, 마지막에서 앞(Tab)으로 가면 맨 처음으로 무한 순환
      if (targetIdx < 0) targetIdx = allInputs.length - 1;
      else if (targetIdx >= allInputs.length) targetIdx = 0;

      // 만약 작성 중이던 텍스트(확장자/패턴)가 남아 있다면, Tab 키 누를 때 엔터친 것처럼 자동 커밋(적용)!
      if (active.classList.contains('rule-text-input') && active.value.trim().length > 0) {
        e.preventDefault();
        active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        
        // DOM이 새로 그려졌으므로, focus 할 최신 UI 목록을 다시 가져옴
        const newInputs = Array.from(document.querySelectorAll('.rule-name-input, .rule-text-input'));
        
        if (targetIdx >= newInputs.length) targetIdx = 0;
        
        if (targetIdx >= 0 && targetIdx < newInputs.length) {
          newInputs[targetIdx].focus();
        }
        return;
      }

      // 무한 순환 점프 적용
      e.preventDefault();
      allInputs[targetIdx].focus();
    }
  }
});

window.addEventListener('DOMContentLoaded', async () => { await tauriBridge.loadSettings(); renderWatchFolders(); });
