// The Sky Is Falling
// D3 v7 + NASA/JPL CNEOS fireball data (snapshot saved in assets/fireballs.json)

'use strict';

// ---------- helpers ----------

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const fmtInt = d3.format(',');
const fmtPct = d3.format('.0%');
const fmtDate = d3.utcFormat('%b %-d, %Y');

// show small energies with more decimals than big ones
function fmtEnergy(x) {
  if (x < 0.1) return d3.format('.3~f')(x);
  if (x < 10) return d3.format('.2~f')(x);
  return d3.format('.0f')(x);
}

// colors
const BLUE = '#2b6a9b';
const RED = '#c0392b';
const GRAY = '#cccccc';
const OCEAN = '#e6eef4';
const LAND = '#d6d6d0';

// map dots use the viridis scale on a log axis (energy covers several orders of magnitude)
const energyColor = d3.scaleSequentialLog(d3.interpolateViridis).domain([0.01, 500]).clamp(true);

// places we named by hand for the three biggest events
const placeNames = {
  '2013-02-15': 'Chelyabinsk, Russia',
  '2018-12-18': 'Bering Sea',
  '2009-10-08': 'Sulawesi, Indonesia'
};

function eventName(e) {
  return placeNames[e.date.slice(0, 10)] || fmtDate(new Date(e.id + 'Z'));
}

function isChelyabinsk(e) {
  return e.date.startsWith('2013-02-15');
}

function coordText(e) {
  const lat = Math.abs(e.lat).toFixed(1) + '°' + (e.lat < 0 ? 'S' : 'N');
  const lon = Math.abs(e.lon).toFixed(1) + '°' + (e.lon < 0 ? 'W' : 'E');
  return lat + ', ' + lon;
}

// ---------- state ----------

let events = [];          // all 1,050 events
let located = [];         // events that have a latitude and longitude
let filtered = [];        // located events that pass the atlas controls
let landShape, borderShape;
let selected = null;
let totalEnergy = 0;

let mode = 'globe';       // 'globe' or 'map'
let rotation = [-32, -20, 0];
let projection;
let points = [];          // screen positions of the dots currently drawn
let dragged = false;
let playTimer = null;

const canvas = $('#globe');
const ctx = canvas.getContext('2d');
let canvasWidth = 0;
let canvasHeight = 0;

// ---------- tooltip ----------

const tip = $('#tooltip');

function showTip(html, event, node) {
  tip.innerHTML = html;
  tip.hidden = false;
  const box = node ? node.getBoundingClientRect() : null;
  const x = event ? event.clientX : box ? box.x : 100;
  const y = event ? event.clientY : box ? box.y : 100;
  const left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 14);
  const top = Math.min(window.innerHeight - tip.offsetHeight - 8, y + 12);
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function hideTip() {
  tip.hidden = true;
}

function eventTipHtml(e) {
  const alt = e.alt === null ? 'Altitude not reported' : e.alt + ' km at peak brightness';
  const place = e.lat === null ? 'Location not reported' : coordText(e);
  return '<strong>' + eventName(e) + '</strong><br>' +
    fmtEnergy(e.energy) + ' kt estimated energy<br>' +
    alt + '<br>' + place + '<br>' + e.date + ' UTC';
}

// attach a tooltip to a d3 selection (works with mouse and keyboard focus)
function addTip(selection, makeHtml) {
  selection
    .on('pointermove', (event, d) => showTip(makeHtml(d), event))
    .on('pointerleave', hideTip)
    .on('focus', function (event, d) { showTip(makeHtml(d), null, this); })
    .on('blur', hideTip);
}

// ---------- chart helpers ----------

function chartWidth(selector, fallback) {
  const w = $(selector).clientWidth || fallback;
  return Math.max(300, Math.min(fallback, w));
}

