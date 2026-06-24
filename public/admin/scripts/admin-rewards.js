// ============================================
// admin-rewards.js  — Bible Battle Admin
// CORRECTED — matches HTML IDs and CSS vars
// ============================================
import { db, currentAdmin, fmtDate, esc, toast, showConfirm }
  from './admin-core.js';
import { collection, doc, query, orderBy, getDocs, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let _rewards = [];

export async function loadRewards() {
  const tbody = document.getElementById('rewards-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:24px">Loading…</td></tr>';
  try {
    const snap = await getDocs(query(collection(db,'rewardClaims'), orderBy('createdAt','desc')));
    _rewards = [];
    snap.forEach(d => _rewards.push({ id: d.id, ...d.data() }));
    renderRewards(_rewards);
  } catch(e) { toast('Failed to load rewards: ' + e.message, 'err'); }
}

export function filterRewards() {
  const q = document.getElementById('rewards-search').value.toLowerCase();
  const f = document.getElementById('rewards-filter').value;
  renderRewards(_rewards.filter(r => {
    const m = !q || (r.displayName||'').toLowerCase().includes(q) || (r.phoneNumber||'').includes(q);
    return m && (f === 'all' || r.status === f);
  }));
}

function renderRewards(list) {
  const tbody = document.getElementById('rewards-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-gift"></i>No reward claims yet</div></td></tr>';
    return;
  }
  const sb = s => ({
    pending:   '<span class="badge badge-amber">Pending</span>',
    approved:  '<span class="badge badge-blue">Approved</span>',
    delivered: '<span class="badge badge-green">Delivered</span>',
    rejected:  '<span class="badge badge-red">Rejected</span>'
  }[s] || `<span class="badge badge-muted">${esc(s)}</span>`);

  tbody.innerHTML = list.map(r => `
    <tr>
      <td style="color:var(--text);font-weight:700">${esc(r.displayName||'—')}</td>
      <td class="td-mono">${esc(r.phoneNumber||'—')}</td>
      <td>${esc(r.networkProvider||'—')}</td>
      <td style="color:var(--amber);font-weight:800">${esc(r.rewardType||'—')}</td>
      <td>${esc(r.type||'—')}</td>
      <td>${sb(r.status)}</td>
      <td style="color:var(--text-3)">${fmtDate(r.createdAt)}</td>
      <td>
        <div class="row-actions">
          ${r.status==='pending'
            ? `<button class="btn btn-success btn-sm"  onclick="window._adminRewards.updateReward('${r.id}','approved')">Approve</button>
               <button class="btn btn-danger btn-sm" onclick="window._adminRewards.updateReward('${r.id}','rejected')">Reject</button>`
            : ''}
          ${r.status==='approved'
            ? `<button class="btn btn-primary btn-sm"  onclick="window._adminRewards.updateReward('${r.id}','delivered')">Delivered</button>`
            : ''}
        </div>
      </td>
    </tr>`).join('');
}

export async function updateReward(id, status) {
  const L = { approved:'Approve', rejected:'Reject', delivered:'Mark Delivered' };
  showConfirm('🎁', `${L[status]} Reward`, `Mark this claim as "${status}"?`, async () => {
    try {
      await updateDoc(doc(db,'rewardClaims',id), {
        status,
        processedBy: currentAdmin?.uid || 'admin',
        processedAt: serverTimestamp()
      });
      toast(`Claim marked as ${status}`, 'ok');
      loadRewards();
    } catch(e) { toast('Failed: ' + e.message, 'err'); }
  });
}

window._adminRewards = { updateReward };
