// ============================================
// admin-questions.js  — Bible Battle Admin
// ============================================
import { db, currentAdmin, esc, toast, showConfirm }
  from './admin-core.js';
import { collection, doc, query, orderBy, getDocs, addDoc,
         updateDoc, deleteDoc, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let _questions = [];

export async function loadQuestions() {
  const tbody = document.getElementById('questions-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--mu);padding:24px">Loading…</td></tr>';
  try {
    const snap = await getDocs(query(collection(db,'questions'), orderBy('createdAt','desc')));
    _questions = [];
    snap.forEach(d => _questions.push({ id: d.id, ...d.data() }));
    const cnt = document.getElementById('q-count');
    if (cnt) cnt.textContent = `(${_questions.length})`;
    renderQuestions(_questions);
  } catch(e) { toast('Failed to load questions: ' + e.message, 'err'); }
}

export function filterQuestions() {
  const q   = document.getElementById('q-search').value.toLowerCase();
  const cat = document.getElementById('q-cat-filter').value;
  const dif = document.getElementById('q-diff-filter').value;
  renderQuestions(_questions.filter(item => {
    const m = !q || (item.question||'').toLowerCase().includes(q);
    return m && (cat === 'all' || item.category === cat)
              && (dif === 'all' || item.difficulty === dif);
  }));
}

function renderQuestions(list) {
  const tbody = document.getElementById('questions-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="es"><i class="fas fa-question"></i>No questions found</div></td></tr>';
    return;
  }
  const dc = d => ({ easy:'bg-ok', medium:'bg-inf', hard:'bg-warn', expert:'bg-err' }[d] || 'bg-mu');
  tbody.innerHTML = list.map(q => `
    <tr>
      <td style="max-width:250px;color:var(--t);font-weight:600">
        ${esc((q.question||'').slice(0,65))}${(q.question||'').length > 65 ? '…' : ''}
      </td>
      <td><span class="badge bg-pr">${esc(q.category||'—')}</span></td>
      <td><span class="badge ${dc(q.difficulty)}">${esc(q.difficulty||'—')}</span></td>
      <td style="color:var(--mu);font-size:11px">${esc(q.verseReference||'—')}</td>
      <td>${q.isActive !== false
        ? '<span class="badge bg-ok">Active</span>'
        : '<span class="badge bg-mu">Inactive</span>'}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-gh btn-xs" onclick="window._adminQ.editQ('${q.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-err btn-xs" onclick="window._adminQ.deleteQ('${q.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

export function openAddQ() {
  document.getElementById('q-modal-title').textContent = 'Add Question';
  document.getElementById('q-edit-id').value = '';
  ['q-text','q-verse','q-explanation'].forEach(id => document.getElementById(id).value = '');
  ['q-category','q-difficulty'].forEach(id => document.getElementById(id).value = '');
  ['opt0','opt1','opt2','opt3'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('[name="copt"]').forEach(r => r.checked = false);
  document.getElementById('q-active').value = 'true';
  document.getElementById('q-err').textContent = '';
  document.getElementById('q-modal').classList.remove('hidden');
}

export function editQ(id) {
  const q = _questions.find(x => x.id === id);
  if (!q) return;
  document.getElementById('q-modal-title').textContent = 'Edit Question';
  document.getElementById('q-edit-id').value = id;
  document.getElementById('q-text').value = q.question || '';
  document.getElementById('q-category').value = q.category || '';
  document.getElementById('q-difficulty').value = q.difficulty || '';
  document.getElementById('q-verse').value = q.verseReference || '';
  document.getElementById('q-explanation').value = q.explanation || '';
  document.getElementById('q-active').value = String(q.isActive !== false);
  (q.options || []).forEach((o, i) => {
    const el = document.getElementById('opt' + i);
    if (el) el.value = o;
  });
  const r = document.querySelector(`[name="copt"][value="${q.correctAnswer}"]`);
  if (r) r.checked = true;
  document.getElementById('q-err').textContent = '';
  document.getElementById('q-modal').classList.remove('hidden');
}

export function closeQModal() {
  document.getElementById('q-modal').classList.add('hidden');
}

export async function saveQ() {
  const btn    = document.getElementById('q-save-btn');
  const errEl  = document.getElementById('q-err');
  const editId = document.getElementById('q-edit-id').value;
  const qText  = document.getElementById('q-text').value.trim();
  const cat    = document.getElementById('q-category').value;
  const diff   = document.getElementById('q-difficulty').value;
  const verse  = document.getElementById('q-verse').value.trim();
  const expl   = document.getElementById('q-explanation').value.trim();
  const active = document.getElementById('q-active').value === 'true';
  const opts   = ['opt0','opt1','opt2','opt3'].map(id => document.getElementById(id).value.trim());
  const corrEl = document.querySelector('[name="copt"]:checked');
  errEl.textContent = '';
  if (!qText)           return errEl.textContent = 'Question text is required.';
  if (!cat)             return errEl.textContent = 'Category is required.';
  if (!diff)            return errEl.textContent = 'Difficulty is required.';
  if (opts.some(o=>!o)) return errEl.textContent = 'All 4 options are required.';
  if (!corrEl)          return errEl.textContent = 'Select the correct answer.';
  const data = {
    question: qText, category: cat, difficulty: diff,
    options: opts, correctAnswer: parseInt(corrEl.value),
    verseReference: verse, explanation: expl,
    isActive: active, updatedAt: serverTimestamp()
  };
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
  try {
    if (editId) {
      await updateDoc(doc(db,'questions',editId), data);
      toast('Question updated!', 'ok');
    } else {
      await addDoc(collection(db,'questions'), {
        ...data, createdAt: serverTimestamp(), createdBy: currentAdmin?.uid || 'admin'
      });
      toast('Question added!', 'ok');
    }
    closeQModal();
    loadQuestions();
  } catch(e) { errEl.textContent = 'Error: ' + e.message; }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Question';
  }
}

export function deleteQ(id) {
  showConfirm('🗑️','Delete Question','This question will be permanently deleted.', async () => {
    try {
      await deleteDoc(doc(db,'questions',id));
      toast('Question deleted', 'ok');
      loadQuestions();
    } catch(e) { toast('Failed: ' + e.message, 'err'); }
  });
}

window._adminQ = { openAddQ, editQ, closeQModal, saveQ, deleteQ };
