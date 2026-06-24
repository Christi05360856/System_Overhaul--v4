// ============================================
// admin-users.js  — Bible Battle Admin
// ============================================
import { db, esc, toast, showConfirm }
  from './admin-core.js';
import { collection, doc, query, orderBy, getDocs, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let _users = [];

export async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--mu);padding:24px">Loading…</td></tr>';
  try {
    const [uSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db,'users'), orderBy('createdAt','desc'))),
      getDocs(collection(db,'userStats'))
    ]);
    const sm = {};
    sSnap.forEach(d => sm[d.id] = d.data());
    _users = [];
    uSnap.forEach(d => _users.push({ id: d.id, ...d.data(), stats: sm[d.id] || {} }));
    const cnt = document.getElementById('users-count');
    if (cnt) cnt.textContent = `(${_users.length})`;
    renderUsers(_users);
  } catch(e) { toast('Failed to load users: ' + e.message, 'err'); }
}

export function filterUsers() {
  const q = document.getElementById('users-search').value.toLowerCase();
  const f = document.getElementById('users-filter').value;
  renderUsers(_users.filter(u => {
    const m = !q
      || (u.displayName||'').toLowerCase().includes(q)
      || (u.email||'').toLowerCase().includes(q);
    const s = f === 'all'
      || (f === 'banned'     && u.isBanned)
      || (f === 'active'     && !u.isBanned && u.profileComplete)
      || (f === 'incomplete' && !u.profileComplete && !u.isBanned);
    return m && s;
  }));
}

function renderUsers(list) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="es"><i class="fas fa-users"></i>No users found</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => `
    <tr>
      <td style="color:var(--t);font-weight:700">${esc(u.displayName||'—')}</td>
      <td style="color:var(--mu)">${esc(u.email||'—')}</td>
      <td>${u.stats?.level || 1}</td>
      <td style="color:var(--warn);font-weight:700">${(u.stats?.totalXp||0).toLocaleString()}</td>
      <td>${u.stats?.currentStreak || 0} 🔥</td>
      <td>${u.stats?.quizzesTaken || 0}</td>
      <td>${u.isBanned
        ? '<span class="badge bg-err">Suspended</span>'
        : u.profileComplete
          ? '<span class="badge bg-ok">Active</span>'
          : '<span class="badge bg-warn">Incomplete</span>'}</td>
      <td>${!u.isBanned
        ? `<button class="btn btn-err btn-xs" onclick="window._adminUsers.toggleBan('${u.id}',true)"><i class="fas fa-ban"></i> Suspend</button>`
        : `<button class="btn btn-ok btn-xs"  onclick="window._adminUsers.toggleBan('${u.id}',false)"><i class="fas fa-check"></i> Restore</button>`
      }</td>
    </tr>`).join('');
}

export function toggleBan(uid, ban) {
  showConfirm(
    ban ? '🚫' : '✅',
    ban ? 'Suspend User' : 'Restore User',
    ban ? 'This user will lose access to play and earn XP.'
        : 'This user will regain full access.',
    async () => {
      try {
        await updateDoc(doc(db,'users',uid), { isBanned: ban });
        toast(ban ? 'User suspended' : 'User restored', ban ? 'warn' : 'ok');
        loadUsers();
      } catch(e) { toast('Failed: ' + e.message, 'err'); }
    }
  );
}

window._adminUsers = { toggleBan };