function makeSvg(selector, width, height) {
  const container = d3.select(selector);
  container.selectAll('*').remove();
  return container.append('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
}

function energyAxis(x) {
  const [low, high] = x.domain();
  const ticks = [0.01, 0.1, 1, 10, 100, 1000].filter(t => t >= low && t <= high);
  return d3.axisBottom(x).tickValues(ticks).tickFormat(fmtEnergy).tickSizeOuter(0);
}

// ---------- atlas (globe / world map) ----------

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvasWidth * ratio;
  canvas.height = canvasHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawAtlas();
}

function drawAtlas() {
  if (!landShape || !canvasWidth) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const radius = Math.min(canvasWidth, canvasHeight) * 0.45;

  if (mode === 'globe') {
    projection = d3.geoOrthographic().translate([cx, cy]).scale(radius)
      .rotate(rotation).clipAngle(90);
  } else {
    projection = d3.geoEqualEarth()
      .fitExtent([[10, 10], [canvasWidth - 10, canvasHeight - 10]], { type: 'Sphere' });
  }
  const path = d3.geoPath(projection, ctx);

  // ocean
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = OCEAN;
  ctx.fill();
  ctx.strokeStyle = '#8a9aa5';
  ctx.lineWidth = 1;
  ctx.stroke();

  // grid lines
  ctx.beginPath();
  path(d3.geoGraticule10());
  ctx.strokeStyle = '#c5d2dc';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // land and country borders
  ctx.beginPath();
  path(landShape);
  ctx.fillStyle = LAND;
  ctx.fill();
  ctx.beginPath();
  path(borderShape);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // event dots
  points = [];
  const center = mode === 'globe' ? projection.invert([cx, cy]) : null;
  for (const e of filtered) {
    // on the globe, skip events on the far side
    if (mode === 'globe' && d3.geoDistance([e.lon, e.lat], center) > Math.PI / 2 - 0.015) continue;
    const p = projection([e.lon, e.lat]);
    if (!p) continue;
    points.push({ e: e, x: p[0], y: p[1] });

    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = energyColor(e.energy);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // circle and label around the selected event
  if (selected) {
    const s = points.find(p => p.e.id === selected.id);
    if (s) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.stroke();

      const label = eventName(selected);
      ctx.font = '13px system-ui, sans-serif';
      const textWidth = ctx.measureText(label).width;
      let lx = s.x + 14;
      if (lx + textWidth > canvasWidth - 8) lx = s.x - textWidth - 14;
      const ly = s.y - 12;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(lx - 3, ly - 13, textWidth + 6, 18);
      ctx.fillStyle = '#222';
      ctx.fillText(label, lx, ly);
    }
  }
}

function showEvent(e, rotate = true) {
  selected = e;
  $('#event-select').value = e.id;
  $('#event-date').textContent = 'Date: ' + fmtDate(new Date(e.id + 'Z')) + ', ' + e.date.slice(11) + ' UTC';
  $('#event-energy').textContent = 'Estimated energy: ' + fmtEnergy(e.energy) + ' kt of TNT';
  $('#event-alt').textContent = e.alt === null
    ? 'Altitude at peak brightness: not reported'
    : 'Altitude at peak brightness: ' + e.alt + ' km';
  $('#event-location').textContent = 'Location at peak brightness: ' + coordText(e);
  if (rotate && mode === 'globe') {
    rotation = [-e.lon, -Math.max(-60, Math.min(60, e.lat)), 0];
  }
  drawAtlas();
}

