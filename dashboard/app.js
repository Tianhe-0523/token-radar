// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the stated value model with its calibration table, a model sandbox, a
// filterable and sortable table, a per-protocol detail view with the farm plan, and the
// already-trading protocols the calibration is priced from. No network: every byte is data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var C = DATA.constants;

  var params = new URLSearchParams(location.search);
  var state = {
    tab: params.get('tab') === 'live' ? 'live' : 'board',
    q: '',
    category: params.get('cat') || 'all',
    chain: 'all',
    watchOnly: params.get('watch') === '1',
    sort: 'rank',
    dir: 1,
    selected: params.get('open') || null,
    gw: C.growth_weight,
    scale: 1
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The stated model, recomputed in the page from the same figures main.ts used, so what the
  // reader sees is the arithmetic that produced board.json — and the sandbox can vary it.
  function implied(row, gw, scale) {
    var growth = 1 + (row.growth_pct / 100) * gw;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * scale * growth * row.maturity_multiplier));
  }
  function ranked() {
    var rows = DATA.rows.map(function (r) {
      var copy = Object.assign({}, r);
      copy.view_implied = implied(r, state.gw, state.scale);
      return copy;
    });
    rows.sort(function (a, b) {
      return b.view_implied - a.view_implied || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1);
    });
    rows.forEach(function (r, i) { r.view_rank = i + 1; });
    return rows;
  }

  function headerHtml() {
    return '<header class="top"><div><div class="logo">Token Radar</div>' +
      '<h1>Pre-token protocols, ranked by what a launch could be worth</h1>' +
      '<p class="tagline">Every protocol in the snapshot that records no token yet and is not a wrapped, staked or bridged product of one that trades — priced by a model the market itself calibrated, each with a concrete plan to farm it.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.scanned + '</b><span>protocols scanned</span></div>' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>on the board</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + esc(DATA.as_of) + '</b><span>snapshot date</span></div>' +
      '</div></header>';
  }

  function modelHtml() {
    var calRows = DATA.calibration.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.traded_peers + '</td>' +
        '<td class="num">' + c.median_ratio.toFixed(3) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td>' +
        '<td>' + esc(c.source) + '</td></tr>';
    }).join('');
    return '<section class="panel"><h2>The value model — ' + esc(DATA.model_version) + '</h2>' +
      '<p>An implied value is this entry\u2019s own claim: what a token could be worth if the protocol\u2019s record stayed as it is. It is not a prediction that a token will be issued. The multiple is not a guess: for each category, the protocols whose token already trades give a market-cap-to-TVL ratio, and the board uses the median of those ratios (' + C.calibration_min_n + ' or more traded peers, clamped to 0.02\u20132.50). A category with too few traded peers is priced by the global median, <b>' + DATA.global_multiple.toFixed(3) + '</b>, over every traded protocol in the snapshot. Growth and maturity then adjust for the protocol\u2019s own seven-day TVL change and for how long it has run with no token recorded.</p>' +
      '<div class="formula">implied = TVL &times; <em>category multiple</em> &times; (1 + clamp(7d change, ' + C.growth_floor + '\u2026' + C.growth_cap + ')% &times; <em>' + C.growth_weight + '</em>) &times; (' + C.maturity_base + ' + ' + C.maturity_range + ' &times; min(age, ' + C.maturity_days + 'd) / ' + C.maturity_days + ')</div>' +
      '<table class="cal"><thead><tr><th>Category</th><th class="num">Traded peers</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th><th>Priced by</th></tr></thead><tbody>' + calRows + '</tbody></table>' +
      '<div class="sandbox"><span><b>Model sandbox</b> — vary the model and watch the board re-rank. board.json itself always carries the stated constants.</span>' +
      '<label>Growth weight <input id="sb-gw" type="range" min="0" max="1" step="0.05" value="' + state.gw + '"><output id="sb-gw-v">' + state.gw.toFixed(2) + '</output></label>' +
      '<label>Multiple scale <input id="sb-scale" type="range" min="0.5" max="2" step="0.05" value="' + state.scale + '"><output id="sb-scale-v">' + state.scale.toFixed(2) + '&times;</output></label>' +
      '<button class="reset" id="sb-reset" type="button">Reset to the stated model</button></div></section>';
  }

  function controlsHtml(categories, chains) {
    function opts(list, current, allLabel) {
      var s = '<option value="all">' + allLabel + '</option>';
      list.forEach(function (v) { s += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; });
      return s;
    }
    return '<div class="controls">' +
      '<input type="search" id="f-q" placeholder="Search protocols\u2026" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="f-cat" aria-label="Filter by category">' + opts(categories, state.category, 'All categories') + '</select>' +
      '<select id="f-chain" aria-label="Filter by chain">' + opts(chains, state.chain, 'All chains') + '</select>' +
      '<label class="check"><input type="checkbox" id="f-watch"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count" id="f-count"></span></div>';
  }

  function boardHtml(rows) {
    var head = '<table class="board"><thead><tr>' +
      '<th data-sort="rank">#</th><th data-sort="name">Protocol</th><th>Category</th><th class="hideS">Chains</th>' +
      '<th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="change">7d</th>' +
      '<th class="num hideS" data-sort="age">Age</th><th class="num" data-sort="implied">Implied value</th></tr></thead><tbody>';
    if (rows.length === 0) return head + '</tbody></table><div class="empty">No protocol matches this filter. Loosen it — the radar keeps every candidate one filter away.</div>';
    var body = rows.map(function (r) {
      var chg = r.change_7d === null ? '<td class="num">n/a</td>' :
        '<td class="num ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="rank">' + r.view_rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge watch">watchlist</span>' : '') + '</td>' +
        '<td><span class="badge cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="chains hideS">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' + chg +
        '<td class="num hideS">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num implied">' + fmtUsd(r.view_implied) + '</td></tr>';
    }).join('');
    return head + body + '</tbody></table>';
  }

  function detailHtml(row) {
    if (!row) return '';
    var cal = DATA.calibration.filter(function (c) { return c.category === row.category; })[0];
    var pricedBy = cal ? (cal.source === 'category median'
      ? 'category median of ' + cal.traded_peers + ' traded ' + esc(row.category) + ' protocols'
      : 'global median (only ' + cal.traded_peers + ' traded peer' + (cal.traded_peers === 1 ? '' : 's') + ' in this category)') : 'global median';
    var steps = row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<section class="drawer" id="detail"><button class="close" id="d-close" type="button">Close</button>' +
      '<h2>' + esc(row.name) + (row.watchlist ? '<span class="badge watch">on the house watchlist</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Uncategorised') + ' &middot; records no token in the snapshot of ' + esc(DATA.as_of) + ' &middot; rank #' + row.view_rank + ' of ' + DATA.board_size + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + fmtUsd(row.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>' + fmtPct(row.change_7d) + '</b><span>TVL change, 7d</span></div>' +
      '<div class="cell"><b>' + fmtAge(row.age_days) + '</b><span>tracked, no token</span></div>' +
      '<div class="cell"><b>' + fmtUsd(row.view_implied) + '</b><span>implied value</span></div>' +
      '<div class="cell"><b>' + esc(row.chains.join(', ') || 'n/a') + '</b><span>chains</span></div>' +
      '</div>' +
      '<h3>How the model prices it</h3>' +
      '<div class="arith">TVL ' + fmtUsd(row.tvl_usd) + ' &times; multiple <em>' + row.category_multiple.toFixed(3) + '</em> (' + pricedBy + ')<br>' +
      '&times; growth <em>' + row.growth_multiplier.toFixed(3) + '</em> (7d change ' + fmtPct(row.change_7d) + ', clamped, weight ' + state.gw.toFixed(2) + ')<br>' +
      '&times; maturity <em>' + row.maturity_multiplier.toFixed(3) + '</em> (' + (row.age_days === null ? 'age unknown, counted as 365d' : row.age_days + ' days with no token recorded') + ')' +
      (state.scale !== 1 ? '<br>&times; sandbox scale <em>' + state.scale.toFixed(2) + '</em>' : '') +
      '<br>= implied value <em>' + fmtUsd(row.view_implied) + '</em></div>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="sub">Costs are estimates from the chain\u2019s typical fees and the position size this protocol\u2019s TVL tier calls for. Nothing here is financial advice; a launch is never guaranteed.</p></section>';
  }

  function liveHtml() {
    var rows = DATA.live.map(function (r, i) {
      var chg = r.change_7d === null ? '<td class="num">n/a</td>' :
        '<td class="num ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>';
      return '<tr><td class="rank">' + (i + 1) + '</td><td><span class="pname">' + esc(r.name) + '</span>' +
        (r.symbol ? '<span class="badge cat">' + esc(r.symbol) + '</span>' : '') + '</td>' +
        '<td><span class="badge cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td>' + chg +
        '<td class="num">' + (r.ratio === null ? 'n/a' : r.ratio.toFixed(3)) + '</td></tr>';
    }).join('');
    return '<section class="panel"><h2>Already trading — kept apart on purpose</h2>' +
      '<p>These protocols already have a token, so the radar does not rank them: it prices them at the market\u2019s own value. They earn their place here as the calibration set — the multiples in the model above are the medians of exactly these ratios, category by category.</p></section>' +
      '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function footerHtml() {
    return '<footer>Data: ' + esc(DATA.source) + '. The board says a protocol <i>records</i> no token in that snapshot — never that it has none. Implied values are this entry\u2019s model claims (' + esc(DATA.model_version) + '), not make.fun\u2019s and not a promise of any launch. The watchlist floor is $' + (DATA.floor_usd / 1e6) + 'M of TVL; the board ranks candidates at every size above the snapshot\u2019s $5M inclusion line.</footer>';
  }

  function visibleRows(all) {
    var q = state.q.trim().toLowerCase();
    return all.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      var k = state.sort;
      if (k === 'rank') return a.view_rank - b.view_rank;
      if (k === 'name') return (a.name < b.name ? -1 : 1) * state.dir;
      if (k === 'tvl') return (a.tvl_usd - b.tvl_usd) * state.dir;
      if (k === 'change') return ((a.change_7d || 0) - (b.change_7d || 0)) * state.dir;
      if (k === 'age') return ((a.age_days || 0) - (b.age_days || 0)) * state.dir;
      return (a.view_implied - b.view_implied) * state.dir;
    });
  }

  function render() {
    var categories = [];
    var chains = [];
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      if (categories.indexOf(c) === -1) categories.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) === -1) chains.push(ch); });
    });
    categories.sort(); chains.sort();

    var html = headerHtml() + modelHtml() +
      '<div class="tabs"><button type="button" data-tab="board" aria-selected="' + (state.tab === 'board') + '">Pre-token board</button>' +
      '<button type="button" data-tab="live" aria-selected="' + (state.tab === 'live') + '">Already trading (' + DATA.live_size + ')</button></div>';

    if (state.tab === 'live') {
      html += liveHtml();
    } else {
      var all = ranked();
      var rows = visibleRows(all);
      html += controlsHtml(categories, chains) + boardHtml(rows);
      var sel = all.filter(function (r) { return r.slug === state.selected; })[0];
      html += detailHtml(sel || null);
    }
    html += footerHtml();
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind(all, rows);
  }

  function bind(all, rows) {
    var gw = document.getElementById('sb-gw');
    if (gw) {
      gw.addEventListener('input', function () {
        state.gw = parseFloat(gw.value);
        document.getElementById('sb-gw-v').textContent = state.gw.toFixed(2);
        render();
      });
      var sc = document.getElementById('sb-scale');
      sc.addEventListener('input', function () {
        state.scale = parseFloat(sc.value);
        document.getElementById('sb-scale-v').textContent = state.scale.toFixed(2) + '\u00d7';
        render();
      });
      document.getElementById('sb-reset').addEventListener('click', function () {
        state.gw = C.growth_weight; state.scale = 1; render();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    if (state.tab !== 'board') return;
    var count = document.getElementById('f-count');
    if (count) count.textContent = rows.length + ' of ' + DATA.board_size + ' protocols';
    var q = document.getElementById('f-q');
    q.addEventListener('input', function () {
      var pos = q.selectionStart;
      state.q = q.value;
      render();
      var nq = document.getElementById('f-q');
      nq.focus();
      nq.setSelectionRange(pos, pos);
    });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.category = e.target.value; render(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('f-watch').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
    Array.prototype.forEach.call(document.querySelectorAll('table.board thead th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
        if (k === 'rank') state.dir = 1;
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('table.board tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView({ block: 'nearest' });
      });
    });
    var close = document.getElementById('d-close');
    if (close) close.addEventListener('click', function () { state.selected = null; render(); });
  }

  render();
})();
