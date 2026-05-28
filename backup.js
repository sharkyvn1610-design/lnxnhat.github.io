// ============================================================
//  backup.js — Storage & Sync Engine  |  LNXNhat System v3
//  Thay YOUR_WEB_APP_URL bằng link deploy của bạn:
// ============================================================
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbws_2ZwBOouGnLd0FxGDi6f0bUsNrV_YcB1Y8fjp_eu_RMJGfJDxoD7wkJI4ApoX456/exec";

window.localDatabase = [];
window.rawDatabase   = [];
window.tagsDatabase  = [];

// ── Sinh ID không trùng ──────────────────────────────────────
function generateID(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '', dup = true;
  while (dup) {
    result = '';
    for (let i = 0; i < length; i++)
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    if      (length === 5) dup = window.rawDatabase.some(r => r.id === result);
    else if (length === 3) dup = window.tagsDatabase.some(t => t.tagId === result);
    else                   dup = false;
  }
  return result;
}

// ── Xử lý versioning: giữ bản fix số cao nhất ───────────────
function processRawData(rawRecords) {
  const grouped = {};
  rawRecords.forEach(row => {
    if (!row.id) return;
    if (!grouped[row.id]) grouped[row.id] = [];
    grouped[row.id].push(row);
  });

  const active = [];
  for (const id in grouped) {
    const rows = grouped[id];
    let removed = false, maxFix = -1, latest = null;

    rows.forEach(r => {
      const st = (r.status || '').toString().trim().toLowerCase();
      if (st.includes('remove')) { removed = true; return; }
      if (st.startsWith('fix')) {
        const n = parseInt(st.replace('fix', ''), 10);
        const num = isNaN(n) ? 0 : n;
        if (num > maxFix) { maxFix = num; latest = r; }
      } else {
        if (maxFix === -1) { maxFix = 0; latest = r; }
      }
    });

    if (!removed && latest) active.push(latest);
  }
  return active;
}

// ── Tính số fix tiếp theo (fix1→fix2→...) ───────────────────
function getNextFixNumber(id) {
  const rows = window.rawDatabase.filter(r =>
    r.id === id && (r.status || '').toString().trim().toLowerCase().startsWith('fix')
  );
  if (!rows.length) return 1;
  const max = rows.reduce((m, r) => {
    const n = parseInt(r.status.replace('fix', ''), 10);
    return Math.max(m, isNaN(n) ? 0 : n);
  }, 0);
  return max + 1;
}
window.getNextFixNumber = getNextFixNumber;

// ── Khởi tạo: đọc cache → sync Drive ────────────────────────
function initBackupSystem() {
  try {
    const raw  = localStorage.getItem('lnxnhat_raw_backup');
    const tags = localStorage.getItem('lnxnhat_tags_backup');
    if (raw)  { window.rawDatabase = JSON.parse(raw); window.localDatabase = processRawData(window.rawDatabase); }
    if (tags) window.tagsDatabase = JSON.parse(tags);
  } catch(e) { console.error('[LNX] localStorage lỗi:', e); }
  syncFromDrive();
}

// ── GET: kéo toàn bộ Sheet1 + Sheet2 về ─────────────────────
async function syncFromDrive() {
  if (!WEB_APP_URL || WEB_APP_URL.includes('YOUR_')) return;
  try {
    const res  = await fetch(WEB_APP_URL + '?t=' + Date.now());
    const data = await res.json();
    if (!data.success) { console.error('[LNX]', data.error); return; }

    // KHÔNG slice(1) vì Sheet không có header!
    window.rawDatabase = (data.records || []).map(r => ({
      id:        (r[0] || '').toString().trim(),
      name:      (r[1] || '').toString(),
      class:     (r[2] || '').toString(),
      birth:     (r[3] || '').toString(),
      note:      (r[4] || '').toString(),
      sig:       (r[5] || '').toString(),
      status:    (r[6] || '').toString(),
      relId:     (r[7] || '').toString(),
      timestamp: (r[8] || '').toString()
    })).filter(r => r.id !== '');

    window.tagsDatabase = (data.tags || []).map(r => ({
      tagName:  (r[0] || '').toString(),
      tagId:    (r[1] || '').toString(),
      tagColor: (r[2] || '#888').toString()
    })).filter(t => t.tagId !== '');

    window.localDatabase = processRawData(window.rawDatabase);

    localStorage.setItem('lnxnhat_raw_backup',  JSON.stringify(window.rawDatabase));
    localStorage.setItem('lnxnhat_tags_backup', JSON.stringify(window.tagsDatabase));

    console.log('[LNX] Sync OK —', window.localDatabase.length, 'hồ sơ,', window.tagsDatabase.length, 'tags');
    if (typeof window.refreshUI === 'function') window.refreshUI();
  } catch(e) {
    console.warn('[LNX] Offline — dùng cache.', e.message);
  }
}

// ── POST: gửi dữ liệu lên Sheet ─────────────────────────────
// Trả về { success, error? } để caller hiển thị trạng thái
async function sendToDrive(payload) {
  // Cập nhật UI lạc quan ngay lập tức
  if (payload.action === 'ADD_RECORD') {
    const temp = { id:'', name:'', class:'', birth:'', note:'', sig:'', status:'', relId:'', timestamp:'', ...payload };
    window.rawDatabase.push(temp);
    window.localDatabase = processRawData(window.rawDatabase);
  } else if (payload.action === 'REMOVE_RECORD') {
    window.rawDatabase.push({ id: payload.id, status: 'remove', name:'', class:'', birth:'', note:'', sig:'', relId:'', timestamp:'' });
    window.localDatabase = processRawData(window.rawDatabase);
  } else if (payload.action === 'ADD_TAG') {
    window.tagsDatabase.push({ tagName: payload.tagName, tagId: payload.tagId, tagColor: payload.tagColor });
  }
  if (typeof window.refreshUI === 'function') window.refreshUI();

  try {
    const res    = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      // Cập nhật sigUrl về Drive URL thay vì base64
      if (result.sigUrl && payload.id) {
        const match = window.rawDatabase.find(r => r.id === payload.id && r.sig === payload.sig);
        if (match) {
          match.sig = result.sigUrl;
          window.localDatabase = processRawData(window.rawDatabase);
          localStorage.setItem('lnxnhat_raw_backup', JSON.stringify(window.rawDatabase));
        }
      }
      setTimeout(syncFromDrive, 3000);
      return { success: true };
    } else {
      console.error('[LNX] Server từ chối:', result.error);
      return { success: false, error: result.error };
    }
  } catch(e) {
    console.error('[LNX] Lỗi mạng:', e.message);
    return { success: false, error: e.message };
  }
}

initBackupSystem();
