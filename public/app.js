const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let cfg;

function addMember(m = {}) {
  const node = $('#memberTpl').content.firstElementChild.cloneNode(true);
  node.querySelector('.name').value = m.name || '';
  node.querySelector('.cravings').value = m.cravings || '';
  node.querySelector('.liked').value = m.likedPlaces || '';
  node.querySelectorAll('.diet input').forEach(cb => (cb.checked = (m.dietary || []).includes(cb.value)));
  node.querySelector('.x').onclick = () => node.remove();
  $('#members').appendChild(node);
}

function readForm() {
  return {
    courtId: $('#court').value, day: $('#day').value, endTime: $('#endTime').value,
    radiusM: +$('#radius').value, budgetMax: $('#budget').value ? +$('#budget').value : null,
    members: [...document.querySelectorAll('.member')].map(n => ({
      name: n.querySelector('.name').value.trim(), cravings: n.querySelector('.cravings').value,
      likedPlaces: n.querySelector('.liked').value,
      dietary: [...n.querySelectorAll('.diet input:checked')].map(c => c.value),
    })).filter(m => m.name),
  };
}

const price = p => (p ? '$'.repeat(p) : '');
const km = m => (m == null ? '' : `${(m / 1000).toFixed(1)} km`);

function render(r) {
  $('#empty').hidden = true; $('#results').hidden = false;
  $('#stats').textContent = `${r.stats.qlooCalls} Qloo calls · ${r.stats.iterations} search round${r.stats.iterations > 1 ? 's' : ''} · ${r.stats.ms} ms`;
  $('#cards').innerHTML = r.results.length ? r.results.map((v, i) => `
    <article class="card ${i === 0 ? 'top1' : ''}">
      <div class="score"><b>${Math.round(v.score * 100)}</b>group fit</div>
      <h3><span class="rank">#${i + 1}</span>${esc(v.name)}</h3>
      <div class="meta">${esc([km(v.distanceM), price(v.priceLevel), v.rating ? `★ ${v.rating}` : '', v.address].filter(Boolean).join(' · '))}</div>
      <div class="chips">${v.tags.slice(0, 5).map(t => `<span class="chip">${esc(t)}</span>`).join('')}
        ${Object.entries(v.check.status || {}).map(([n, st]) => st === 'ok' ? `<span class="chip ok">✓ ${esc(n.replace('_', '-'))}</span>` : `<span class="chip warn">${esc(n.replace('_', '-'))}? verify</span>`).join('')}
      </div>
      <div class="players">${Object.entries(v.memberAffinities).map(([n, a]) => `<div class="pl"><b><span>${esc(n)}</span><span>${Math.round(a * 100)}%</span></b><div class="bar"><i style="width:${Math.round(a * 100)}%"></i></div></div>`).join('')}</div>
      ${v.pitch ? `<div class="pitch">“${esc(v.pitch)}”</div>` : ''}
      <div class="why">${esc(v.why)}</div>
    </article>`).join('') : '<p>No spot fits everyone. Check the rejected list and loosen a constraint.</p>';
  $('#rejected').innerHTML = r.rejected.length ? `<b>Ruled out</b><ul>${r.rejected.map(x => `<li>${esc(x.name)}: ${esc(x.reasons.join(', '))}</li>`).join('')}</ul>` : '';
  $('#trace').innerHTML = r.trace.map(t => `<li><span class="k ${t.kind}">${t.kind}</span><div>${esc(t.title)}${detail(t.detail)}</div></li>`).join('');
  drawMap(r);
}

function detail(d) {
  if (!d) return '';
  const bits = [];
  if (d.mapping?.length) bits.push(d.mapping.map(m => `${m.from} → ${m.tag || m.entity}`).join(' · '));
  if (d.top?.length) bits.push(d.top.join(' · '));
  if (d.rejectedSample?.length) bits.push(d.rejectedSample.join(' · '));
  if (d.steps) bits.push(d.steps.join(' → '));
  if (d.error) bits.push(d.error);
  return bits.length ? `<small>${esc(bits.join(' | '))}</small>` : '';
}

function drawMap(r) {
  const pts = r.results.filter(v => v.lat != null);
  const R = Math.max(r.radiusM, ...pts.map(p => p.distanceM || 0)) * 1.1;
  const toXY = (lat, lon) => {
    const dy = (lat - r.court.lat) * 111320, dx = (lon - r.court.lon) * 111320 * Math.cos(r.court.lat * Math.PI / 180);
    return [150 + (dx / R) * 135, 150 - (dy / R) * 135];
  };
  const ring = (r.radiusM / R) * 135;
  $('#map').innerHTML = `
    <circle cx="150" cy="150" r="${ring}" fill="#dcefd6" stroke="#9fd09a" stroke-dasharray="4 4"/>
    <text x="150" y="${150 - ring - 4}" text-anchor="middle" font-size="10" fill="#5f6f64">${km(r.radiusM)}</text>
    ${pts.map((p, i) => { const [x, y] = toXY(p.lat, p.lon); return `<g><circle cx="${x}" cy="${y}" r="${i === 0 ? 11 : 9}" fill="${i === 0 ? '#16a065' : '#14231a'}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">${i + 1}</text></g>`; }).join('')}
    <text x="150" y="157" text-anchor="middle" font-size="20">🏸</text>
    <text x="150" y="292" text-anchor="middle" font-size="11" fill="#5f6f64">${esc(r.court.label)}</text>`;
}

async function go() {
  const btn = $('#go'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Agent is thinking…';
  try {
    const res = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(readForm()) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    render(body);
  } catch (e) { alert(`Something went wrong: ${e.message}`); }
  finally { btn.disabled = false; btn.textContent = 'Find our makan spot'; }
}

async function init() {
  cfg = await (await fetch('/api/config')).json();
  $('#court').innerHTML = cfg.courts.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
  $('#day').innerHTML = DAYS.map(d => `<option>${d}</option>`).join('');
  const s = cfg.sample;
  $('#court').value = s.courtId; $('#day').value = s.day; $('#endTime').value = s.endTime; $('#radius').value = s.radiusM;
  s.members.forEach(addMember);
  const badge = $('#mode');
  badge.className = `badge ${cfg.mode}`;
  badge.textContent = cfg.mode === 'live' ? `● Live Qloo${cfg.llm ? ' + LLM' : ''}` : '◐ MOCK DATA · fictional venues';
  $('#footMode').textContent = cfg.mode === 'live' ? 'live Qloo Insights API' : 'mock mode: set QLOO_API_KEY for live Qloo data';
  $('#radius').oninput = () => ($('#radiusOut').textContent = km(+$('#radius').value));
  $('#radiusOut').textContent = km(+$('#radius').value);
  $('#addMember').onclick = () => addMember();
  $('#go').onclick = go;
  if (new URLSearchParams(location.search).has('autorun')) go(); // handy for demos/screenshots
}
init();