// redraw the atlas after the year slider or energy filter changes
function updateAtlas() {
  const year = +$('#year').value;
  const minEnergy = +$('#energy-filter').value;

  const matching = events.filter(e => e.year <= year && e.energy >= minEnergy);
  filtered = matching.filter(e => e.lat !== null && e.lon !== null);
  filtered.sort((a, b) => a.energy - b.energy); // draw big events last so they stay on top

  $('#year-label').textContent = year;
  $('#visible-count').textContent = 'Showing ' + fmtInt(filtered.length) + ' events with a location (' +
    fmtInt(matching.length - filtered.length) + ' more have no location).';

  // event menu, biggest first
  const options = [...filtered].sort((a, b) => b.energy - a.energy);
  d3.select('#event-select').selectAll('option')
    .data(options, d => d.id)
    .join('option')
    .attr('value', d => d.id)
    .text(d => eventName(d) + ' (' + fmtEnergy(d.energy) + ' kt)');

  if (filtered.length === 0) {
    selected = null;
    $('#event-select').disabled = true;
    $('#random-event').disabled = true;
    $('#event-date').textContent = 'No events match these settings.';
    $('#event-energy').textContent = '';
    $('#event-alt').textContent = '';
    $('#event-location').textContent = '';
    drawAtlas();
    return;
  }
  $('#event-select').disabled = false;
  $('#random-event').disabled = false;
  const keep = filtered.find(e => selected && e.id === selected.id);
  showEvent(keep || options[0], false);
}

function stopPlaying() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  $('#play').textContent = 'Play';
}

function startPlaying() {
  const slider = $('#year');
  if (+slider.value >= 2025) slider.value = 1988;
  updateAtlas();
  $('#play').textContent = 'Pause';
  playTimer = setInterval(() => {
    if (+slider.value >= 2025) {
      stopPlaying();
      return;
    }
    slider.value = +slider.value + 1;
    updateAtlas();
  }, 380);
}

function setMode(newMode) {
  mode = newMode;
  $('input[name=view][value=' + newMode + ']').checked = true;
  drawAtlas();
}

function setupAtlas() {
  selected = events.find(isChelyabinsk);
  updateAtlas();
  resizeCanvas();

  // legend gradient uses the same color scale as the dots
  const stops = d3.range(0, 1.01, 0.1).map(t => {
    const value = 10 ** (Math.log10(0.01) + t * (Math.log10(500) - Math.log10(0.01)));
    return energyColor(value) + ' ' + (t * 100) + '%';
  });
  $('#legend-bar').style.background = 'linear-gradient(to right, ' + stops.join(', ') + ')';

  $('#year').addEventListener('input', () => { stopPlaying(); updateAtlas(); });
  $('#energy-filter').addEventListener('change', () => { stopPlaying(); updateAtlas(); });
  $('#event-select').addEventListener('change', event => {
    showEvent(filtered.find(d => d.id === event.target.value));
  });
  $('#random-event').addEventListener('click', () => {
    showEvent(filtered[Math.floor(Math.random() * filtered.length)]);
  });
  $('#play').addEventListener('click', () => {
    if (playTimer) stopPlaying(); else startPlaying();
  });
  $$('input[name=view]').forEach(radio => {
    radio.addEventListener('change', () => setMode(radio.value));
  });

  $('#reset-atlas').addEventListener('click', () => {
    stopPlaying();
    $('#year').value = 2025;
    $('#energy-filter').value = 0;
    rotation = [-32, -20, 0];
    selected = events.find(isChelyabinsk);
    setMode('globe');
    updateAtlas();
  });

  $('#locate-chely').addEventListener('click', () => {
    stopPlaying();
    $('#year').value = 2025;
    $('#energy-filter').value = 0;
    setMode('globe');
    updateAtlas();
    showEvent(events.find(isChelyabinsk));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#atlas').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  });

  // drag to rotate the globe
  let startRotation, startPos;
  d3.select(canvas).call(d3.drag()
    .on('start', event => {
      dragged = false;
      startRotation = [...rotation];
      startPos = [event.x, event.y];
      hideTip();
    })
    .on('drag', event => {
      if (mode !== 'globe') return;
      const dx = event.x - startPos[0];
      const dy = event.y - startPos[1];
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
      rotation = [startRotation[0] + dx * 0.35, Math.max(-80, Math.min(80, startRotation[1] - dy * 0.3)), 0];
      drawAtlas();
    }));

  // tooltip for the dot closest to the mouse
  canvas.addEventListener('pointermove', event => {
    if (event.buttons || points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let closest = points[0];
    for (const p of points) {
      if (Math.hypot(p.x - x, p.y - y) < Math.hypot(closest.x - x, closest.y - y)) closest = p;
    }
    if (Math.hypot(closest.x - x, closest.y - y) < 10) {
      showTip(eventTipHtml(closest.e), event);
      canvas.style.cursor = 'pointer';
    } else {
      hideTip();
      canvas.style.cursor = mode === 'globe' ? 'grab' : 'default';
    }
  });
  canvas.addEventListener('pointerleave', hideTip);

  // click a dot to select it
  canvas.addEventListener('click', event => {
    if (dragged) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = points.find(p => Math.hypot(p.x - x, p.y - y) < 9);
    if (hit) showEvent(hit.e, false);
  });

  // arrow keys rotate the globe
  canvas.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
    const move = moves[event.key];
    if (!move || mode !== 'globe') return;
    event.preventDefault();
    rotation[0] += move[0];
    rotation[1] = Math.max(-80, Math.min(80, rotation[1] + move[1]));
    drawAtlas();
  });

  new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlaying(); });
}

