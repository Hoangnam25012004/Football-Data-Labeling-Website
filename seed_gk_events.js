/* Them 17 event moi vao tu dien va xep lai thu tu bang Event types.
   Dan NGUYEN file nay vao Console cua https://hoangnams.com/tagger/ roi Enter.

   VI SAO CAN SCRIPT NAY, chu khong phai chi sua DEFAULT_EVENTS:
   DEFAULT_EVENTS trong index.html chi duoc doc o lan mo DAU TIEN, khi chua co tu dien nao.
   Mot may da tung vao, hoac mot account da co tu dien tren cloud, se duoc applyEventTypes()
   ghi de state.events bang ban tren cloud — nen 17 ten moi se khong bao gio tu xuat hien.
   Script nay chay tren DANH SACH THAT dang o trong app, nen no cung khong can biet truoc
   tu dien cua ban dai bao nhieu.

   VI SAO KHONG BAM NUT "＋ Add":
   nextFreeKey() phat ma tu DEFAULT_KEYS. Ma o day duoc dat thang, dung bang da duyet
   trong docs/gk-events-and-duel-split-design.md §6.2.

   AN TOAN:
   - Khong doi ten, khong xoa event nao. Macro luu theo TEN nen khong macro nao chet.
   - Khong dung ma nao dang co (event hoac macro). Neu co, script DUNG LAI va bao ra,
     khong ghi gi ca.
   - Chay lai duoc: event da co thi bo qua, chi xep lai thu tu.
   - Chi ghi khi ban go 'yes'. */
