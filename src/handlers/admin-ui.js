import { checkAuth, authResponse } from '../middleware/auth.js';
import { formatBytes } from '../utils/format.js';
import { getThemeStyles, getFooterHtml } from '../themes/styles.js';

export async function handleAdminUI(request, env, sys) {
  if (!checkAuth(request, env)) {
    return authResponse(sys.admin_title);
  }
  
  const url = new URL(request.url);
  const host = url.origin;
  
  // 获取所有服务器信息（按 sort_order 排序）
  const { results } = await env.DB.prepare(
    'SELECT id, name, last_updated, server_group, price, expire_date, bandwidth, traffic_limit, country, is_hidden, sort_order FROM servers ORDER BY sort_order ASC'
  ).all();
  
  const now = Date.now();
  
  // 生成服务器列表行
  let trs = '';
  if (results && results.length > 0) {
    for (const s of results) {
      const lastUpdated = new Date(s.last_updated).getTime();
      const isOnline = (now - lastUpdated) < 300000;
      const status = isOnline 
        ? '<span style="color:var(--accent-green); font-weight:bold;">● ONLINE</span>' 
        : '<span style="color:var(--accent-red); font-weight:bold;">● OFFLINE</span>';
      
      const cCode = (s.country || 'xx').toLowerCase();
      const flagHtml = cCode !== 'xx' 
        ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" style="vertical-align: middle; border-radius: 2px; filter: brightness(0.9);">` 
        : '🏳️';
      
      const cmdApp = "cur" + "l";
      const cmd = `${cmdApp} -sL ${host}/install.sh | bash -s install ${s.id} ${env.API_SECRET} ${host}/update 60`;
      
      trs += `
        <tr class="server-row" data-server-id="${s.id}">
          <td class="drag-handle" style="text-align:center; cursor:move; user-select:none;" title="拖拽排序">⋮⋮</td>
          <td style="text-align:center;"><input type="checkbox" class="server-checkbox" value="${s.id}"></td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              ${flagHtml}
              <a href="/?id=${s.id}" style="color:var(--text-primary); font-weight:bold; text-decoration:none; hover:text:var(--accent-green);">${s.name}</a>
            </div>
          </td>
          <td><span class="group-tag">${s.server_group || 'Default'}</span></td>
          <td><span class="price-tag">${s.price || '-'}</span></td>
          <td><span class="date-text">${s.expire_date || '-'}</span></td>
          <td><span class="spec-text">${s.bandwidth || '-'}</span></td>
          <td><span class="spec-text">${s.traffic_limit || '-'}</span></td>
          <td>${status}</td>
          <td>
            <div class="action-group">
              <div class="cmd-input-wrapper">
                <span class="cmd-prompt">$</span>
                <input type="text" readonly value="${cmd}" id="cmd-${s.id}" class="cmd-input">
              </div>
              <div class="action-btns">
                <button onclick="copyCmd('${s.id}')" class="btn btn-icon btn-green" title="复制命令">📋</button>
                <button onclick="openEditModal('${s.id}', '${s.server_group||''}', '${s.price||''}', '${s.expire_date||''}', '${s.bandwidth||''}', '${s.traffic_limit||''}', '${s.is_hidden||'0'}')" class="btn btn-icon btn-blue" title="编辑">✏️</button>
                <button onclick="deleteServer('${s.id}')" class="btn btn-icon btn-red" title="删除">🗑️</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }
  }
  const themeStyles = getThemeStyles(sys);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sys.admin_title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    
    :root {
      --bg-primary: #0a0e14;
      --bg-secondary: #12171f;
      --bg-card: #151b24;
      --bg-hover: #1a2230;
      --border-color: #1e2a3a;
      --border-active: #2a3a4f;
      --text-primary: #d3dae3;
      --text-secondary: #8999af;
      --text-muted: #5c6d82;
      --accent-green: #00d4aa;
      --accent-blue: #4da6ff;
      --accent-purple: #b392f0;
      --accent-pink: #f778ba;
      --accent-yellow: #ffb870;
      --accent-red: #f85149;
      --accent-cyan: #39d2c0;
      --terminal-font: 'JetBrains Mono', 'Courier New', monospace;
      --input-bg: #0d1117;
      --input-border: #21262d;
      --btn-hover: rgba(255,255,255,0.05);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body { 
      font-family: var(--terminal-font);
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
      position: relative;
      font-size: 13px;
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      );
      pointer-events: none;
      z-index: 9999;
    }
    
    .container { max-width: 1500px; margin: 0 auto; padding: 16px; position: relative; }
    
    /* 终端顶部栏 */
    .terminal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px 6px 0 0;
      margin-bottom: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .terminal-dots {
      display: flex;
      gap: 8px;
    }
    
    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    
    .terminal-dot.red { background: #ff5f56; }
    .terminal-dot.yellow { background: #ffbd2e; }
    .terminal-dot.green { background: #27c93f; }
    
    .terminal-title {
      color: var(--text-primary);
      font-weight: 600;
    }
    
    /* 主面板 */
    .main-panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-top: none;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    
    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--accent-green);
      text-shadow: 0 0 10px rgba(0, 212, 170, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .panel-title .prompt {
      color: var(--text-muted);
    }
    
    .header-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--border-color);
      background: var(--bg-card);
      color: var(--text-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--terminal-font);
      font-weight: 500;
      transition: all 0.2s;
      text-decoration: none;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-active);
    }
    
    .btn-primary {
      background: var(--accent-green);
      color: #000;
      border-color: var(--accent-green);
      font-weight: 600;
    }
    
    .btn-primary:hover {
      background: #00bf99;
    }
    
    .btn-icon {
      padding: 5px 8px;
      min-width: 32px;
      justify-content: center;
    }
    
    .btn-green:hover { border-color: var(--accent-green); color: var(--accent-green); }
    .btn-blue:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
    .btn-red:hover { border-color: var(--accent-red); color: var(--accent-red); }
    
    /* 统计卡片 */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1px;
      background: var(--border-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    
    .stat-card {
      background: var(--bg-card);
      padding: 16px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--accent-cyan);
      text-shadow: 0 0 8px rgba(57, 210, 192, 0.3);
    }
    
    .stat-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
    }
    
    /* 标签切换 */
    .tabs {
      display: flex;
      gap: 2px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 3px;
      margin-bottom: 20px;
      width: fit-content;
    }
    
    .tab-btn {
      padding: 8px 20px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--terminal-font);
      font-weight: 500;
      border-radius: 3px;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .tab-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .tab-btn.active {
      background: var(--accent-green);
      color: #000;
      font-weight: 600;
    }
    
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.2s ease; }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* 工具栏 */
    .toolbar {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      align-items: center;
    }
    
    .toolbar-input {
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: var(--terminal-font);
      font-size: 12px;
      width: 250px;
      transition: border-color 0.2s;
    }
    
    .toolbar-input:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(57, 210, 192, 0.1);
    }
    
    .toolbar-input::placeholder {
      color: var(--text-muted);
    }
    
    .toolbar-select {
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: var(--terminal-font);
      font-size: 12px;
      cursor: pointer;
    }
    
    .toolbar-select:focus {
      outline: none;
      border-color: var(--accent-cyan);
    }
    
    .batch-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    /* 提示框 */
    .alert {
      padding: 12px 16px;
      border: 1px solid;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .alert-info {
      background: rgba(57, 210, 192, 0.05);
      border-color: rgba(57, 210, 192, 0.2);
      color: var(--accent-cyan);
    }
    
    .alert .alert-icon {
      font-size: 14px;
    }
    
    /* 表格 */
    .table-wrapper {
      overflow-x: auto;
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }
    
    .terminal-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    .terminal-table th {
      background: var(--bg-card);
      padding: 10px 12px;
      text-align: left;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }
    
    .terminal-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color);
      vertical-align: middle;
    }
    
    .server-row:hover {
      background: var(--bg-hover);
    }
    
    .group-tag, .price-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .group-tag {
      background: rgba(77, 166, 255, 0.1);
      color: var(--accent-blue);
      border: 1px solid rgba(77, 166, 255, 0.2);
    }
    
    .price-tag {
      background: rgba(255, 184, 112, 0.1);
      color: var(--accent-yellow);
      border: 1px solid rgba(255, 184, 112, 0.2);
    }
    
    .date-text, .spec-text {
      color: var(--text-secondary);
      font-size: 11px;
    }
    
    .action-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .cmd-input-wrapper {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 4px 8px;
    }
    
    .cmd-prompt {
      color: var(--accent-green);
      font-weight: 700;
      font-size: 11px;
      flex-shrink: 0;
    }
    
    .cmd-input {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: var(--terminal-font);
      font-size: 10px;
      padding: 2px 4px;
      width: 100%;
      min-width: 180px;
    }
    
    .cmd-input:focus {
      outline: none;
    }
    
    .action-btns {
      display: flex;
      gap: 4px;
    }
    
    /* 设置面板 */
    .settings-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    @media (max-width: 768px) {
      .settings-grid { grid-template-columns: 1fr; }
    }
    
    .settings-section {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 16px;
    }
    
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-green);
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .form-group {
      margin-bottom: 14px;
    }
    
    .form-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .form-label .required {
      color: var(--accent-red);
    }
    
    .form-input {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: var(--terminal-font);
      font-size: 12px;
      transition: border-color 0.2s;
    }
    
    .form-input:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(57, 210, 192, 0.1);
    }
    
    .form-input::placeholder {
      color: var(--text-muted);
    }
    
    .form-select {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: var(--terminal-font);
      font-size: 12px;
      cursor: pointer;
    }
    
    .form-select:focus {
      outline: none;
      border-color: var(--accent-cyan);
    }
    
    .form-textarea {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: var(--terminal-font);
      font-size: 11px;
      resize: vertical;
      min-height: 80px;
      line-height: 1.5;
    }
    
    .form-textarea:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(57, 210, 192, 0.1);
    }
    
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .checkbox-item:hover {
      border-color: var(--border-active);
      background: var(--bg-hover);
    }
    
    .checkbox-item input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent-green);
      cursor: pointer;
    }
    
    .checkbox-item label {
      font-size: 12px;
      cursor: pointer;
      flex: 1;
    }
    
    .checkbox-item .checkbox-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(0, 212, 170, 0.1);
      color: var(--accent-green);
      font-weight: 600;
    }
    
    .highlight-box {
      background: rgba(255, 184, 112, 0.05);
      border-color: rgba(255, 184, 112, 0.3) !important;
    }
    
    /* 模态框 */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      animation: fadeIn 0.2s;
      backdrop-filter: blur(4px);
    }
    
    .modal-dialog {
      background: var(--bg-secondary);
      border: 1px solid var(--border-active);
      border-radius: 6px;
      width: 480px;
      max-width: 90%;
      margin: 60px auto;
      padding: 24px;
      position: relative;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .modal-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-green);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    
    .modal-close:hover {
      background: var(--bg-hover);
      color: var(--accent-red);
    }
    
    .modal-footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    
    /* 拖拽排序 */
    .server-row.dragging {
      opacity: 0.5;
      background: var(--accent-cyan) !important;
    }
    
    .server-row.drag-over {
      border-top: 2px solid var(--accent-green);
    }
    
    .drag-handle {
      color: var(--text-muted);
      font-size: 12px;
      letter-spacing: -2px;
    }
    
    .drag-handle:hover {
      color: var(--accent-cyan);
    }
    
    .drag-info {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 20px;
      background: var(--bg-card);
      border: 1px solid var(--accent-green);
      border-radius: 4px;
      color: var(--accent-green);
      font-size: 12px;
      z-index: 10000;
      animation: fadeIn 0.2s;
    }
    
    /* 文件上传按钮 */
    .upload-btn-wrapper {
      position: relative;
    }
    
    .upload-btn-wrapper input[type="file"] {
      position: absolute;
      left: 0;
      top: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    
    .bg-preview {
      max-height: 80px;
      border-radius: 4px;
      margin-top: 8px;
      border: 1px solid var(--border-color);
    }
    
    /* 滚动条 */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-active);
    }
    
    /* 空状态 */
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 13px;
    }
    
    .empty-state .empty-icon {
      font-size: 40px;
      display: block;
      margin-bottom: 12px;
      opacity: 0.5;
    }
    
    /* 响应式 */
    @media (max-width: 768px) {
      .container { padding: 8px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .toolbar { flex-direction: column; }
      .toolbar-input { width: 100%; }
    }
    /* 主题样式保留 */
    ${themeStyles}
  </style>
</head>
<body class="${sys.theme || 'theme1'}">
  <div class="container">
    <!-- 终端顶部栏 -->
    <div class="terminal-header">
      <div class="terminal-dots">
        <span class="terminal-dot red"></span>
        <span class="terminal-dot yellow"></span>
        <span class="terminal-dot green"></span>
      </div>
      <div class="terminal-title">
        ${sys.admin_title}
      </div>
      <div></div>
    </div>
    
    <!-- 主面板 -->
    <div class="main-panel">
      <div class="panel-header">
        <div class="panel-title">
          <span class="prompt">$</span> sudo systemctl status
        </div>
        <div class="header-actions">
          <button onclick="refreshStats()" class="btn">
            ↻ 刷新
          </button>
          <a href="/" class="btn">
            ▸ 监控面板
          </a>
        </div>
      </div>
      
      <!-- 统计卡片 -->
      <div class="stats-grid" id="stats-panel">
        <div class="stat-card">
          <div class="stat-value">${results.length}</div>
          <div class="stat-label">服务器总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-online">-</div>
          <div class="stat-label">在线</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-offline">-</div>
          <div class="stat-label">离线</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-avg-cpu">-</div>
          <div class="stat-label">平均CPU</div>
        </div>
      </div>
    </div>

    <!-- 第二个面板 -->
    <div class="main-panel">
      <!-- 标签切换 -->
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('servers')">▸ 服务器</button>
        <button class="tab-btn" onclick="switchTab('settings')">▸ 设置</button>
      </div>
      
      <!-- 服务器管理标签 -->
      <div id="tab-servers" class="tab-content active">
        <div class="alert alert-info">
          <span class="alert-icon">[i]</span>
          <span>点击 <strong>📋</strong> 复制安装命令，在目标服务器上执行，即可完成探针部署。后面跟一个上报间隔参数，单位为秒</span>
        </div>
        
        <div class="toolbar">
          <input type="text" id="newName" class="toolbar-input" placeholder="> 输入服务器名称...">
          <select id="newGroup" class="toolbar-select">
            <option value="Default">默认分组</option>
          </select>
          <button onclick="addServer()" class="btn btn-primary">
            + 添加服务器
          </button>
        </div>
        
        <div class="batch-actions">
          <button onclick="batchDelete()" class="btn btn-red">
            🗑 批量删除
          </button>
          <button onclick="selectAll()" class="btn">
            ☐ 全选/取消
          </button>
        </div>
        
        <div class="table-wrapper">
          <table class="terminal-table">
            <thead>
              <tr>
                <th style="width:35px; text-align:center;">↕️</th>
                <th style="width:30px;"><input type="checkbox" id="select-all" onchange="toggleSelectAll()" style="accent-color: var(--accent-green);"></th>
                <th>主机名</th>
                <th>分组</th>
                <th>价格</th>
                <th>到期时间</th>
                <th>带宽</th>
                <th>流量</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${trs || '<tr><td colspan="10" class="empty-state"><span class="empty-icon">📦</span> 暂无已配置服务器</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- 设置标签 -->
      <div id="tab-settings" class="tab-content">
        <div class="settings-grid">
          <!-- 外观设置 -->
          <div class="settings-section">
            <div class="section-title">
              <span>▸</span> 外观
            </div>
            
            <div class="form-group">
              <label class="form-label">主题 <span class="required">*</span></label>
              <select id="cfg_theme" class="form-select" onchange="toggleCustomCss()">
                <option value="theme1" ${sys.theme === 'theme1' ? 'selected' : ''}>[默认] 深色终端</option>
                <option value="theme2" ${sys.theme === 'theme2' ? 'selected' : ''}>[浅色] 浅色终端</option>
                <option value="theme6" ${sys.theme === 'theme6' ? 'selected' : ''}>[自定义] 自定义CSS</option>
              </select>
            </div>

            <div class="form-group" id="custom_css_group" style="display: ${sys.theme === 'theme6' ? 'block' : 'none'};">
              <label class="form-label">自定义CSS</label>
              <textarea id="cfg_custom_css" class="form-textarea" rows="5" placeholder="body.theme6 { background: #000; }">${sys.custom_css || ''}</textarea>
            </div>
            
            <div class="form-group">
              <label class="form-label">背景图片</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="cfg_custom_bg" class="form-input" value="${sys.custom_css || ''}" placeholder="https://..." style="flex:1;">
                <div class="upload-btn-wrapper">
                  <button class="btn" style="margin:0;">📁 上传</button>
                  <input type="file" id="bg_file" accept="image/*" onchange="uploadBg(this)">
                </div>
              </div>
              <img id="bg_preview" src="${sys.custom_bg || ''}" class="bg-preview" style="display:${sys.custom_bg ? 'block' : 'none'};">
            </div>
            
            <div class="form-group">
              <label class="form-label">站点标题</label>
              <input type="text" id="cfg_site_title" class="form-input" value="${sys.site_title}">
            </div>
            
            <div class="form-group">
              <label class="form-label">管理后台标题</label>
              <input type="text" id="cfg_admin_title" class="form-input" value="${sys.admin_title}">
            </div>
          </div>
          
          <!-- 功能设置 -->
          <div>
            <div class="settings-section" style="margin-bottom: 20px;">
              <div class="section-title">
                <span>▸</span> 显示选项
              </div>
              
              <div class="checkbox-item highlight-box">
                <input type="checkbox" id="cfg_auto_reset_traffic" ${sys.auto_reset_traffic === 'true' ? 'checked' : ''}>
                <label><b>月度流量重置</b><br><span style="font-size:10px;color:var(--text-muted);">每月1日自动重置，持久化存储</span></label>
                <span class="checkbox-badge">月度</span>
              </div>
              
              <div class="checkbox-item">
                <input type="checkbox" id="cfg_is_public" ${sys.is_public === 'true' ? 'checked' : ''}>
                <label><b>公开访问</b></label>
              </div>
              
              <div class="checkbox-item">
                <input type="checkbox" id="cfg_show_price" ${sys.show_price === 'true' ? 'checked' : ''}>
                <label>显示 <b>价格</b></label>
              </div>
              
              <div class="checkbox-item">
                <input type="checkbox" id="cfg_show_expire" ${sys.show_expire === 'true' ? 'checked' : ''}>
                <label>显示 <b>到期时间</b></label>
              </div>
              
              <div class="checkbox-item">
                <input type="checkbox" id="cfg_show_bw" ${sys.show_bw === 'true' ? 'checked' : ''}>
                <label>显示 <b>带宽</b></label>
              </div>
              
              <div class="checkbox-item">
                <input type="checkbox" id="cfg_show_tf" ${sys.show_tf === 'true' ? 'checked' : ''}>
                <label>显示 <b>流量配额</b></label>
              </div>
            </div>
            
            <div class="settings-section">
              <div class="section-title">
                <span>▸</span> 通知
              </div>
              
              <div class="form-group">
                <label class="form-label">离线告警</label>
                <select id="cfg_tg_notify" class="form-select">
                  <option value="false" ${sys.tg_notify !== 'true' ? 'selected' : ''}>[关闭] 禁用</option>
                  <option value="true" ${sys.tg_notify === 'true' ? 'selected' : ''}>[开启] 离线5分钟后通知</option>
                </select>
              </div>
              
              <div class="form-group">
                <label class="form-label">Telegram令牌 / 企业微信Webhook</label>
                <input type="password" id="cfg_tg_bot_token" class="form-input" value="${sys.tg_bot_token || ''}" placeholder="Bot令牌或Webhook地址">
              </div>
              
              <div class="form-group">
                <label class="form-label">聊天ID</label>
                <input type="password" id="cfg_tg_chat_id" class="form-input" value="${sys.tg_chat_id || ''}" placeholder="Telegram Chat ID（企业微信可选填）">
              </div>
            </div>
          </div>
        </div>
        
        <!-- 自定义注入 -->
        <div style="margin-top: 20px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 4px;">
          <div class="section-title" style="margin-bottom: 16px;">
            <span>▸</span> 自定义注入
          </div>
          
          <div class="form-group">
            <label class="form-label">自定义&lt;head&gt;</label>
            <textarea id="cfg_custom_head" class="form-textarea" rows="3" placeholder="<link rel='stylesheet' href='...'">${sys.custom_head || ''}</textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label">自定义脚本(底部)</label>
            <textarea id="cfg_custom_script" class="form-textarea" rows="4" placeholder="<script>console.log('Hello');</script>">${sys.custom_script || ''}</textarea>
          </div>
        </div>
        
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="saveSettings()" class="btn btn-primary" style="padding: 12px 24px; font-size: 14px;">
            💾 保存配置
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑模态框 -->
    <div id="editModal" class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">$ vim /etc/server.conf</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <input type="hidden" id="editId">
        
        <div class="form-group">
          <label class="form-label">分组名称</label>
          <input type="text" id="editGroup" class="form-input" placeholder="例如: 美国VPS">
        </div>
        
        <div class="form-group">
          <label class="form-label">价格</label>
          <input type="text" id="editPrice" class="form-input" placeholder="例如: ¥40/年">
        </div>
        
        <div class="form-group">
          <label class="form-label">到期日期</label>
          <input type="date" id="editExpire" class="form-input">
        </div>
        
        <div class="form-group">
          <label class="form-label">带宽</label>
          <input type="text" id="editBandwidth" class="form-input" placeholder="例如: 1Gbps">
        </div>
        
        <div class="form-group">
          <label class="form-label">流量限制</label>
          <input type="text" id="editTraffic" class="form-input" placeholder="例如: 1TB/月">
        </div>
        
        <div class="form-group">
          <div class="checkbox-item" style="margin:0;">
            <input type="checkbox" id="editHidden">
            <label>
              <b>对公众隐藏</b><br>
              <span style="font-size:10px;color:var(--text-muted);">隐藏后未登录用户无法在监控面板和详情页看到此服务器</span>
            </label>
          </div>
        </div>
        
        <div class="modal-footer">
          <button onclick="closeModal()" class="btn">取消</button>
          <button onclick="saveEdit()" class="btn btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>

    ${getFooterHtml()}

  <script>
    // Tab 切换
    function switchTab(tabName) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      
      event.target.classList.add('active');
      document.getElementById('tab-' + tabName).classList.add('active');
    }
    
    // 切换自定义 CSS 显示
    function toggleCustomCss() {
      const theme = document.getElementById('cfg_theme').value;
      document.getElementById('custom_css_group').style.display = theme === 'theme6' ? 'block' : 'none';
    }
    
    // 上传背景图片
    function uploadBg(input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 800 * 1024) {
        alert('[WARN] 图片大小超过800KB，建议使用外链URL');
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('cfg_custom_bg').value = e.target.result;
        const preview = document.getElementById('bg_preview');
        preview.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
    
    // 保存全局设置
    async function saveSettings() {
      const data = {
        action: 'save_settings',
        settings: {
          theme: document.getElementById('cfg_theme').value,
          custom_bg: document.getElementById('cfg_custom_bg').value,
          custom_css: document.getElementById('cfg_custom_css').value,
          custom_head: document.getElementById('cfg_custom_head').value,
          custom_script: document.getElementById('cfg_custom_script').value,
          site_title: document.getElementById('cfg_site_title').value,
          admin_title: document.getElementById('cfg_admin_title').value,
          is_public: document.getElementById('cfg_is_public').checked ? 'true' : 'false',
          auto_reset_traffic: document.getElementById('cfg_auto_reset_traffic').checked ? 'true' : 'false',
          show_price: document.getElementById('cfg_show_price').checked ? 'true' : 'false',
          show_expire: document.getElementById('cfg_show_expire').checked ? 'true' : 'false',
          show_bw: document.getElementById('cfg_show_bw').checked ? 'true' : 'false',
          show_tf: document.getElementById('cfg_show_tf').checked ? 'true' : 'false',
          tg_notify: document.getElementById('cfg_tg_notify').value,
          tg_bot_token: document.getElementById('cfg_tg_bot_token').value,
          tg_chat_id: document.getElementById('cfg_tg_chat_id').value
        }
      };
      
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(data) 
        });
        if (res.ok) { 
          alert('[OK] 配置已保存，正在重新加载...'); 
          location.reload(); 
        } else {
          const err = await res.json();
          alert('[ERROR] 保存失败: ' + (err.error || '未知错误'));
        }
      } catch(e) {
        alert('[ERROR] 保存失败: ' + e.message);
      }
    }
    
    // 添加服务器
    async function addServer() {
      const name = document.getElementById('newName').value.trim();
      if (!name) return alert('[WARN] 请输入服务器名称');
      
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ action: 'add', name }) 
        });
        if (res.ok) {
          const data = await res.json();
          alert('[OK] ' + (data.message || '服务器添加成功'));
          location.reload();
        } else {
          alert('[ERROR] 添加失败');
        }
      } catch(e) {
        alert('[ERROR] 添加失败: ' + e.message);
      }
    }
    
    // 删除服务器
    async function deleteServer(id) {
      if (!confirm('[?] 确定删除此服务器吗？此操作不可逆。')) return;
      
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ action: 'delete', id }) 
        });
        if (res.ok) location.reload(); 
        else alert('[ERROR] 删除失败');
      } catch(e) {
        alert('[ERROR] 删除失败: ' + e.message);
      }
    }
    
    // 批量删除
    async function batchDelete() {
      const checked = document.querySelectorAll('.server-checkbox:checked');
      if (checked.length === 0) return alert('[WARN] 请选择要删除的服务器');
      if (!confirm('[?] 确定删除选中的 ' + checked.length + ' 台服务器吗？此操作不可逆。')) return;
      
      const ids = Array.from(checked).map(cb => cb.value);
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ action: 'batch_delete', ids }) 
        });
        if (res.ok) location.reload(); 
        else alert('[ERROR] 批量删除失败');
      } catch(e) {
        alert('[ERROR] 批量删除失败: ' + e.message);
      }
    }
    
    // 全选/取消全选
    function toggleSelectAll() {
      const selectAll = document.getElementById('select-all');
      document.querySelectorAll('.server-checkbox').forEach(cb => {
        cb.checked = selectAll.checked;
      });
    }
    
    function selectAll() {
      const selectAllCheckbox = document.getElementById('select-all');
      selectAllCheckbox.checked = !selectAllCheckbox.checked;
      toggleSelectAll();
    }
    
    // 复制命令
    function copyCmd(id) {
      const input = document.getElementById('cmd-' + id);
      input.select(); 
      input.setSelectionRange(0, 99999);
      
      try {
        navigator.clipboard.writeText(input.value);
      } catch(e) {
        document.execCommand('copy');
      }
      
      const btn = event.target;
      const originalText = btn.innerText;
      btn.innerText = '✓';
      btn.style.color = 'var(--accent-green)';
      setTimeout(() => { 
        btn.innerText = originalText; 
        btn.style.color = '';
      }, 1500);
    }
    
    // 编辑弹窗
    function openEditModal(id, group, price, expire, bw, traffic, hidden) {
      document.getElementById('editId').value = id;
      document.getElementById('editGroup').value = group || 'Default';
      document.getElementById('editPrice').value = price || '';
      document.getElementById('editExpire').value = expire || '';
      document.getElementById('editBandwidth').value = bw || '';
      document.getElementById('editTraffic').value = traffic || '';
      document.getElementById('editHidden').checked = hidden === '1';
      document.getElementById('editModal').style.display = 'block';
    }
    
    function closeModal() { 
      document.getElementById('editModal').style.display = 'none'; 
    }
    
    async function saveEdit() {
      const data = {
        action: 'edit', 
        id: document.getElementById('editId').value,
        server_group: document.getElementById('editGroup').value,
        price: document.getElementById('editPrice').value,
        expire_date: document.getElementById('editExpire').value,
        bandwidth: document.getElementById('editBandwidth').value,
        traffic_limit: document.getElementById('editTraffic').value,
        is_hidden: document.getElementById('editHidden').checked ? '1' : '0'
      };
      
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(data) 
        });
        if (res.ok) {
          alert('[OK] 服务器已更新');
          location.reload();
        } else {
          alert('[ERROR] 保存失败');
        }
      } catch(e) {
        alert('[ERROR] 保存失败: ' + e.message);
      }
    }
    
    // 刷新统计
    async function refreshStats() {
      try {
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ action: 'get_stats' }) 
        });
        const data = await res.json();
        
        document.getElementById('stat-online').innerText = data.stats.online;
        document.getElementById('stat-offline').innerText = data.stats.offline;
        document.getElementById('stat-avg-cpu').innerText = data.stats.avg_cpu + '%';
        
        // 闪烁效果
        document.querySelectorAll('.stat-value').forEach(el => {
          el.style.transition = 'none';
          el.style.color = 'var(--accent-green)';
          setTimeout(() => {
            el.style.transition = 'color 0.5s';
            el.style.color = 'var(--accent-cyan)';
          }, 100);
        });
      } catch(e) {
        console.error('[ERROR] 刷新统计失败:', e);
      }
    }
    
    // 点击模态框外部关闭
    window.onclick = function(event) {
      if (event.target == document.getElementById('editModal')) {
        closeModal();
      }
    }
    
    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });
    
    // 拖拽排序功能
    let draggedRow = null;
    let dragInfoEl = null;
    
    function showDragInfo(text) {
      hideDragInfo();
      dragInfoEl = document.createElement('div');
      dragInfoEl.className = 'drag-info';
      dragInfoEl.textContent = text;
      document.body.appendChild(dragInfoEl);
    }
    
    function hideDragInfo() {
      if (dragInfoEl) {
        dragInfoEl.remove();
        dragInfoEl = null;
      }
    }
    
    function initDragSort() {
      const rows = document.querySelectorAll('.server-row');
      
      rows.forEach(row => {
        const handle = row.querySelector('.drag-handle');
        
        handle.addEventListener('mousedown', function(e) {
          row.setAttribute('draggable', 'true');
        });
        
        row.addEventListener('dragstart', function(e) {
          if (!e.target.hasAttribute('draggable')) {
            e.preventDefault();
            return;
          }
          draggedRow = this;
          this.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          showDragInfo('[i] 拖拽中... 松开保存排序');
        });
        
        row.addEventListener('dragend', function() {
          this.classList.remove('dragging');
          this.removeAttribute('draggable');
          document.querySelectorAll('.server-row').forEach(r => r.classList.remove('drag-over'));
          draggedRow = null;
          hideDragInfo();
        });
        
        row.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });
        
        row.addEventListener('dragenter', function(e) {
          e.preventDefault();
          if (draggedRow && draggedRow !== this) {
            this.classList.add('drag-over');
          }
        });
        
        row.addEventListener('dragleave', function(e) {
          this.classList.remove('drag-over');
        });
        
        row.addEventListener('drop', async function(e) {
          e.preventDefault();
          this.classList.remove('drag-over');
          
          if (!draggedRow || draggedRow === this) return;
          
          const tbody = this.parentElement;
          const rows = Array.from(tbody.querySelectorAll('.server-row'));
          const draggedIndex = rows.indexOf(draggedRow);
          const targetIndex = rows.indexOf(this);
          
          if (draggedIndex < targetIndex) {
            this.parentNode.insertBefore(draggedRow, this.nextSibling);
          } else {
            this.parentNode.insertBefore(draggedRow, this);
          }
          
          await saveOrder();
        });
      });
    }
    
    async function saveOrder() {
      const rows = document.querySelectorAll('.server-row');
      const orders = Array.from(rows).map(row => row.dataset.serverId);
      
      try {
        showDragInfo('[⌛] 保存排序中...');
        const res = await fetch('/admin/api', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ action: 'save_order', orders }) 
        });
        
        if (res.ok) {
          showDragInfo('[✓] 排序已保存');
          setTimeout(hideDragInfo, 1500);
        } else {
          alert('[ERROR] 保存排序失败');
          hideDragInfo();
        }
      } catch(e) {
        alert('[ERROR] 保存排序失败: ' + e.message);
        hideDragInfo();
      }
    }
    
    // 初始加载统计
    refreshStats();
    initDragSort();
    
    console.log('[BOOT] Admin panel initialized');
    console.log('[INFO] Servers: ' + ${results.length});
  </script>
</body>
</html>`;

  return new Response(html, { 
    headers: { 'Content-Type': 'text/html;charset=UTF-8' } 
  });
}