// ---------- histogram with threshold ----------

function drawHistogram() {
  const w = chartWidth('#histogram', 840);
  const h = 260;
  const m = { l: 45, r: 15, t: 24, b: 46 };
  const svg = makeSvg('#histogram', w, h);

  const x = d3.scaleLog().domain([0.01, 1000]).range([m.l, w - m.r]);
  const bins = d3.bin()
    .domain([0.01, 1000])
    .thresholds(d3.range(-2, 3.01, 0.25).map(d => 10 ** d))(events.map(e => e.energy));
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([h - m.b, m.t]);

  svg.append('g').attr('class', 'grid').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

  const bars = svg.append('g').selectAll('rect').data(bins).join('rect')
    .attr('x', d => x(Math.max(d.x0, 0.01)) + 1)
    .attr('y', d => y(d.length))
    .attr('width', d => Math.max(0, x(d.x1) - x(Math.max(d.x0, 0.01)) - 2))
    .attr('height', d => y(0) - y(d.length))
    .attr('fill', BLUE)
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', d => fmtEnergy(d.x0) + ' to ' + fmtEnergy(d.x1) + ' kt: ' + d.length + ' events');
  addTip(bars, d => '<strong>' + fmtInt(d.length) + ' events</strong><br>' + fmtEnergy(d.x0) + ' to ' + fmtEnergy(d.x1) + ' kt');

  svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(energyAxis(x));
  svg.append('text').attr('class', 'axis-title').attr('x', m.l).attr('y', 10).text('Number of events');
  svg.append('text').attr('class', 'axis-title').attr('x', (w + m.l) / 2).attr('y', h - 6)
    .attr('text-anchor', 'middle')
    .text(w < 450 ? 'Estimated energy (kt), log scale' : 'Estimated energy (kt of TNT), log scale');

  const line = svg.append('line').attr('y1', m.t).attr('y2', h - m.b)
    .attr('stroke', RED).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
  const label = svg.append('text').attr('class', 'annotation').attr('y', m.t - 6).text('threshold');

  function update() {
    const value = 10 ** +$('#threshold').value;
    const above = events.filter(e => e.energy >= value);
    const share = d3.sum(above, e => e.energy) / totalEnergy;

    $('#threshold-value').textContent = fmtEnergy(value) + ' kt';
    $('#threshold-count').textContent = fmtInt(above.length);
    $('#threshold-share').textContent = fmtPct(share);

    bars.attr('fill', d => d.x1 <= value ? GRAY : BLUE);
    line.attr('x1', x(value)).attr('x2', x(value));
    label.attr('x', x(value) + 5);
  }
  $('#threshold').oninput = update;
  update();
}

// ---------- ranking of the largest events ----------

let withoutChely = false;

