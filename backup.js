// ============================================================
//  backup.js — Storage & Sync Engine  |  LNXNhat System
//  Dán link Web App sau khi deploy Apps Script vào đây:
// ============================================================

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxsLlv0jKYRMrP0YSqQyAyVRhDdue7w0AkyJqFwZmz_s6dgL2ccHbFzjIaT6Dm0WDVq/exec";

window.localDatabase = [];   // Dữ liệu đã xử lý versioning (chỉ bản mới nhất)
window.rawDatabase   = [];   // Toàn bộ dữ liệu thô từ Sheet1
window.tagsDatabase  = [];   // Tags từ Sheet2

// ============================================================
//  SINH ID NGẪU NHIÊN (5 ký tự hồ sơ / 3 ký tự tag)
//  Đảm bảo không trùng với dữ liệu hiện có
// ============================================================
function generateID(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let isDuplicate = true;
    while (isDuplicate) {
        result = '';
        for (let i = 0; i < length; i++)
            result += chars.charAt(Math.floor(Math.random() * chars.length));

        if      (length === 5) isDuplicate = window.rawDatabase.some(r => r.id === result);
        else if (length === 3) isDuplicate = window.tagsDatabase.some(t => t.tagId === result);
        else                   isDuplicate = false;
    }
    return result;
}

// ============================================================
//  XỬ LÝ VERSIONING — gộp theo id, giữ bản fix cao nhất
//  Quy tắc:
//    status = ""      → bản gốc (fix-0 ảo)
//    status = "fix1"  → bản sửa lần 1
//    status = "fixN"  → bản sửa lần N  (N cao nhất thắng)
//    status chứa "remove" → ẩn toàn bộ hồ sơ
// ============================================================
function processRawData(rawRecords) {
    const grouped = {};
    rawRecords.forEach(row => {
        if (!row.id) return; // Bỏ hàng rỗng
        if (!grouped[row.id]) grouped[row.id] = [];
        grouped[row.id].push(row);
    });

    const activeRecords = [];
    for (const id in grouped) {
        const rows = grouped[id];
        let isRemoved = false;
        let maxFix    = -1;   // -1 nghĩa là chưa tìm thấy bất kỳ bản nào
        let latestRow = null;

        rows.forEach(r => {
            const status = (r.status || '').toString().trim().toLowerCase();

            if (status.includes('remove')) {
                isRemoved = true;
                return;
            }

            if (status.startsWith('fix')) {
                // "fix1" → 1 | "fix" → 0 | "fix12" → 12
                const fixNum = parseInt(status.replace('fix', ''), 10);
                const n = isNaN(fixNum) ? 0 : fixNum;
                if (n > maxFix) { maxFix = n; latestRow = r; }
            } else {
                // Bản gốc (status = "")
                // Chỉ dùng bản gốc nếu chưa tìm thấy bản fix nào
                if (maxFix === -1) { maxFix = 0; latestRow = r; }
            }
        });

        if (!isRemoved && latestRow) activeRecords.push(latestRow);
    }
    return activeRecords;
}

// ============================================================
//  TÍNH SỐ FIX TIẾP THEO cho một id (dùng khi chỉnh sửa)
// ============================================================
function getNextFixNumber(id) {
    const fixRows = window.rawDatabase.filter(r =>
        r.id === id && (r.status || '').toString().trim().toLowerCase().startsWith('fix')
    );
    if (fixRows.length === 0) return 1; // Lần đầu chỉnh sửa → fix1
    const maxFix = fixRows.reduce((max, r) => {
        const n = parseInt(r.status.replace('fix', ''), 10);
        return Math.max(max, isNaN(n) ? 0 : n);
    }, 0);
    return maxFix + 1;
}

// ============================================================
//  KHỞI TẠO — tải dữ liệu đệm từ localStorage, rồi sync Drive
// ============================================================
function initBackupSystem() {
    try {
        const savedRaw  = localStorage.getItem('lnxnhat_raw_backup');
        const savedTags = localStorage.getItem('lnxnhat_tags_backup');
        if (savedRaw)  {
            window.rawDatabase   = JSON.parse(savedRaw);
            window.localDatabase = processRawData(window.rawDatabase);
        }
        if (savedTags) window.tagsDatabase = JSON.parse(savedTags);
        console.log('[LNX] Đã tải dữ liệu đệm từ localStorage.');
    } catch (e) {
        console.error('[LNX] Lỗi đọc localStorage:', e);
    }
    syncFromDrive();
}

