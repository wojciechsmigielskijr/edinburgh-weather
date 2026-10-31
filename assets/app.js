(() => {
  const DATA = JSON.parse(document.getElementById("chart-data").textContent);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const fmtDay = d => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Lightbox
  const lb = document.getElementById("lb");
  document.addEventListener("click", ev => {   // delegated, so the model viewer's figures work too
    const b = ev.target.closest("figure button");
    if (!b) return;
    lb.querySelector("img").src = b.dataset.full; lb.querySelector("p").textContent = b.dataset.cap; lb.showModal();
  });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  lb.addEventListener("click", () => lb.close());

  function tooltip(host) { const t = document.createElement("div"); t.className = "tip"; host.appendChild(t); return t; }
  function placeTip(tip, host, x, y) {
    tip.style.display = "block";
    const w = tip.offsetWidth, hw = host.clientWidth;
    tip.style.left = Math.min(Math.max(x + 14, 4), hw - w - 4) + "px";
    tip.style.top = Math.max(y - tip.offsetHeight - 10, 4) + "px";
  }

  // 850 hPa ensemble plume: mean line + 10-90% band per model, climatology dashed. Legend buttons toggle models.
  const hiddenModels = new Set();
  function drawPlume() {
    const host = document.getElementById("plume");
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const models = Object.keys(DATA.plume || {});
    if (!models.length) { host.insertAdjacentHTML("beforeend", "<p class='blurb'>No ensemble data in this run.</p>"); return; }
    // Table view: one row per day at 12Z, each model's mean and 10-90% range.
    const days = [...new Set(models.flatMap(k => DATA.plume[k].map(p => p.t.slice(0, 10))))].sort();
    const at12 = (k, d) => DATA.plume[k].find(p => p.t.startsWith(d + "T12"));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table (12Z each day)</summary><table class="data"><tr><th>Day</th>` +
      models.map(k => `<th>${k}</th>`).join("") + "</tr>" + days.map(d => `<tr><td>${d}</td>` + models.map(k => {
        const p = at12(k, d); return `<td>${p ? `${p.mean}° (${p.p10} to ${p.p90})` : "–"}</td>`; }).join("") + "</tr>").join("") +
      "</table></details>");
    const palette = ["--s1", "--s2", "--s3", "--s4"].map(css);
    const color = k => palette[models.indexOf(k)] || css("--muted");   // colour follows the model, not visibility
    const shown = models.filter(k => !hiddenModels.has(k));
    const W = Math.max(host.clientWidth - 36, 300), H = 300, m = { l: 34, r: 16, t: 10, b: 28 };
    const all = models.flatMap(k => DATA.plume[k]);                     // axes from every model, so toggling doesn't rescale
    const ts = all.map(p => +new Date(p.t));
    const x0 = Math.min(...ts), x1 = Math.max(...ts);
    const vals = all.flatMap(p => [p.p10, p.p90, p.clim].filter(v => v != null)).concat([-5, 0]);
    const y0 = Math.floor(Math.min(...vals) - 1), y1 = Math.ceil(Math.max(...vals) + 1);
    const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": "850 hPa temperature ensemble mean and 10-90% range by model" });
    host.insertBefore(svg, host.querySelector("details"));   // chart above its table view
    for (let v = Math.ceil(y0 / 5) * 5; v <= y1; v += 5) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? css("--axis") : css("--grid"), "stroke-width": 1 }, svg);
      el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "ax" }, svg).textContent = v + "°";
    }
    // -5 °C at 850 hPa: rough snow-to-low-levels line for Scotland.
    el("line", { x1: m.l, x2: W - m.r, y1: Y(-5), y2: Y(-5), stroke: css("--cold2"), "stroke-dasharray": "2 4", "stroke-width": 1 }, svg);
    el("text", { x: W - m.r, y: Y(-5) - 4, "text-anchor": "end", class: "ax" }, svg).textContent = "−5° snow line";
    for (let d = new Date(x0); +d <= x1; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCHours() !== 0 || (d.getUTCDate() % 2)) continue;
      el("text", { x: X(+d), y: H - 8, "text-anchor": "middle", class: "ax" }, svg).textContent =
        d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    const climSrc = models.find(k => DATA.plume[k].filter(p => p.clim != null).length > 4);
    const clim = climSrc ? DATA.plume[climSrc].filter(p => p.clim != null) : [];
    if (clim.length) el("path", { d: clim.map((p, i) => (i ? "L" : "M") + X(+new Date(p.t)) + " " + Y(p.clim)).join(""),
      fill: "none", stroke: css("--clim"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
    shown.forEach(k => {
      const s = DATA.plume[k];
      const up = s.map(p => X(+new Date(p.t)) + " " + Y(p.p90)), dn = s.map(p => X(+new Date(p.t)) + " " + Y(p.p10)).reverse();
      el("path", { d: "M" + up.join("L") + "L" + dn.join("L") + "Z", fill: color(k), "fill-opacity": shown.length > 2 ? .09 : .14, stroke: "none" }, svg);
    });
    shown.forEach(k => {   // lines after all bands so no band covers a line
      el("path", { d: DATA.plume[k].map((p, j) => (j ? "L" : "M") + X(+new Date(p.t)) + " " + Y(p.mean)).join(""),
        fill: "none", stroke: color(k), "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    });
    const legend = document.getElementById("plume-legend");
    legend.innerHTML = models.map(k => `<button type="button" data-k="${k}" aria-pressed="${!hiddenModels.has(k)}">` +
      `<i style="background:${color(k)}"></i>${k}</button>`).join("") +
      (clim.length ? `<span><i style="background:${css("--clim")}"></i>Climatology</span>` : "");
    legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      hiddenModels.has(b.dataset.k) ? hiddenModels.delete(b.dataset.k) : hiddenModels.add(b.dataset.k); drawPlume();
    }));
    // Crosshair + tooltip
    const tip = tooltip(host);
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: css("--axis"), "stroke-width": 1, visibility: "hidden" }, svg);
    const dots = shown.map(k => el("circle", { r: 4, fill: color(k), stroke: css("--surface"), "stroke-width": 2, visibility: "hidden" }, svg));
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    const nearest = (s, t) => s.reduce((a, p) => Math.abs(+new Date(p.t) - t) < Math.abs(+new Date(a.t) - t) ? p : a);
    hit.addEventListener("pointermove", ev => {
      if (!shown.length) return;
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      const when = new Date(nearest(DATA.plume[shown[0]], x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0)).t);
      const rows = [];
      shown.forEach((k, i) => {
        const best = nearest(DATA.plume[k], +when);
        if (Math.abs(+new Date(best.t) - when) > 3 * 3600e3) { dots[i].setAttribute("visibility", "hidden"); return; }
        dots[i].setAttribute("cx", X(+new Date(best.t))); dots[i].setAttribute("cy", Y(best.mean)); dots[i].setAttribute("visibility", "visible");
        rows.push(`<div><span style="color:${color(k)}">●</span> ${k}: <b>${best.mean}°</b> (${best.p10}° to ${best.p90}°)</div>`);
      });
      const c = clim.length ? nearest(clim, +when) : null;
      if (c && Math.abs(+new Date(c.t) - when) <= 12 * 3600e3) rows.push(`<div style="color:var(--ink-2)">Climatology ${c.clim}°</div>`);
      cross.setAttribute("x1", X(+when)); cross.setAttribute("x2", X(+when)); cross.setAttribute("visibility", "visible");
      tip.innerHTML = `<div><b>${fmtDay(when)} ${String(when.getUTCHours()).padStart(2, "0")}Z</b></div>` + rows.join("");
      placeTip(tip, host, X(+when) * r.width / W + 18, ev.clientY - host.getBoundingClientRect().top);
    });
    hit.addEventListener("pointerleave", () => { tip.style.display = "none"; cross.setAttribute("visibility", "hidden");
      dots.forEach(d => d.setAttribute("visibility", "hidden")); });
  }

  // Seasonal: anomaly of the ensemble-mean monthly temperature with a 10-90% range bar.
  function drawSeasonal() {
    const host = document.getElementById("seasonal");
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const rows = (DATA.seasonal || []).filter(r => r.era5_normal_tmean_c != null);
    if (!rows.length) { host.insertAdjacentHTML("beforeend", "<p class='blurb'>No seasonal data in this run.</p>"); return; }
    const an = rows.map(r => ({ r, mean: +(r.tmean_c.mean - r.era5_normal_tmean_c).toFixed(1),
      lo: +(r.tmean_c.p10 - r.era5_normal_tmean_c).toFixed(1), hi: +(r.tmean_c.p90 - r.era5_normal_tmean_c).toFixed(1) }));
    const W = Math.max(host.clientWidth - 36, 300), H = 240, m = { l: 34, r: 12, t: 12, b: 28 };
    const ext = Math.ceil(Math.max(2, ...an.map(a => Math.max(Math.abs(a.lo), Math.abs(a.hi)))));
    const Y = v => m.t + (ext - v) / (2 * ext) * (H - m.t - m.b);
    const bw = (W - m.l - m.r) / an.length;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Seasonal monthly temperature anomaly" });
    host.appendChild(svg);
    for (let v = -ext; v <= ext; v++) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? css("--axis") : css("--grid") }, svg);
      el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "ax" }, svg).textContent = (v > 0 ? "+" : "") + v + "°";
    }
    const tip = tooltip(host);
    an.forEach((a, i) => {
      const cx = m.l + bw * (i + .5), col = a.mean >= 0 ? css("--warm2") : css("--cold2");
      el("line", { x1: cx, x2: cx, y1: Y(a.hi), y2: Y(a.lo), stroke: col, "stroke-width": 6, "stroke-linecap": "round", "stroke-opacity": .35 }, svg);
      el("circle", { cx, cy: Y(a.mean), r: 6, fill: col, stroke: css("--surface"), "stroke-width": 2 }, svg);
      const d = new Date(a.r.month + "-01T00:00:00Z");
      el("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "ax" }, svg).textContent = d.toLocaleDateString("en-GB", { month: "short" });
      if (an.length <= 8) el("text", { x: cx + 10, y: Y(a.mean) + 4, class: "ax" }, svg).textContent = (a.mean > 0 ? "+" : "") + a.mean + "°";
      const hit = el("rect", { x: cx - bw / 2, y: m.t, width: bw, height: H - m.t - m.b, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", ev => {
        const r = a.r;
        tip.innerHTML = `<div><b>${d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b></div>
          <div>Mean ${r.tmean_c.mean}° vs normal ${r.era5_normal_tmean_c}° (<b>${a.mean > 0 ? "+" : ""}${a.mean}°</b>)</div>
          <div>${r.pct_members_warmer_than_normal}% of members milder than normal</div>
          <div>Frost days ${r.frost_days.mean} (normal ${r.era5_normal_frost_days})</div>
          <div>Rain ${r.precip_mm.mean} mm (normal ${r.era5_normal_precip_mm} mm)</div>`;
        placeTip(tip, host, ev.clientX - host.getBoundingClientRect().left, ev.clientY - host.getBoundingClientRect().top);
      });
      hit.addEventListener("pointerleave", () => tip.style.display = "none");
    });
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Month</th><th>Mean °C</th><th>Normal</th><th>% milder</th><th>Frost days</th><th>Normal</th><th>Rain mm</th><th>Normal</th></tr>` +
      rows.map(r => `<tr><td>${r.month}</td><td>${r.tmean_c.mean}</td><td>${r.era5_normal_tmean_c}</td><td>${r.pct_members_warmer_than_normal}</td><td>${r.frost_days.mean}</td><td>${r.era5_normal_frost_days}</td><td>${r.precip_mm.mean}</td><td>${r.era5_normal_precip_mm}</td></tr>`).join("") + "</table></details>");
  }

  // Shared helpers for the daily charts: a categorical day axis (one slot per date).
  const dayLabel = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const dayLong = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  function segment(id, state, redraw, key = "metric") {
    const btns = document.querySelectorAll(`#${id} button`);
    btns.forEach(b => b.addEventListener("click", () => {
      state[key] = b.dataset.m; btns.forEach(o => o.setAttribute("aria-pressed", o === b)); redraw();
    }));
  }
  function dayAxes(svg, dates, W, H, m, y0, y1, step, unit) {
    const X = i => m.l + (i + .5) * (W - m.l - m.r) / dates.length;
    const Y = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? css("--axis") : css("--grid"), "stroke-width": 1 }, svg);
      el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "ax" }, svg).textContent = v + unit;
    }
    const every = Math.ceil(dates.length / Math.max(2, Math.floor((W - m.l - m.r) / 52)));
    dates.forEach((d, i) => { if (i % every === 0) el("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "ax" }, svg).textContent = dayLabel(d); });
    return { X, Y };
  }
  function hover(svg, host, dates, W, H, m, X, render) {
    const tip = tooltip(host);
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: css("--axis"), "stroke-width": 1, visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      const i = Math.min(dates.length - 1, Math.max(0, Math.floor((sx - m.l) / ((W - m.l - m.r) / dates.length))));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      tip.innerHTML = render(i);
      placeTip(tip, host, X(i) * r.width / W + 18, ev.clientY - host.getBoundingClientRect().top);
    });
    hit.addEventListener("pointerleave", () => { tip.style.display = "none"; cross.setAttribute("visibility", "hidden"); });
  }

  // 15-day 2 m temperature: per model, ensemble mean + 10-90% band, highs or lows.
  const pointState = { metric: "tmax", hidden: new Set() };
  function drawPoint() {
    const host = document.getElementById("point");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const P = DATA.point || {}, models = Object.keys(P), k = pointState.metric;
    // Fixed order from the collector (ECMWF ENS, GEFS, AIFS ENS, GEM ENS first, as in the 850 hPa chart), so each
    // model keeps its colour whatever is hidden.
    const color = n => css("--s" + (models.indexOf(n) + 1));
    const dates = [...new Set(models.flatMap(n => P[n].days.map(d => d.date)))].sort();
    const shown = models.filter(n => !pointState.hidden.has(n));
    // Axis spans both highs and lows, so switching metric doesn't rescale.
    const vals = models.flatMap(n => P[n].days.flatMap(d => [d.tmin.p10, d.tmax.p90])).filter(v => v != null);
    const W = Math.max(host.clientWidth - 36, 300), H = 280, m = { l: 34, r: 16, t: 10, b: 28 };
    const y0 = Math.floor((Math.min(...vals, 0) - 1) / 2) * 2, y1 = Math.ceil((Math.max(...vals) + 1) / 2) * 2;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `Daily ${k === "tmax" ? "maximum" : "minimum"} temperature, ensemble mean and 10-90% range by model` });
    host.appendChild(svg);
    const { X, Y } = dayAxes(svg, dates, W, H, m, y0, y1, 2, "°");
    const at = (n, i) => P[n].days.find(d => d.date === dates[i]);
    const pts = n => dates.map((_, i) => [i, at(n, i)]).filter(([, d]) => d && d[k].mean != null);
    shown.forEach(n => {
      const up = pts(n).map(([i, d]) => X(i) + " " + Y(d[k].p90)), dn = pts(n).map(([i, d]) => X(i) + " " + Y(d[k].p10)).reverse();
      el("path", { d: "M" + up.join("L") + "L" + dn.join("L") + "Z", fill: color(n), "fill-opacity": shown.length > 2 ? .07 : .14 }, svg);
    });
    shown.forEach(n => el("path", { d: pts(n).map(([i, d], j) => (j ? "L" : "M") + X(i) + " " + Y(d[k].mean)).join(""),
      fill: "none", stroke: color(n), "stroke-width": 2, "stroke-linejoin": "round" }, svg));
    const legend = document.getElementById("point-legend");
    legend.innerHTML = models.map(n => `<button type="button" data-k="${n}" aria-pressed="${!pointState.hidden.has(n)}">` +
      `<i style="background:${color(n)}"></i>${n} (${P[n].members} members)</button>`).join("");
    legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      pointState.hidden.has(b.dataset.k) ? pointState.hidden.delete(b.dataset.k) : pointState.hidden.add(b.dataset.k); drawPoint(); }));
    hover(svg, host, dates, W, H, m, X, i => `<div><b>${dayLong(dates[i])}</b></div>` + shown.map(n => {
      const d = at(n, i); if (!d || d.tmax.mean == null) return "";
      return `<div><span style="color:${color(n)}">●</span> ${n}: high <b>${d.tmax.mean}°</b> (${d.tmax.p10} to ${d.tmax.p90}°), low <b>${d.tmin.mean}°</b> (${d.tmin.p10} to ${d.tmin.p90}°)</div>` +
        `<div style="color:var(--ink-2);padding-left:14px">rain ${d.precip_mm.mean} mm · ${d.pct_members_rain_gt1mm}% of members wet · ${d.pct_members_frost}% frost</div>`;
    }).join(""));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      models.map(n => `<th>${n} high</th><th>${n} low</th>`).join("") + "</tr>" + dates.map((d, i) => `<tr><td>${dayLong(d)}</td>` +
      models.map(n => { const x = at(n, i); return x && x.tmax.mean != null
        ? `<td>${x.tmax.mean}° (${x.tmax.p10} to ${x.tmax.p90})</td><td>${x.tmin.mean}° (${x.tmin.p10} to ${x.tmin.p90})</td>` : "<td>–</td><td>–</td>"; }).join("") +
      "</tr>").join("") + "</table></details>");
  }

  // Run-to-run: each kept run's ensemble mean for the same target days, one model at a time. Newest bold, older fainter.
  const trendState = { metric: "tmax", model: "ECMWF ENS" };
  const TREND = { tmax: ["Daytime high", "°", 2], tmin: ["Overnight low", "°", 2], precip: ["Rain, ensemble mean", " mm", 2],
                  rain_pct: ["Chance of over 1 mm of rain", "%", 20] };
  function drawTrend() {
    const host = document.getElementById("trend-chart");
    host.querySelectorAll("svg,.tip,details,p.blurb").forEach(n => n.remove());
    const T = DATA.trend || {}, names = Object.keys(T);
    if (!T[trendState.model]) trendState.model = names[0];
    const pick = document.getElementById("trend-model");
    pick.innerHTML = names.map(n => `<button type="button" data-k="${esc(n)}" aria-pressed="${n === trendState.model}">${esc(n)}</button>`).join("");
    pick.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { trendState.model = b.dataset.k; drawTrend(); }));
    const runs = T[trendState.model] || [], k = trendState.metric, [label, unit, step] = TREND[k];
    if (!runs.length) { host.insertAdjacentHTML("beforeend", "<p class='blurb'>No point data yet.</p>"); return; }
    const dates = [...new Set(runs.flatMap(r => r.days.map(d => d.date)))].sort();
    const vals = runs.flatMap(r => r.days.map(d => d[k])).filter(v => v != null);
    const W = Math.max(host.clientWidth - 36, 300), H = 260, m = { l: 42, r: 16, t: 10, b: 28 };
    let y0, y1;
    if (k === "rain_pct") { y0 = 0; y1 = 100; }
    else { y0 = Math.floor((Math.min(...vals, k === "precip" ? 0 : Infinity) - 1) / step) * step;
           y1 = Math.ceil((Math.max(...vals) + 1) / step) * step; if (k === "precip") y0 = 0; }
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label}: what each recent run forecast for each day` });
    host.appendChild(svg);
    const { X, Y } = dayAxes(svg, dates, W, H, m, y0, y1, step, unit);
    const runName = r => new Date(r.run.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + " " + r.run.slice(11, 16) + "Z";
    // The newest run wears the model's colour from the 15-day chart.
    const s1 = css("--s" + ((Object.keys(DATA.point || {}).indexOf(trendState.model) + 1) || 1)), old = css("--muted");
    [...runs].reverse().forEach(r => {   // oldest first, so the newest run is drawn on top
      const age = runs.indexOf(r), pts = r.days.map(d => [dates.indexOf(d.date), d[k]]).filter(([, v]) => v != null);
      el("path", { d: pts.map(([i, v], j) => (j ? "L" : "M") + X(i) + " " + Y(v)).join(""), fill: "none",
        stroke: age ? old : s1, "stroke-width": age ? 1.5 : 2.5, "stroke-opacity": age ? Math.max(.25, 1 - age * .14) : 1,
        "stroke-linejoin": "round" }, svg);
      if (!age) pts.forEach(([i, v]) => el("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: s1, stroke: css("--surface"), "stroke-width": 1.5 }, svg));
    });
    document.getElementById("trend-legend").innerHTML = `<span><i style="background:${s1}"></i>${esc(trendState.model)}, newest run (${runName(runs[0])})</span>` +
      (runs.length > 1 ? `<span><i style="background:${old}"></i>${runs.length - 1} earlier run${runs.length > 2 ? "s" : ""}, fainter = older</span>` : "");
    if (runs.length < 2) host.insertAdjacentHTML("beforeend",
      "<p class='blurb' style='margin:8px 0 0'>Only one run of this model so far. Earlier runs appear here as the updates build up.</p>");
    hover(svg, host, dates, W, H, m, X, i => `<div><b>${dayLong(dates[i])}</b> · ${label}</div>` + runs.map((r, a) => {
      const d = r.days.find(x => x.date === dates[i]);
      return d && d[k] != null ? `<div style="${a ? "color:var(--ink-2)" : ""}">${runName(r)}: <b>${d[k]}${unit}</b></div>` : "";
    }).join(""));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      runs.map(r => `<th>${runName(r)}</th>`).join("") + "</tr>" + dates.map(d => `<tr><td>${dayLong(d)}</td>` + runs.map(r => {
        const x = r.days.find(y => y.date === d); return `<td>${x && x[k] != null ? x[k] + unit : "–"}</td>`; }).join("") + "</tr>").join("") +
      "</table></details>");
  }
  // Polar vortex: zonal-mean wind at 60°N per model. Ensembles as mean + 10-90% band, single runs as lines.
  // Colour follows the model family (ECMWF blue, NOAA orange, AIFS aqua, ...), matching the 15-day chart.
  const VCOL = { "ECMWF HRES": 1, "ECMWF ENS": 1, "GFS": 2, "GEFS": 2, "ECMWF AIFS": 3, "AIFS ENS": 3, "GEM": 4,
                 "UKMO": 5, "NOAA AIGFS": 7, "AIGEFS": 7, "NASA GEOS": 6, "ICON": 6, "ARPEGE": 7 };
  // Seven colours for eleven models: ICON (green, as in the 15-day chart) and ARPEGE share a colour with NASA GEOS
  // and NOAA's AI models, so they are dashed wherever they are drawn.
  const VDASH = { "ICON": "6 3", "ARPEGE": "6 3" };
  const swatch = (n, c) => VDASH[n] ? `repeating-linear-gradient(90deg,${c} 0 5px,transparent 5px 8px)` : c;
  const vortexState = { view: "all", level: "10", hidden: new Set() };
  const vVal = (e, d) => e.kind === "single" ? d.u : d.mean;
  const num = v => `${v < 0 ? "−" : ""}${Math.abs(v)}`;
  const ms = v => `${num(v)} m/s`;
  // Ensembles first (their mean and band are the backbone), then single runs, each in model-family order.
  const vOrder = L => (a, b) => (L[b].kind === "ensemble") - (L[a].kind === "ensemble") || (VCOL[a] || 9) - (VCOL[b] || 9);
  function drawVortex() {
    const host = document.getElementById("vortex-chart");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details,p.blurb").forEach(n => n.remove());
    const V = DATA.vortex || {}, L = (V.levels || {})[vortexState.level] || {}, all = vortexState.view === "all";
    const names = Object.keys(L).filter(n => all || L[n].kind === vortexState.view).sort(vOrder(L));
    const color = n => css("--s" + (VCOL[n] || 6));
    const shown = names.filter(n => !vortexState.hidden.has(n));
    const legend = document.getElementById("vortex-legend");
    if (!names.length) {
      legend.innerHTML = "";
      host.insertAdjacentHTML("beforeend", `<p class='blurb'>No ${all ? "" : vortexState.view === "single" ? "single-run " : "ensemble "}data at ${vortexState.level} hPa in this run.</p>`);
      drawVortexTable(); return;
    }
    const dates = [...new Set(names.flatMap(n => L[n].days.map(d => d.date)))].sort();
    // NASA's 1979-2026 climatology for the same dates: how strong the vortex usually is.
    const C = ((V.clim || {})[vortexState.level] || []).filter(c => dates.includes(c.date));
    const clim = d => C.find(c => c.date === d);
    // Axis from every model in the view, so hiding one doesn't rescale; always include the zero line.
    const vals = names.flatMap(n => L[n].days.flatMap(d => L[n].kind === "single" ? [d.u] : [d.p10, d.p90]))
      .concat(C.flatMap(c => [c.p10, c.p90]));
    const y0 = Math.min(-10, Math.floor((Math.min(...vals) - 2) / 10) * 10), y1 = Math.ceil((Math.max(...vals) + 2) / 10) * 10;
    const direct = shown.length <= 4;
    const W = Math.max(host.clientWidth - 36, 300), H = 310, m = { l: 52, r: direct ? 92 : 16, t: 30, b: 28 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `Zonal-mean wind at ${V.lat}°N, ${vortexState.level} hPa, by model` });
    host.appendChild(svg);
    // Easterly zone under the axes, so gridlines stay readable on top of it.
    const slot = (W - m.l - m.r) / dates.length, Yz = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    el("rect", { x: m.l, y: Yz(0), width: W - m.l - m.r, height: Yz(y0) - Yz(0), fill: css("--cold2"), "fill-opacity": .07 }, svg);
    const { X, Y } = dayAxes(svg, dates, W, H, m, y0, y1, 10, "");
    el("text", { x: m.l - 6, y: m.t - 16, "text-anchor": "end", class: "ax" }, svg).textContent = "m/s";
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: css("--ink-2"), "stroke-width": 1.5 }, svg);
    el("text", { x: m.l + 6, y: Y(0) + 14, class: "ax" }, svg).textContent = "Below 0: easterly, a sudden stratospheric warming";
    const ti = dates.indexOf(V.today);
    if (ti > 0) {
      const tx = X(ti) - slot / 2;
      el("line", { x1: tx, x2: tx, y1: m.t, y2: H - m.b, stroke: css("--axis"), "stroke-dasharray": "4 4" }, svg);
      el("text", { x: tx - 4, y: m.t + 10, "text-anchor": "end", class: "ax" }, svg).textContent = "Past";
      el("text", { x: tx + 4, y: m.t + 10, class: "ax" }, svg).textContent = "Forecast";
    }
    if (C.length) {   // normal range first, so every model draws over it
      const ci = c => dates.indexOf(c.date);
      const up = C.map(c => X(ci(c)) + " " + Y(c.p90)), dn = C.map(c => X(ci(c)) + " " + Y(c.p10)).reverse();
      el("path", { d: "M" + up.join("L") + "L" + dn.join("L") + "Z", fill: css("--clim"), "fill-opacity": .16 }, svg);
      el("path", { d: C.map((c, j) => (j ? "L" : "M") + X(ci(c)) + " " + Y(c.mean)).join(""), fill: "none",
        stroke: css("--clim"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
    }
    const at = (n, i) => L[n].days.find(d => d.date === dates[i]);
    const pts = n => dates.map((_, i) => [i, at(n, i)]).filter(([, d]) => d && vVal(L[n], d) != null);
    shown.filter(n => L[n].kind === "ensemble").forEach(n => {
      const up = pts(n).map(([i, d]) => X(i) + " " + Y(d.p90)), dn = pts(n).map(([i, d]) => X(i) + " " + Y(d.p10)).reverse();
      el("path", { d: "M" + up.join("L") + "L" + dn.join("L") + "Z", fill: color(n), "fill-opacity": shown.length > 2 ? .09 : .14 }, svg);
    });
    // With everything on, ensemble means draw heavier than the single runs, so the spread reads first.
    const width = n => !all ? 2 : L[n].kind === "ensemble" ? 2.5 : 1.5;
    shown.forEach(n => el("path", { d: pts(n).map(([i, d], j) => (j ? "L" : "M") + X(i) + " " + Y(vVal(L[n], d))).join(""),
      fill: "none", stroke: color(n), "stroke-width": width(n), "stroke-linejoin": "round",
      ...(VDASH[n] ? { "stroke-dasharray": VDASH[n] } : {}) }, svg));
    if (direct) {   // name each line at its last point, nudged apart so labels never overlap
      const ends = shown.map(n => { const p = pts(n).at(-1); return { n, x: X(p[0]), y: Y(vVal(L[n], p[1])) }; }).sort((a, b) => a.y - b.y);
      ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13; });
      ends.forEach(e => {
        el("circle", { cx: e.x, cy: Y(vVal(L[e.n], pts(e.n).at(-1)[1])), r: 3.5, fill: color(e.n), stroke: css("--surface"), "stroke-width": 1.5 }, svg);
        el("text", { x: W - m.r + 6, y: e.y + 4, class: "ax", style: "fill:var(--ink-2)" }, svg).textContent = e.n;
      });
    }
    legend.innerHTML = names.map(n => `<button type="button" data-k="${esc(n)}" aria-pressed="${!vortexState.hidden.has(n)}">` +
      `<i style="background:${swatch(n, color(n))}"></i>${esc(n)}${L[n].members ? ` (${L[n].members})` : ""}</button>`).join("") +
      (C.length ? `<span><i style="background:${css("--clim")}"></i>Normal for the date (1979–2026 mean, shading 10–90%)</span>` : "");
    legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      vortexState.hidden.has(b.dataset.k) ? vortexState.hidden.delete(b.dataset.k) : vortexState.hidden.add(b.dataset.k); drawVortex(); }));
    hover(svg, host, dates, W, H, m, X, i => `<div><b>${dayLong(dates[i])}</b>${dates[i] < V.today ? " · past" : ""}</div>` +
      (clim(dates[i]) ? `<div style="color:var(--ink-2)">Normal ${ms(clim(dates[i]).mean)} (${ms(clim(dates[i]).p10)} to ${ms(clim(dates[i]).p90)})</div>` : "") + shown.map(n => {
      const d = at(n, i); if (!d) return "";
      return L[n].kind === "single" ? `<div><span style="color:${color(n)}">●</span> ${esc(n)}: <b>${ms(d.u)}</b></div>`
        : `<div><span style="color:${color(n)}">●</span> ${esc(n)}: <b>${ms(d.mean)}</b> (${ms(d.p10)} to ${ms(d.p90)})` +
          (d.pct_easterly ? ` · <b>${d.pct_easterly}%</b> of members easterly` : "") + "</div>";
    }).join(""));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      names.map(n => `<th>${esc(n)}</th>`).join("") + "</tr>" + dates.map((d, i) => `<tr><td>${dayLong(d)}</td>` + names.map(n => {
        const x = at(n, i); return `<td>${!x ? "–" : L[n].kind === "single" ? x.u : `${x.mean} (${x.p10} to ${x.p90})${x.pct_easterly ? `, ${x.pct_easterly}% E` : ""}`}</td>`;
      }).join("") + "</tr>").join("") + "</table></details>");
    drawVortexTable();
  }

  // Every model at the chosen level: wind now, weakest forecast, and whether it reverses.
  function drawVortexTable() {
    const host = document.getElementById("vortex-table");
    if (!host) return;
    const V = DATA.vortex || {}, lev = vortexState.level, L = (V.levels || {})[lev] || {};
    const names = Object.keys(L).sort((a, b) => (L[a].kind === "ensemble") - (L[b].kind === "ensemble") || (VCOL[a] || 9) - (VCOL[b] || 9));
    host.innerHTML = `<table class="grid vt"><tr><th>Model</th><th>Now<small>m/s</small></th><th>Weakest<small>m/s</small></th><th>Easterly?</th></tr>` + names.map(n => {
      const e = L[n], ahead = e.days.filter(d => d.date >= V.today);
      if (!ahead.length) return "";
      const low = ahead.reduce((a, d) => vVal(e, d) < vVal(e, a) ? d : a);
      let verdict;
      if (e.kind === "single") {
        const rev = ahead.find(d => d.u < 0);
        verdict = rev ? `<b>Yes</b>, from ${dayLong(rev.date)}` : "No";
      } else {
        const top = ahead.reduce((a, d) => d.pct_easterly > a.pct_easterly ? d : a);
        // Members reverse on different days, so the share that reverse at all is the probability for the window.
        verdict = e.pct_members_ever_easterly != null
          ? (e.pct_members_ever_easterly ? `<b>${e.pct_members_ever_easterly}%</b> of members on some day${e.reversal_median_date ? `, typically by ${dayLong(e.reversal_median_date)}` : ""}` : "No member")
          : top.pct_easterly ? `<b>${top.pct_easterly}%</b> of members by ${dayLong(top.date)}` : "No member";
      }
      return `<tr><td><span style="color:${css("--s" + (VCOL[n] || 6))}">●</span> ${esc(n)}${e.members ? `<small>mean of ${e.members} members</small>` : ""}</td>` +
        `<td>${num(vVal(e, ahead[0]))}</td><td>${num(vVal(e, low))}<small>${dayLong(low.date)}</small></td><td>${verdict}</td></tr>`;
    }).join("") + "</table>";
    const missing = Object.keys(VCOL).filter(n => !L[n] && Object.values(V.levels || {}).some(l => l[n]));
    // How far ahead each model goes, so a line ending early doesn't look like missing data.
    const reach = Object.keys(L).filter(n => L[n].days.some(d => d.date >= V.today)).map(n => [n, Math.round((Date.parse(L[n].days.at(-1).date) - Date.parse(V.today)) / 864e5)])
      .sort((a, b) => a[1] - b[1]);
    const far = reach.length ? reach.at(-1)[1] : 0, short = reach.filter(r => r[1] <= far - 3);
    const and = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a.at(-1) : a.join("");
    document.getElementById("vortex-note").textContent = (lev === "10"
      ? "10 hPa is the level that defines a sudden stratospheric warming. "
      : "50 hPa is lower down, where a warming has to reach before it affects our weather. ") +
      (short.length ? `Each line ends where that model's forecast does: ${and(short.map(([n, d]) => `${n} at ${d} days`))}; ` +
        `the rest go ${[...new Set([reach.find(r => r[1] > far - 3)[1], far])].join("–")} days. ` : "") +
      (missing.length ? (lev === "10" ? `${and(missing)} stop at 50 hPa, so they are on the 50 hPa view only. `
        : `Not available at 50 hPa: ${missing.join(", ")}. `) : "") +
      (lev === "10" && L.GEFS ? "GEFS at 10 hPa comes straight from NOAA: one reading a day rather than a daily mean, and its past days are the control run's analysis. " : "") +
      "The page's other ensembles (Canadian, Met Office, ICON) aren't available this high up. ECMWF's 46-day view is under All charts, Stratosphere and polar vortex.";
  }

  // Run-to-run for the vortex: what each kept run said about the 10 hPa wind, one model at a time.
  const vtState = { model: "ECMWF ENS" };
  function drawVortexTrend() {
    const host = document.getElementById("vtrend-chart");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details,p.note").forEach(n => n.remove());
    const T = DATA.vortex_trend || {}, names = Object.keys(T).sort((a, b) => (VCOL[a] || 9) - (VCOL[b] || 9));
    if (!T[vtState.model]) vtState.model = names[0];
    const pick = document.getElementById("vtrend-model");
    pick.innerHTML = names.map(n => `<button type="button" data-k="${esc(n)}" aria-pressed="${n === vtState.model}">${esc(n)}</button>`).join("");
    pick.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { vtState.model = b.dataset.k; drawVortexTrend(); }));
    const runs = T[vtState.model] || [];
    if (!runs.length) { host.insertAdjacentHTML("beforeend", "<p class='blurb note'>No vortex data yet.</p>"); return; }
    const dates = [...new Set(runs.flatMap(r => r.days.map(d => d.date)))].sort();
    const vals = runs.flatMap(r => r.days.map(d => d.u)).filter(v => v != null);
    const y0 = Math.min(-10, Math.floor((Math.min(...vals) - 2) / 10) * 10), y1 = Math.ceil((Math.max(...vals) + 2) / 10) * 10;
    const W = Math.max(host.clientWidth - 36, 300), H = 260, m = { l: 52, r: 16, t: 10, b: 28 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Vortex wind at 10 hPa: what each recent ${vtState.model} run forecast` });
    host.appendChild(svg);
    const Yz = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    el("rect", { x: m.l, y: Yz(0), width: W - m.l - m.r, height: Yz(y0) - Yz(0), fill: css("--cold2"), "fill-opacity": .07 }, svg);
    const { X, Y } = dayAxes(svg, dates, W, H, m, y0, y1, 10, "");
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: css("--ink-2"), "stroke-width": 1.5 }, svg);
    const runName = r => new Date(r.run.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + " " + r.run.slice(11, 16) + "Z";
    const s1 = css("--s" + (VCOL[vtState.model] || 6)), old = css("--muted");
    [...runs].reverse().forEach(r => {
      const age = runs.indexOf(r), pts = r.days.map(d => [dates.indexOf(d.date), d.u]).filter(([, v]) => v != null);
      el("path", { d: pts.map(([i, v], j) => (j ? "L" : "M") + X(i) + " " + Y(v)).join(""), fill: "none",
        stroke: age ? old : s1, "stroke-width": age ? 1.5 : 2.5, "stroke-opacity": age ? Math.max(.25, 1 - age * .14) : 1,
        "stroke-linejoin": "round" }, svg);
    });
    document.getElementById("vtrend-legend").innerHTML = `<span><i style="background:${s1}"></i>${esc(vtState.model)}, newest run (${runName(runs[0])})</span>` +
      (runs.length > 1 ? `<span><i style="background:${old}"></i>${runs.length - 1} earlier run${runs.length > 2 ? "s" : ""}, fainter = older</span>` : "");
    if (runs.length < 2) host.insertAdjacentHTML("beforeend",
      "<p class='blurb note' style='margin:8px 0 0'>Only one run of this model so far. Earlier runs appear here as the updates build up.</p>");
    hover(svg, host, dates, W, H, m, X, i => `<div><b>${dayLong(dates[i])}</b> · 10 hPa wind</div>` + runs.map((r, a) => {
      const d = r.days.find(x => x.date === dates[i]);
      return d && d.u != null ? `<div style="${a ? "color:var(--ink-2)" : ""}">${runName(r)}: <b>${ms(d.u)}</b></div>` : "";
    }).join(""));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      runs.map(r => `<th>${runName(r)}</th>`).join("") + "</tr>" + dates.map(d => `<tr><td>${dayLong(d)}</td>` + runs.map(r => {
        const x = r.days.find(y => y.date === d); return `<td>${x && x.u != null ? x.u : "–"}</td>`; }).join("") + "</tr>").join("") +
      "</table></details>");
  }

  // AO and NAO: observed days, then the GEFS forecast mean with its 10-90% band. Same units, so one axis.
  function drawTelecon() {
    const host = document.getElementById("telecon");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const T = DATA.telecon || {}, names = ["AO", "NAO"].filter(k => T[k]);
    if (!names.length) return;
    const col = { AO: css("--s1"), NAO: css("--s2") };
    const series = k => T[k].observed.map(d => ({ date: d.date, v: d.value, obs: true }))
      .concat(T[k].forecast.map(d => ({ date: d.date, v: d.mean, lo: d.p10, hi: d.p90, neg: d.pct_negative })));
    const dates = [...new Set(names.flatMap(k => series(k).map(d => d.date)))].sort();
    const vals = names.flatMap(k => series(k).flatMap(d => [d.v, d.lo, d.hi])).filter(v => v != null);
    const ext = Math.max(2, Math.ceil(Math.max(...vals.map(Math.abs))));
    const W = Math.max(host.clientWidth, 300), H = 240, m = { l: 34, r: 40, t: 10, b: 28 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Arctic and North Atlantic Oscillation indices, observed and forecast" });
    host.appendChild(svg);
    const { X, Y } = dayAxes(svg, dates, W, H, m, -ext, ext, 1, "");
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: css("--ink-2"), "stroke-width": 1.5 }, svg);
    el("text", { x: m.l + 6, y: Y(-ext) - 6, class: "ax" }, svg).textContent = "Negative: blocking, colder spells more likely";
    el("text", { x: m.l + 6, y: Y(ext) + 12, class: "ax" }, svg).textContent = "Positive: mild westerlies";
    const f0 = dates.indexOf(T[names[0]].forecast[0]?.date);
    if (f0 > 0) {
      const tx = X(f0) - (W - m.l - m.r) / dates.length / 2;
      el("line", { x1: tx, x2: tx, y1: m.t, y2: H - m.b, stroke: css("--axis"), "stroke-dasharray": "4 4" }, svg);
      el("text", { x: tx + 4, y: Y(ext) + 26, class: "ax" }, svg).textContent = "Forecast";
    }
    names.forEach(k => {
      const fc = series(k).filter(d => d.lo != null);
      const up = fc.map(d => X(dates.indexOf(d.date)) + " " + Y(d.hi)), dn = fc.map(d => X(dates.indexOf(d.date)) + " " + Y(d.lo)).reverse();
      el("path", { d: "M" + up.join("L") + "L" + dn.join("L") + "Z", fill: col[k], "fill-opacity": .12 }, svg);
    });
    names.forEach(k => {
      const s = series(k);
      el("path", { d: s.map((d, j) => (j ? "L" : "M") + X(dates.indexOf(d.date)) + " " + Y(d.v)).join(""), fill: "none",
        stroke: col[k], "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      const last = s.at(-1);
      el("text", { x: W - m.r + 6, y: Y(last.v) + 4 + (k === "NAO" && names.length > 1 && Math.abs(Y(last.v) - Y(series("AO").at(-1).v)) < 12 ? 12 : 0),
        class: "ax", style: "fill:var(--ink-2)" }, svg).textContent = k;
    });
    document.getElementById("telecon-legend").innerHTML = names.map(k =>
      `<span><i style="background:${col[k]}"></i>${k === "AO" ? "Arctic Oscillation (AO)" : "North Atlantic Oscillation (NAO)"}</span>`).join("") +
      "<span>Shading: 80% of the 31 GEFS members</span>";
    hover(svg, host, dates, W, H, m, X, i => `<div><b>${dayLong(dates[i])}</b></div>` + names.map(k => {
      const d = series(k).find(x => x.date === dates[i]); if (!d) return "";
      return `<div><span style="color:${col[k]}">●</span> ${k}: <b>${d.v > 0 ? "+" : ""}${d.v}</b>` +
        (d.obs ? " observed" : ` (${d.lo} to ${d.hi}, ${d.neg}% of members negative)`) + "</div>";
    }).join(""));
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      names.map(k => `<th>${k}</th>`).join("") + "</tr>" + dates.map(dt => `<tr><td>${dayLong(dt)}</td>` + names.map(k => {
        const d = series(k).find(x => x.date === dt); return `<td>${!d ? "–" : d.obs ? d.v + " (obs)" : `${d.v} (${d.lo} to ${d.hi})`}</td>`;
      }).join("") + "</tr>").join("") + "</table></details>");
  }

  // Next 48 hours: three small panels sharing one time axis (temperature, rain, wind), night shaded.
  const WMO = { 0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow",
    73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail" };
  const hourLabel = t => new Date(t + ":00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) + " " + t.slice(11, 16);
  function drawHourly() {
    const host = document.getElementById("hourly");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const R = DATA.hourly || [], n = R.length;
    if (!n) return;
    const W = Math.max(host.clientWidth - 36, 300), m = { l: 40, r: 12, t: 22, b: 26 };
    const P = [{ h: 150, label: "Temperature, °C" }, { h: 80, label: "Rain, mm in the hour" }, { h: 100, label: "Wind, km/h" }];
    let top = m.t; P.forEach(p => { p.y = top; top += p.h + 30; });
    const H = top - 30 + m.b, slot = (W - m.l - m.r) / n, X = i => m.l + (i + .5) * slot;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Hourly temperature, rain and wind for the next 48 hours" });
    host.appendChild(svg);
    // Night: hours before sunrise or after sunset, merged into one block per night.
    const S = DATA.sun || {};
    const night = R.map(r => { const d = S[r.t.slice(0, 10)], hm = r.t.slice(11, 16); return d ? hm < d.sunrise || hm > d.sunset : false; });
    for (let i = 0; i < n; i++) {
      if (!night[i] || (i && night[i - 1])) continue;
      let j = i; while (j + 1 < n && night[j + 1]) j++;
      P.forEach(p => el("rect", { x: X(i) - slot / 2, y: p.y, width: (j - i + 1) * slot, height: p.h, fill: css("--neutral"), "fill-opacity": .7 }, svg));
    }
    const axis = (p, y0, y1, step) => {
      const Y = v => p.y + (y1 - v) / (y1 - y0) * p.h;
      for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? css("--axis") : css("--grid"), "stroke-width": 1 }, svg);
        el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "ax" }, svg).textContent = Math.round(v * 10) / 10;
      }
      el("text", { x: m.l, y: p.y - 8, class: "ax", style: "fill:var(--ink-2)" }, svg).textContent = p.label;
      return Y;
    };
    const line = (Y, key, color, dash, w = 2) => el("path", { d: R.map((r, i) => r[key] == null ? "" : (i ? "L" : "M") + X(i) + " " + Y(r[key])).join(""),
      fill: "none", stroke: color, "stroke-width": w, "stroke-linejoin": "round", ...(dash ? { "stroke-dasharray": dash } : {}) }, svg);
    const tv = R.flatMap(r => [r.temp, r.feels]).filter(v => v != null);
    const tStep = Math.max(...tv) - Math.min(...tv) > 12 ? 4 : 2;
    const Yt = axis(P[0], Math.floor((Math.min(...tv) - 1) / tStep) * tStep, Math.ceil((Math.max(...tv) + 1) / tStep) * tStep, tStep);
    const s1 = css("--s1"), s3 = css("--s3");
    line(Yt, "feels", s1, "4 3", 1.5); line(Yt, "temp", s1);
    const pMax = Math.max(1, Math.ceil(Math.max(...R.map(r => r.precip || 0))));
    const Yr = axis(P[1], 0, pMax, pMax > 4 ? Math.ceil(pMax / 4) : pMax > 1 ? 1 : .5);
    const s7 = css("--s7");
    const snowy = r => (r.snow_cm || 0) > 0;
    R.forEach((r, i) => { if (r.precip > 0) el("rect", { x: X(i) - slot / 2 + 1, y: Yr(r.precip), width: Math.max(1, slot - 2),
      height: Yr(0) - Yr(r.precip), rx: Math.min(2, slot / 4), fill: snowy(r) ? s7 : s1 }, svg); });
    // Ice risk: at or below 1 °C within 6 hours of rain or sleet, marked along the foot of the temperature panel.
    const icy = R.map((r, i) => r.temp != null && r.temp <= 1 && R.slice(Math.max(0, i - 6), i + 1).some(x => (x.precip || 0) >= 0.1));
    icy.forEach((on, i) => { if (on) el("rect", { x: X(i) - slot / 2, y: P[0].y + P[0].h - 5, width: slot, height: 5, fill: css("--cold2") }, svg); });
    const gMax = Math.max(20, ...R.map(r => r.gust_kmh || 0));
    const Yw = axis(P[2], 0, Math.ceil((gMax + 5) / 20) * 20, 20);
    line(Yw, "gust_kmh", s3, "4 3", 1.5); line(Yw, "wind_kmh", s3);
    R.forEach((r, i) => {   // day boundaries, and a time label every 6 hours
      const h = +r.t.slice(11, 13);
      if (h === 0 && i) el("line", { x1: X(i) - slot / 2, x2: X(i) - slot / 2, y1: m.t, y2: H - m.b, stroke: css("--axis") }, svg);
      if (h % 6 === 0 && slot * 6 > 34) el("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "ax" }, svg).textContent =
        h === 0 ? new Date(r.t + ":00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) : r.t.slice(11, 16);
    });
    const dashed = c => `background:repeating-linear-gradient(90deg, ${c} 0 4px, transparent 4px 7px)`;
    document.getElementById("hourly-legend").innerHTML = `<span><i style="background:${s1}"></i>Temperature</span>` +
      `<span><i style="${dashed(s1)}"></i>Feels like</span><span><i style="background:${s1};height:8px;width:8px"></i>Rain</span>` +
      (R.some(snowy) ? `<span><i style="background:${s7};height:8px;width:8px"></i>Snow</span>` : "") +
      (icy.some(Boolean) ? `<span><i style="background:${css("--cold2")};height:5px"></i>Ice risk</span>` : "") +
      `<span><i style="background:${s3}"></i>Wind</span><span><i style="${dashed(s3)}"></i>Gusts</span>` +
      `<span><i style="background:${css("--neutral")};height:10px"></i>Night</span>`;
    hover(svg, host, R, W, H, m, X, i => { const r = R[i];
      return `<div><b>${hourLabel(r.t)}</b> · ${WMO[r.code] || ""}</div><div>${r.temp}°, feels like ${r.feels}°</div>` +
        `<div>${snowy(r) ? `Snow ${r.snow_cm} cm` : "Rain"} ${r.precip} mm · ${r.pop ?? "–"}% chance</div><div>Wind ${Math.round(r.wind_kmh)} km/h, gusts ${Math.round(r.gust_kmh)} km/h</div>` +
        (r.freezing_m != null ? `<div style="color:var(--ink-2)">Freezing level ${Math.round(r.freezing_m / 50) * 50} m</div>` : "") +
        (icy[i] ? `<div><b>Ice risk</b></div>` : ""); });
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Time</th><th>Weather</th><th>°C</th><th>Feels</th><th>Rain mm</th><th>Chance</th><th>Wind</th><th>Gusts</th></tr>` +
      R.map(r => `<tr><td>${hourLabel(r.t)}</td><td>${WMO[r.code] || ""}</td><td>${r.temp}</td><td>${r.feels}</td><td>${r.precip}</td><td>${r.pop ?? "–"}%</td><td>${Math.round(r.wind_kmh)}</td><td>${Math.round(r.gust_kmh)}</td></tr>`).join("") +
      "</table></details>");
  }

  // Early warning signs: one line per single run (colour by model family, as above), NASA's normal band where there
  // is one, and a Past | Forecast divider.
  const early = { pcap: { hidden: new Set() }, hflux: { hidden: new Set() } };
  function drawEarly(id, key, unit, label) {
    const host = document.getElementById(id + "-chart");
    if (!host) return;
    host.querySelectorAll("svg,.tip,details").forEach(n => n.remove());
    const V = DATA.vortex || {}, E = (V.early || {})[key];
    const legend = document.getElementById(id + "-legend");
    if (!E) { legend.innerHTML = "<span>No data in this run.</span>"; return; }
    const M = E.models, names = Object.keys(M).sort((a, b) => (VCOL[a] || 9) - (VCOL[b] || 9)), st = early[id];
    const shown = names.filter(n => !st.hidden.has(n)), color = n => css("--s" + (VCOL[n] || 6));
    const dates = [...new Set(names.flatMap(n => M[n].map(d => d.date)))].sort();
    const C = (E.clim || []).filter(c => dates.includes(c.date));
    const vals = names.flatMap(n => M[n].map(d => d.v)).concat(C.flatMap(c => [c.p10, c.p90])).filter(v => v != null);
    const span = Math.max(...vals) - Math.min(...vals), step = [1, 2, 5, 10, 20].find(s => span / s <= 6) || 50;
    const y0 = Math.floor((Math.min(...vals) - step / 2) / step) * step, y1 = Math.ceil((Math.max(...vals) + step / 2) / step) * step;
    const W = Math.max(host.clientWidth - 36, 280), H = 240, m = { l: 42, r: 12, t: 10, b: 28 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    host.insertBefore(svg, legend);
    const { X, Y } = dayAxes(svg, dates, W, H, m, y0, y1, step, unit);
    const ti = dates.indexOf(V.today);
    if (ti > 0) {
      const tx = X(ti) - (W - m.l - m.r) / dates.length / 2;
      el("line", { x1: tx, x2: tx, y1: m.t, y2: H - m.b, stroke: css("--axis"), "stroke-dasharray": "4 4" }, svg);
      el("text", { x: tx + 4, y: m.t + 10, class: "ax" }, svg).textContent = "Forecast";
    }
    if (C.length) {
      const ci = c => dates.indexOf(c.date);
      el("path", { d: "M" + C.map(c => X(ci(c)) + " " + Y(c.p90)).join("L") + "L" + C.map(c => X(ci(c)) + " " + Y(c.p10)).reverse().join("L") + "Z",
        fill: css("--clim"), "fill-opacity": .16 }, svg);
      el("path", { d: C.map((c, j) => (j ? "L" : "M") + X(ci(c)) + " " + Y(c.mean)).join(""), fill: "none", stroke: css("--clim"),
        "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
    }
    shown.forEach(n => el("path", { d: M[n].filter(d => d.v != null).map((d, j) => (j ? "L" : "M") + X(dates.indexOf(d.date)) + " " + Y(d.v)).join(""),
      fill: "none", stroke: color(n), "stroke-width": 2, "stroke-linejoin": "round", ...(VDASH[n] ? { "stroke-dasharray": VDASH[n] } : {}) }, svg));
    legend.innerHTML = names.map(n => `<button type="button" data-k="${esc(n)}" aria-pressed="${!st.hidden.has(n)}"><i style="background:${swatch(n, color(n))}"></i>${esc(n)}</button>`).join("") +
      (C.length ? `<span><i style="background:${css("--clim")}"></i>Normal (10–90%)</span>` : "");
    legend.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      st.hidden.has(b.dataset.k) ? st.hidden.delete(b.dataset.k) : st.hidden.add(b.dataset.k); drawEarly(id, key, unit, label); }));
    hover(svg, host, dates, W, H, m, X, i => {
      const c = C.find(x => x.date === dates[i]);
      return `<div><b>${dayLong(dates[i])}</b>${dates[i] < V.today ? " · past" : ""}</div>` +
        (c ? `<div style="color:var(--ink-2)">Normal ${c.mean}${unit} (${c.p10} to ${c.p90})</div>` : "") +
        shown.map(n => { const d = M[n].find(x => x.date === dates[i]);
          return d && d.v != null ? `<div><span style="color:${color(n)}">●</span> ${esc(n)}: <b>${d.v}${unit}</b></div>` : ""; }).join("");
    });
    host.insertAdjacentHTML("beforeend", `<details><summary>Show as a table</summary><table class="data"><tr><th>Day</th>` +
      names.map(n => `<th>${esc(n)}</th>`).join("") + "</tr>" + dates.map(dt => `<tr><td>${dayLong(dt)}</td>` + names.map(n => {
        const d = M[n].find(x => x.date === dt); return `<td>${d && d.v != null ? d.v : "–"}</td>`; }).join("") + "</tr>").join("") + "</table></details>");
    if (key === "heat_flux_100" && E.now) document.getElementById("hflux-note").textContent =
      `NASA's 45-day average over 45–75°N, the usual measure of how hard the vortex is being pushed, is ${E.now.value} K m/s: ${E.now.vs_climate} (${dayLong(E.now.date)}).`;
  }

  // Rain radar: RainViewer's last two hours over a plain base map. Leaflet loads only when the page has the map.
  function initRadar() {
    const box = document.getElementById("radar");
    if (!box) return;
    const status = document.getElementById("radar-time");
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onerror = () => { status.textContent = "Radar unavailable right now"; };
    s.onload = () => {
      const { lat, lon, timezone } = DATA.loc;
      const map = L.map(box, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false }).setView([lat, lon], 7);
      const theme = document.documentElement.dataset.theme;
      const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
      // OpenStreetMap's own tiles (free with attribution), dimmed in dark mode so the radar stands out.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 10, className: dark ? "base-dark" : "", attribution: "© OpenStreetMap contributors" }).addTo(map);
      L.circleMarker([lat, lon], { radius: 5, color: css("--ink"), weight: 2, fillColor: css("--surface"), fillOpacity: 1 }).addTo(map);
      fetch("https://api.rainviewer.com/public/weather-maps.json").then(r => r.json()).then(j => {
        const frames = (j.radar && j.radar.past) || [];
        if (!frames.length) throw new Error("no radar frames");
        // RainViewer's free tiles stop at zoom 7; Leaflet scales them up beyond that.
        const layers = frames.map(f => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
          { opacity: 0, maxNativeZoom: 7, maxZoom: 10, attribution: "Radar © RainViewer" }).addTo(map));
        const slider = document.getElementById("radar-frame"), play = document.getElementById("radar-play");
        slider.max = frames.length - 1;
        let cur = frames.length - 1, timer = null;
        const show = i => {
          layers[cur].setOpacity(0); cur = i; layers[i].setOpacity(.8); slider.value = i;
          status.textContent = new Date(frames[i].time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) +
            (i === frames.length - 1 ? " (latest)" : "");
        };
        show(cur);
        slider.addEventListener("input", () => show(+slider.value));
        play.addEventListener("click", () => {
          if (timer) { clearInterval(timer); timer = null; play.textContent = "Play"; return; }
          play.textContent = "Pause"; timer = setInterval(() => show((cur + 1) % frames.length), 600);
        });
      }).catch(() => { status.textContent = "Radar unavailable right now"; });
    };
    document.head.appendChild(s);
  }

  // Model viewer: every deterministic map at one lead time, side by side.
  function drawViewer() {
    const host = document.getElementById("viewer");
    if (!host) return;
    const V = DATA.viewer || [], hours = [...new Set(V.map(c => c.hour))].sort((a, b) => a - b);
    const pick = document.getElementById("lead-pick");
    let cur = +(pick.dataset.h || hours[0]);
    const show = () => {
      pick.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.h === cur));
      host.innerHTML = V.filter(c => c.hour === cur).map(c => {
        const cap = `${c.title} · +${c.hour}h · ${c.source} · run ${c.run}${c.note ? ": " + c.note : ""}`;
        return `<figure><button type="button" data-full="${esc(c.src)}" data-cap="${esc(cap)}"><img src="${esc(c.src)}" alt="${esc(c.title)}" loading="lazy"></button>` +
          `<figcaption><div><b>${esc(c.model)}</b> · ${esc(c.title)}</div><div class="src">${esc(c.source)} · run ${esc(c.run)}</div>` +
          (c.note ? `<div class="note">${esc(c.note)}</div>` : "") + "</figcaption></figure>";
      }).join("");
    };
    if (!pick.children.length) {
      const day = h => h < 24 ? `+${h}h` : `Day ${Math.round(h / 24 * 10) / 10}`;
      pick.innerHTML = hours.map(h => `<button type="button" data-h="${h}">+${h}h <span class="muted">(${day(h)}, ${V.filter(c => c.hour === h).length})</span></button>`).join("");
      pick.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { cur = +b.dataset.h; pick.dataset.h = cur; show(); }));
    }
    show();
  }

  // Each deterministic model's daily numbers: days down, models across; shaded by value for highs/rain/gusts.
  const mnState = { metric: "tmax" };
  function drawModelNumbers() {
    const host = document.getElementById("mn-table");
    if (!host) return;
    const M = DATA.models || {}, names = Object.keys(M), k = mnState.metric;
    if (!names.length) { host.innerHTML = "<p class='blurb'>No per-model numbers in this run.</p>"; return; }
    const dates = [...new Set(names.flatMap(n => M[n].map(r => r.date)))].sort();
    const unit = { tmax: "°", tmin: "°", precip: " mm", gust_kmh: " km/h" }[k];
    const vals = names.flatMap(n => M[n].map(r => r[k])).filter(v => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pct = v => hi > lo ? Math.round(10 + 80 * (v - lo) / (hi - lo)) : 30;
    host.innerHTML = `<table class="grid"><tr><th></th>${names.map(n => `<th>${esc(n)}</th>`).join("")}<th>Spread</th></tr>` +
      dates.map(d => {
        const row = names.map(n => (M[n].find(r => r.date === d) || {})[k]);
        const got = row.filter(v => v != null);
        const spread = got.length > 1 ? Math.round((Math.max(...got) - Math.min(...got)) * 10) / 10 : null;
        return `<tr><td>${dayLong(d)}</td>` + row.map(v => v == null ? `<td class="muted">–</td>`
          : `<td class="shade${pct(v) >= 75 ? " hi" : ""}" style="--p:${pct(v)}%">${Math.round(v * 10) / 10}${unit}</td>`).join("") +
          `<td class="muted">${spread == null ? "–" : spread + unit}</td></tr>`;
      }).join("") + "</table>";
  }

  // Scorecard: models down, lead times across. Darker = bigger error (or more rain days called right).
  const scoreState = { metric: "temp_mae", truth: "era5" };
  function drawScore() {
    const host = document.getElementById("score-table");
    if (!host) return;
    // The airport's own highs and lows are a second truth (temperatures only: METARs carry no rain amounts).
    const base = DATA.score || {}, st = scoreState.truth === "station" && base.station && base.station.scores ? base.station : null;
    const S = st ? { ...st, recent: [] } : base, scores = S.scores || {}, names = Object.keys(scores);
    const k = st && scoreState.metric === "wet_dry_hit_pct" ? "temp_mae" : scoreState.metric;
    const rainBtn = document.querySelector('#score-metric [data-m="wet_dry_hit_pct"]');
    if (rainBtn) rainBtn.style.display = st ? "none" : "";
    const leads = [...new Set(names.flatMap(n => Object.keys(scores[n])))].map(Number).sort((a, b) => a - b);
    const isErr = k === "temp_mae";
    const best = {};
    leads.forEach(l => { const v = names.map(n => scores[n][l]?.[k]).filter(x => x != null);
      best[l] = v.length ? (isErr ? Math.min(...v) : Math.max(...v)) : null; });
    const all = names.flatMap(n => leads.map(l => scores[n][l]?.[k])).filter(v => v != null);
    const lo = Math.min(...all), hi = Math.max(...all);
    const pct = v => hi > lo ? Math.round(10 + 80 * (v - lo) / (hi - lo)) : 30;
    host.innerHTML = `<table class="grid"><tr><th></th>${leads.map(l => `<th>${l} day${l > 1 ? "s" : ""} ahead</th>`).join("")}</tr>` +
      names.map(n => `<tr><td>${esc(n)}</td>` + leads.map(l => {
        const s = scores[n][l]; if (!s) return `<td class="muted">–</td>`;
        const v = s[k], tip = `${n}, ${l} day(s) ahead, ${s.days} days checked: typical error ${s.temp_mae}°C; highs ${s.tmax_bias > 0 ? "+" : ""}${s.tmax_bias}°, lows ${s.tmin_bias > 0 ? "+" : ""}${s.tmin_bias}° on average` + (s.wet_dry_hit_pct != null ? `; rain/no-rain right ${s.wet_dry_hit_pct}% of days` : "");
        return `<td class="shade${pct(v) >= 75 ? " hi" : ""}${v === best[l] ? " best" : ""}" style="--p:${pct(v)}%" title="${esc(tip)}">${v}${isErr ? "°" : "%"}</td>`;
      }).join("") + "</tr>").join("") + "</table>";
    document.getElementById("score-note").textContent = (isErr
      ? "Average miss on daily highs and lows, in °C. Lower is better. "
      : "Share of days the model correctly said whether there would be more than 1 mm of rain. Higher is better. ") +
      (st ? `Checked against ${st.truth}: the airport's half-hourly readings, so the day's extremes are slightly understated. ` : "") +
      `Outlined = best at that range. ${S.from} to ${S.to}. Hover or tap-and-hold a cell for its bias.` +
      (names.some(n => n.startsWith("Claude")) ? " Claude (this page) is the written forecast above, scored the same way; for rain, its medium or high risk counts as calling rain." : "");
    const rec = S.recent || [];
    document.getElementById("score-recent").parentElement.style.display = st ? "none" : "";
    if (rec.length) document.getElementById("score-recent").innerHTML = `<table class="grid"><tr><th>Day</th><th>Happened</th>${names.map(n => `<th>${esc(n)}</th>`).join("")}</tr>` +
      rec.map(r => `<tr><td>${dayLong(r.date)}</td><td class="obs">${r.obs.tmax}° / ${r.obs.tmin}° · ${r.obs.precip} mm</td>` +
        names.map(n => { const f = r.fc_3day[n]; return f ? `<td>${f.tmax}° / ${f.tmin}° · ${f.precip != null ? f.precip + " mm" : f.risk + " rain risk"}</td>` : "<td class='muted'>–</td>"; }).join("") + "</tr>").join("") + "</table>";
  }

  // How old each model run is, from the reader's clock.
  document.querySelectorAll("#runs-age td[data-run]").forEach(td => {
    const h = Math.round((Date.now() - new Date(td.dataset.run)) / 3600e3);
    td.textContent += ` · ${h < 48 ? h + " h" : Math.round(h / 24) + " days"} old`;
  });

  if (document.getElementById("point")) segment("point-metric", pointState, drawPoint);
  if (document.getElementById("mn-table")) segment("mn-metric", mnState, drawModelNumbers);
  if (document.getElementById("score-table")) segment("score-metric", scoreState, drawScore);
  if (document.getElementById("score-truth")) segment("score-truth", scoreState, drawScore, "truth");
  drawViewer(); drawModelNumbers(); drawScore();
  segment("trend-metric", trendState, drawTrend);
  if (document.getElementById("vortex-chart")) {
    segment("vortex-view", vortexState, drawVortex, "view"); segment("vortex-level", vortexState, drawVortex, "level");
  }

  const draw = () => { drawHourly(); drawPoint(); drawPlume(); drawTrend(); drawSeasonal(); drawVortex(); drawVortexTrend(); drawTelecon();
    drawEarly("pcap", "polar_cap_t10", "°", "Temperature over the pole at 10 hPa by model, with the normal range");
    drawEarly("hflux", "heat_flux_100", "", "Eddy heat flux at 100 hPa around 60°N by model"); };
  draw();
  initRadar();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
})();