function drawRanking() {
  const start = withoutChely ? 1 : 0;
  const data = [...events].sort((a, b) => b.energy - a.energy).slice(start, start + 5);

  const w = chartWidth('#ranking', 840);
  const h = 250;
  const m = { l: w < 450 ? 125 : 160, r: 50, t: 5, b: 50 };
  const svg = makeSvg('#ranking', w, h);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.energy)]).nice().range([m.l, w - m.r]);
  const y = d3.scaleBand().domain(data.map(d => d.id)).range([m.t, h - m.b]).padding(0.4);

  svg.append('g').attr('class', 'grid').attr('transform', 'translate(0,' + (h - m.b) + ')')
    .call(d3.axisBottom(x).ticks(4).tickSize(-(h - m.t - m.b)).tickFormat(''));

  const rows = svg.selectAll('.row').data(data).join('g')
    .attr('class', 'row')
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', d => eventName(d) + ': ' + d.energy + ' kilotons')
    .attr('transform', d => 'translate(0,' + y(d.id) + ')');

  rows.append('rect').attr('x', m.l).attr('width', d => x(d.energy) - x(0))
    .attr('height', y.bandwidth()).attr('fill', d => isChelyabinsk(d) ? RED : BLUE);
  rows.append('text').attr('x', m.l - 10).attr('y', y.bandwidth() / 2 + 4)
    .attr('text-anchor', 'end').text(eventName);
  rows.append('text').attr('x', d => x(d.energy) + 6).attr('y', y.bandwidth() / 2 + 4)
    .text(d => fmtEnergy(d.energy));
  addTip(rows, eventTipHtml);

  svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')')
    .call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));
  svg.append('text').attr('class', 'axis-title').attr('x', (m.l + w - m.r) / 2).attr('y', h - 6)
    .attr('text-anchor', 'middle').text('Estimated energy (kt of TNT)');

  $('#rank-note').textContent = withoutChely
    ? 'Without Chelyabinsk the axis is rescaled, and the other large events are easier to compare.'
    : 'The axis is linear here, so the Chelyabinsk bar makes all of the other events look small.';
}

// ---------- altitude vs energy scatterplot ----------

function drawScatter() {
  const zoomed = $('#scatter-zoom').checked;
  const data = events.filter(e => e.alt !== null && (!zoomed || e.energy < 10));

  const w = chartWidth('#scatter', 840);
  const h = 380;
  const m = { l: 50, r: 22, t: 24, b: 50 };
  const svg = makeSvg('#scatter', w, h);

  const x = d3.scaleLog().domain([0.01, zoomed ? 10 : 1000]).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain([0, Math.max(70, d3.max(events, e => e.alt))]).nice().range([h - m.b, m.t]);

  svg.append('g').attr('class', 'grid').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
  svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(energyAxis(x));

  svg.append('text').attr('class', 'axis-title').attr('x', m.l).attr('y', 11).text('Altitude (km)');
  svg.append('text').attr('class', 'axis-title').attr('x', (w + m.l) / 2).attr('y', h - 6)
    .attr('text-anchor', 'middle')
    .text(w < 450 ? 'Estimated energy (kt), log scale' : 'Estimated energy (kt of TNT), log scale');

  const dots = svg.append('g').selectAll('circle').data(data).join('circle')
    .attr('cx', d => x(d.energy))
    .attr('cy', d => y(d.alt))
    .attr('r', d => isChelyabinsk(d) ? 5 : 3.5)
    .attr('fill', d => isChelyabinsk(d) ? RED : BLUE)
    .attr('fill-opacity', d => isChelyabinsk(d) ? 1 : 0.45)
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', d => eventName(d) + ', ' + d.energy + ' kt, ' + d.alt + ' km');
  addTip(dots, eventTipHtml);

  const chely = data.find(isChelyabinsk);
  if (chely) {
    svg.append('text').attr('class', 'annotation')
      .attr('x', x(chely.energy) + 4).attr('y', y(chely.alt) + 22)
      .attr('text-anchor', 'end').text('Chelyabinsk (23.3 km)');
  }

  svg.append('text').attr('x', w - m.r).attr('y', 11).attr('text-anchor', 'end')
    .text(fmtInt(data.length) + ' events shown');
}