(function () {
  if (!window.PT || !PT.state) { console.error('Mo trang tagger truoc da.'); return; }

  /* ---- 17 event moi, ten va ma lay tu §3 va §6.2 cua ban thiet ke ---- */
  var NEW = [
    ['own goal', 'og'],
    ['physical duel success', 'pd'], ['physical duel fail', 'pdd'],
    ['loose ball duel success', 'lo'], ['loose ball duel fail', 'loo'],
    ['catch', 'ca'], ['parry', 'pr'],
    ['save standing', 'vs'], ['save diving', 'vd'], ['save collapse', 'vc'],
    ['save overhead', 'vo'], ['save kneeling', 'vk'],
    ['defensive line support success', 'ln'], ['defensive line support fail', 'lnn'],
    ['aerial control success', 'ac'], ['aerial control fail', 'acc'],
    ['goal conceded', 'gc']
  ];

  /* ---- thu tu doc, giong het FILM_EV_GROUPS trong Stats/stats-view.js ----
     Mot bang cho hai viec: thu tu trong modal va thu tu trong bo loc Film khong the
     mau thuan nhau. Ten KHONG co trong bang nay giu nguyen thu tu tuong doi cua no va
     di xuong cuoi — nen 10 event chi song tren cloud khong bi mat, chi bi xep sau. */
  var ORDER = [
    'goal', 'own goal', 'assist', 'key pass', 'shot on target', 'shot off target',
    'blocked shot', 'miss shot',
    'pass success', 'pass fail', 'cross success', 'cross fail',
    'take-on success', 'take-on succes', 'take-on fail', 'step in',
    'tackle success', 'tackle fail', 'interception', 'clearance', 'block', 'recovery',
    'aerial duel success', 'aerial duel fail', 'ground duel success', 'ground duel fail',
    'physical duel success', 'physical duel fail',
    'loose ball duel success', 'loose ball duel fail',
    'take-on concern', 'mistake',
    'catch', 'parry', 'save', 'save standing', 'save diving', 'save collapse',
    'save overhead', 'save kneeling',
    'defensive line support success', 'defensive line support fail',
    'aerial control success', 'aerial control fail', 'goal conceded',
    'corner-kick', 'free-kick', 'penalty kick', 'throw-ins', 'throw-in', 'throw-Ins',
    'goal kick', 'foul', 'foul throw', 'handball foul', 'foul won', 'offside',
    'yellow card', 'red card', 'substitution', 'gain possession', 'pause',
    'right foot', 'left foot', 'upper body', 'head', 'lower body'
  ];

  var evs = PT.state.events.football || [];
  var macs = (PT.state.macros && PT.state.macros.football) || [];
  var byName = {}; evs.forEach(function (e) { byName[e.name] = e; });

  /* ---- kiem tra TRUOC khi ghi ---- */
  var problems = [];
  var takenEv = {}, takenMac = {};
  evs.forEach(function (e) { if (e.key) takenEv[e.key] = e.name; });
  macs.forEach(function (m) { if (m.key) takenMac[m.key] = m.events.join(' + '); });

  NEW.forEach(function (p) {
    var name = p[0], key = p[1];
    if (byName[name]) return;                       // da co roi, khong dat lai ma
    if (takenEv[key]) problems.push('ma "' + key + '" (cho ' + name + ') dang la ma cua event "' + takenEv[key] + '"');
    /* Ma event THANG ma macro (xem expandKey), nen trung o day la giet macro do — im
       lang luc tag, chi hien o thanh do trong bang Macro. Khong danh doi. */
    if (takenMac[key]) problems.push('ma "' + key + '" (cho ' + name + ') dang la ma cua MACRO "' + takenMac[key] + '"');
  });
  var seen = {};
  NEW.forEach(function (p) {
    if (seen[p[1]]) problems.push('ma "' + p[1] + '" bi dung hai lan trong chinh danh sach moi');
    seen[p[1]] = 1;
  });

  if (problems.length) {
    console.error('DUNG LAI — khong ghi gi ca. ' + problems.length + ' va cham:');
    problems.forEach(function (s) { console.error('  - ' + s); });
    console.error('Sua ma trong NEW[] roi chay lai.');
    return;
  }

  /* ---- xem truoc ---- */
  var add = NEW.filter(function (p) { return !byName[p[0]]; });
  var have = NEW.length - add.length;
  console.log('Tu dien hien co: ' + evs.length + ' event, ' + macs.length + ' macro.');
  console.log('Se them: ' + add.length + ' event' + (have ? ' (' + have + ' cai da co, bo qua)' : ''));
  add.forEach(function (p) { console.log('   ' + p[1] + '   ' + p[0]); });

  var rank = {}; ORDER.forEach(function (n, i) { rank[n.toLowerCase()] = i; });
  var next = evs.concat(add.map(function (p) { return { name: p[0], key: p[1] }; }));
  /* Ten la khong bi day len dau cung khong bi tron vao nhau: no nhan rank cuoi bang va
     giu nguyen thu tu tuong doi cu (sort on dinh + chi so cu lam tie-break). */
  var was = {}; next.forEach(function (e, i) { was[e.name] = i; });
  next.sort(function (a, b) {
    var ra = rank[a.name.toLowerCase()], rb = rank[b.name.toLowerCase()];
    if (ra == null) ra = ORDER.length + was[a.name];
    if (rb == null) rb = ORDER.length + was[b.name];
    return ra - rb || was[a.name] - was[b.name];
  });

  var moved = next.filter(function (e, i) { return evs[i] && evs[i].name !== e.name; }).length;
  console.log('Sau khi xep lai: ' + next.length + ' event, ' + moved + ' hang doi cho.');
  var unknown = next.filter(function (e) { return rank[e.name.toLowerCase()] == null; });
  if (unknown.length) {
    console.warn('Khong co trong bang thu tu — se nam o cuoi, khong mat:');
    unknown.forEach(function (e) { console.warn('   ' + (e.key || '—') + '   ' + e.name); });
  }

  /* Macro chi tro theo TEN, va khong ten nao bi doi hay bi xoa — nen sau buoc nay khong
     macro nao thanh "miss". In ra de nhin thay dieu do, thay vi tin loi. */
  var dict = {}; next.forEach(function (e) { dict[e.name] = 1; });
  var dead = [];
  macs.forEach(function (m) {
    m.events.forEach(function (n) { if (!dict[n]) dead.push(m.key + ' -> ' + n); });
  });
  console.log(dead.length ? 'CANH BAO, macro se hong: ' + dead.join(', ')
                          : 'Macro: ca ' + macs.length + ' cai van tro toi event con ton tai.');

  window.__seedGkEvents = function () {
    PT.state.events.football = next;
    /* saveEvents() ghi localStorage roi goi Cloud.onEventTypesChanged() -> pushEventTypes,
       cai nay INSERT ten chua co (kem key) va UPSERT ten da co (chi sport/event_name/ord,
       khong gui key) — nen thu tu duoc cap nhat ma hotkey cua moi nguoi khong bi dung. */
    PT.saveEvents();
    PT.renderEvents(); PT.renderMacros(); PT.updateBanner(); PT.updateStoreStatus();
    console.log('Xong. ' + next.length + ' event. Mo bang Event types + Macro va kiem tra:');
    console.log('  1. 17 ten moi co mat, dung ma;');
    console.log('  2. KHONG o ma nao trong bang Macro bi to DO.');
  };
  console.log('%cGo:  __seedGkEvents()   de ghi.', 'font-weight:bold');
})();