// ============================================================
//  SYNC GET — tải toàn bộ Sheet1 & Sheet2 về
// ============================================================
async function syncFromDrive() {
    if (!WEB_APP_URL || WEB_APP_URL.includes('YOUR_')) return;
    try {
        console.log('[LNX] Đang sync từ Google Sheets...');
        const res  = await fetch(WEB_APP_URL + '?t=' + Date.now()); // cache buster
        const data = await res.json();

        if (!data.success) {
            console.error('[LNX] Server lỗi:', data.error);
            return;
        }

        // ── Map mảng thô [A,B,C,...] → object có tên trường ──
        // KHÔNG slice(1) vì Sheet không có hàng tiêu đề!
        window.rawDatabase = (data.records || []).map(r => ({
            id:     (r[0] || '').toString().trim(),
            name:   (r[1] || '').toString(),
            class:  (r[2] || '').toString(),
            birth:  (r[3] || '').toString(),
            note:   (r[4] || '').toString(),
            sig:    (r[5] || '').toString(),
            status: (r[6] || '').toString(),
            relId:  (r[7] || '').toString()
        })).filter(r => r.id !== ''); // Lọc hàng rỗng

        window.tagsDatabase = (data.tags || []).map(r => ({
            tagName:  (r[0] || '').toString(),
            tagId:    (r[1] || '').toString(),
            tagColor: (r[2] || '#888888').toString()
        })).filter(t => t.tagId !== '');

        window.localDatabase = processRawData(window.rawDatabase);

        // Lưu đệm
        localStorage.setItem('lnxnhat_raw_backup',  JSON.stringify(window.rawDatabase));
        localStorage.setItem('lnxnhat_tags_backup', JSON.stringify(window.tagsDatabase));

        console.log('[LNX] Sync thành công —', window.localDatabase.length, 'hồ sơ,', window.tagsDatabase.length, 'tags.');
        if (typeof window.refreshUI === 'function') window.refreshUI();

    } catch (e) {
        console.warn('[LNX] Offline — dùng dữ liệu đệm cũ.', e.message);
    }
}

// ============================================================
//  SEND POST — gửi dữ liệu lên Apps Script
//  Cập nhật UI tạm thời ngay lập tức, sync Drive sau khi xong
// ============================================================
async function sendToDrive(payloadToSend) {
    console.log('[LNX] Gửi:', payloadToSend.action, payloadToSend.id || '');

    // ── Cập nhật local ngay để UI phản hồi tức thì ──────────
    // Lưu ý: sig lúc này là base64, sẽ được thay bằng URL Drive sau sync
    if (payloadToSend.action === 'ADD_RECORD') {
        // Tạo bản sao để lưu vào rawDatabase (dùng base64 tạm thời)
        const tempRecord = {
            id:     payloadToSend.id,
            name:   payloadToSend.name   || '',
            class:  payloadToSend.class  || '',
            birth:  payloadToSend.birth  || '',
            note:   payloadToSend.note   || '',
            sig:    payloadToSend.sig    || '',  // base64 tạm, Drive URL sau
            status: payloadToSend.status || '',
            relId:  payloadToSend.relId  || ''
        };
        window.rawDatabase.push(tempRecord);
        window.localDatabase = processRawData(window.rawDatabase);

    } else if (payloadToSend.action === 'REMOVE_RECORD') {
        window.rawDatabase.push({ id: payloadToSend.id, status: 'remove', name:'', class:'', birth:'', note:'', sig:'', relId:'' });
        window.localDatabase = processRawData(window.rawDatabase);

    } else if (payloadToSend.action === 'ADD_TAG') {
        window.tagsDatabase.push({
            tagName:  payloadToSend.tagName,
            tagId:    payloadToSend.tagId,
            tagColor: payloadToSend.tagColor
        });
    }
    if (typeof window.refreshUI === 'function') window.refreshUI();

    // ── Gửi lên server ──────────────────────────────────────
    try {
        const response = await fetch(WEB_APP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh CORS preflight
            body:    JSON.stringify(payloadToSend)
        });
        const result = await response.json();
        console.log('[LNX] Kết quả server:', result);

        if (result.success) {
            // Nếu server trả về sigUrl (Drive URL), cập nhật lại localDatabase
            if (result.sigUrl && payloadToSend.id) {
                const match = window.rawDatabase.find(
                    r => r.id === payloadToSend.id && r.sig === payloadToSend.sig
                );
                if (match) {
                    match.sig = result.sigUrl;
                    window.localDatabase = processRawData(window.rawDatabase);
                    localStorage.setItem('lnxnhat_raw_backup', JSON.stringify(window.rawDatabase));
                }
            }
            // Sync lại sau 3 giây để chắc chắn lấy đúng dữ liệu từ Drive
            setTimeout(syncFromDrive, 3000);
        } else {
            console.error('[LNX] Server từ chối:', result.error);
        }
    } catch (e) {
        console.error('[LNX] Lỗi kết nối Drive:', e.message);
        // Dữ liệu local vẫn còn, người dùng không mất gì cả
    }
}

// ============================================================
//  PATCH cho saveAdminEditChanges trong index.html
//  Xuất hàm getNextFixNumber ra global để index.html dùng được
// ============================================================
window.getNextFixNumber = getNextFixNumber;

initBackupSystem();