// ---------- events per year ----------

function drawAnnual() {
  const w = chartWidth('#annual', 840);
  const h = 280;
  const m = { l: 36, r: 12, t: 20, b: 46 };
  const svg = makeSvg('#annual', w, h);

  const data = d3.range(1988, 2026).map(year => ({ year: year, n: events.filter(e => e.year === year).length }));
  const x = d3.scaleBand().domain(data.map(d => d.year)).range([m.l, w - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.n)]).nice().range([h - m.b, m.t]);

  svg.append('g').attr('class', 'grid').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('transform', 'translate(' + m.l + ',0)')
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

  const bars = svg.selectAll('.bar').data(data).join('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d.year))
    .attr('y', d => y(d.n))
    .attr('width', x.bandwidth())
    .attr('height', d => y(0) - y(d.n))
    .attr('fill', d => d.year === 2013 ? RED : BLUE)
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', d => d.year + ': ' + d.n + ' reported events');
  addTip(bars, d => '<strong>' + d.year + '</strong><br>' + d.n + ' reported events' +
    (d.year === 1988 ? '<br>The record starts in April' : ''));

  svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')')
    .call(d3.axisBottom(x).tickValues([1988, 1995, 2000, 2005, 2010, 2015, 2020, 2025]).tickSizeOuter(0));
  svg.append('text').attr('class', 'axis-title').attr('x', (m.l + w - m.r) / 2).attr('y', h - 6)
    .attr('text-anchor', 'middle').text('Year of peak brightness (UTC)');
  svg.append('text').attr('class', 'axis-title').attr('x', m.l).attr('y', 10).text('Reported events');
}

// ---------- hemispheres ----------

function drawHemispheres() {
  const data = [
    { name: 'Northern', n: located.filter(e => e.lat > 0).length },
    { name: 'Southern', n: located.filter(e => e.lat < 0).length },
    { name: 'Equator (0°)', n: located.filter(e => e.lat === 0).length }
  ];

  const w = chartWidth('#hemispheres', 840);
  const h = 190;
  const m = { l: 100, r: 50, t: 8, b: 46 };
  const svg = makeSvg('#hemispheres', w, h);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.n)]).nice().range([m.l, w - m.r]);
  const y = d3.scaleBand().domain(data.map(d => d.name)).range([m.t, h - m.b]).padding(0.35);

  svg.append('g').attr('class', 'grid').attr('transform', 'translate(0,' + (h - m.b) + ')')
    .call(d3.axisBottom(x).ticks(4).tickSize(-(h - m.t - m.b)).tickFormat(''));

  const rows = svg.selectAll('.row').data(data).join('g')
    .attr('class', 'row')
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', d => d.name + ': ' + d.n + ' located events')
    .attr('transform', d => 'translate(0,' + y(d.name) + ')');

  rows.append('rect').attr('x', m.l).attr('width', d => x(d.n) - x(0))
    .attr('height', y.bandwidth()).attr('fill', BLUE);
  rows.append('text').attr('x', m.l - 10).attr('y', y.bandwidth() / 2 + 4)
    .attr('text-anchor', 'end').text(d => d.name);
  rows.append('text').attr('x', d => x(d.n) + 6).attr('y', y.bandwidth() / 2 + 4).text(d => d.n);
  addTip(rows, d => '<strong>' + d.name + '</strong><br>' + d.n + ' located events (' +
    fmtPct(d.n / located.length) + ' of events with a location)');

  svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')')
    .call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));
  svg.append('text').attr('class', 'axis-title').attr('x', (m.l + w - m.r) / 2).attr('y', h - 6)
    .attr('text-anchor', 'middle').text('Number of events with a location');
}

// ---------- missing data grid ----------

function drawMissing(type) {
  const have = events.filter(e => type === 'location' ? e.lat !== null : e.alt !== null).length;
  const missing = events.length - have;
  const name = type === 'location' ? 'location' : 'altitude';

  // one square per event: the first `have` squares are events with the measurement
  const squares = d3.range(events.length).map(i => i >= have);
  d3.select('#missing-grid').selectAll('i').data(squares).join('i')
    .attr('class', d => d ? 'absent' : null);
  $('#missing-grid').setAttribute('aria-label',
    fmtInt(have) + ' of ' + fmtInt(events.length) + ' events have a ' + name + ' and ' + missing + ' do not.');

  $('#grid-legend').innerHTML = '<i class="have"></i>Has ' + name + ' (' + fmtInt(have) + ')' +
    '<i class="none"></i>Missing ' + name + ' (' + fmtInt(missing) + ')';

  const share = fmtPct(missing / events.length);
  $('#missing-text').textContent = type === 'location'
    ? missing + ' of ' + fmtInt(events.length) + ' events (' + share + ') have no location, so they cannot be put on the map. ' +
      'They are still in the energy and yearly charts, because a missing location does not mean a missing fireball.'
    : missing + ' of ' + fmtInt(events.length) + ' events (' + share + ') have no altitude, so they cannot be in the scatterplot. ' +
      'The pattern there only describes the ' + fmtInt(have) + ' events that were measured.';
}

// ---------- other controls ----------

function setupControls() {
  $$('input[name=ranking]').forEach(radio => {
    radio.addEventListener('change', () => {
      withoutChely = radio.value === 'without';
      hideTip();
      drawRanking();
    });
  });

  $('#scatter-zoom').addEventListener('change', () => { hideTip(); drawScatter(); });

  $$('input[name=coverage]').forEach(radio => {
    radio.addEventListener('change', () => drawMissing(radio.value));
  });

  $$('[data-answer]').forEach(button => {
    button.addEventListener('click', () => {
      $$('[data-answer]').forEach(b => b.classList.toggle('selected', b === button));
      const result = $('#prediction-result');
      result.hidden = false;
      result.textContent = button.dataset.answer === 'no'
        ? 'Right. Events with similar energy reach peak brightness at very different heights, so energy alone does not decide the altitude. Hover over a few neighboring points to compare.'
        : 'Not quite. Events with similar energy reach peak brightness at different heights, so there is no strict pattern. Hover over a few neighboring points to compare.';
    });
  });

  window.addEventListener('scroll', hideTip, { passive: true });

  // redraw the charts when the window size changes
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawHistogram();
      drawRanking();
      drawScatter();
      drawAnnual();
      drawHemispheres();
    }, 120);
  });
}

// ---------- start ----------

async function init() {
  try {
    const [data, world] = await Promise.all([
      d3.json('assets/fireballs.json'),
      d3.json('assets/world.json')
    ]);
    events = data.events;
    located = events.filter(e => e.lat !== null && e.lon !== null);
    totalEnergy = d3.sum(events, e => e.energy);
    landShape = topojson.feature(world, world.objects.land);
    borderShape = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);

    // numbers used in the text
    const small = events.filter(e => e.energy < 1).length;
    $('#small-share').textContent = fmtPct(small / events.length);
    $('#largest-share').textContent = fmtPct(d3.max(events, e => e.energy) / totalEnergy);

    $('#load-status').hidden = true;
    setupAtlas();
    drawHistogram();
    drawRanking();
    drawScatter();
    drawAnnual();
    drawHemispheres();
    drawMissing('location');
    setupControls();
    document.documentElement.dataset.ready = 'true';
  } catch (err) {
    console.error(err);
    $('#load-status').textContent = 'The data could not load. Please refresh the page. You can still download the data below.';
  }
}

init();
