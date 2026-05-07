<script setup lang="ts">
// Compatibility matrix — per-(device × transport) interactive grid.
// Reads `_matrix-data.json` (built by scripts/build-matrix-page.mjs)
// and renders one row per device with per-transport badges. Hovering
// a propagated cell reveals provenance ("Likely works via …").
//
// Rung vocabulary mirrors @thermal-label/contracts:EffectiveStatus:
//   verified | expected | partial | unverified | unsupported
//
// `expected` is surfaced as "Likely works" — the docs-site audience
// doesn't need to learn the propagation jargon.

import { ref, computed, onMounted, onUnmounted } from 'vue';
import data from '../../hardware/_matrix-data.json';

type Status = 'verified' | 'expected' | 'partial' | 'unverified' | 'unsupported';
type TransportType = 'usb' | 'tcp' | 'serial' | 'bluetooth-spp' | 'bluetooth-gatt';

interface Provenance {
  vector: 'sibling-protocol' | 'cross-transport';
  from: { deviceKey: string; transport: TransportType };
}

interface Cell {
  status: Status;
  propagatedFrom?: Provenance[];
}

interface Row {
  driver: string;
  family: string;
  manufacturer: string;
  key: string;
  name: string;
  slug: string;
  transports: TransportType[];
  cells: Partial<Record<TransportType, Cell>>;
  supportStatus: Status;
  multiEngine: boolean;
  registryIndex: number;
}

interface DriverMeta {
  name: string;
  displayName: string;
  manufacturer: string;
  published: boolean;
  glyph: string;
  deviceCount: number;
}

const TRANSPORTS = data.transports as TransportType[];
const TRANSPORT_LABELS = data.transportLabels as Record<TransportType, string>;
const STATUS_LABELS = data.statusLabels as Record<Status, string>;
const ALL_STATUSES: Status[] = ['verified', 'expected', 'partial', 'unverified', 'unsupported'];

const allRows = data.rows as Row[];
const drivers = data.drivers as DriverMeta[];

const search = ref('');
const selectedFamilies = ref<Set<string>>(new Set());
// Filter chips operate on the device-level `supportStatus` rollup —
// "show me every row that's at least Verified-rolled-up" — rather than
// individual cells. That matches the user's intent ("which devices
// work?") more closely than a per-cell filter.
const selectedStatuses = ref<Set<Status>>(new Set());

function detailHref(row: Row): string {
  // Per-device pages still live at /hardware/<driver>/<slug> — built by
  // scripts/build-hardware-page.mjs for currently-published drivers,
  // and not yet for `published: false` drivers. The matrix shows all
  // 8 drivers but only published-driver rows have working detail
  // links; incoming-driver rows will render the link as text.
  return `/hardware/${row.driver}/${row.slug}`;
}

function rowHasDetailPage(row: Row): boolean {
  const meta = drivers.find(d => d.name === row.driver);
  return !!meta?.published;
}

function matchesSearch(row: Row, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    row.name.toLowerCase().includes(lower) ||
    row.key.toLowerCase().includes(lower) ||
    row.family.toLowerCase().includes(lower)
  );
}

const filteredRows = computed(() => {
  const fams = selectedFamilies.value;
  const sts = selectedStatuses.value;
  const q = search.value.trim();
  return allRows.filter(row => {
    if (fams.size > 0 && !fams.has(row.family)) return false;
    if (sts.size > 0 && !sts.has(row.supportStatus)) return false;
    if (!matchesSearch(row, q)) return false;
    return true;
  });
});

const counts = computed(() => {
  const c: Record<Status, number> = {
    verified: 0, expected: 0, partial: 0, unverified: 0, unsupported: 0,
  };
  for (const r of allRows) c[r.supportStatus]++;
  return c;
});

function toggleFamily(name: string) {
  if (selectedFamilies.value.has(name)) selectedFamilies.value.delete(name);
  else selectedFamilies.value.add(name);
  selectedFamilies.value = new Set(selectedFamilies.value);
}

function toggleStatus(s: Status) {
  if (selectedStatuses.value.has(s)) selectedStatuses.value.delete(s);
  else selectedStatuses.value.add(s);
  selectedStatuses.value = new Set(selectedStatuses.value);
}

function clearAll() {
  selectedFamilies.value = new Set();
  selectedStatuses.value = new Set();
  search.value = '';
}

function cellTitle(row: Row, t: TransportType, cell: Cell | undefined): string {
  const tlabel = TRANSPORT_LABELS[t] ?? t;
  if (!cell) return `${row.name} — ${tlabel}: not declared`;
  const slabel = STATUS_LABELS[cell.status] ?? cell.status;
  if (cell.status === 'expected' && cell.propagatedFrom?.length) {
    const sources = cell.propagatedFrom.map(p => {
      const fromTLabel = TRANSPORT_LABELS[p.from.transport] ?? p.from.transport;
      return p.vector === 'sibling-protocol'
        ? `sibling-protocol from ${p.from.deviceKey} ${fromTLabel}`
        : `cross-transport from ${p.from.deviceKey} ${fromTLabel}`;
    });
    return `${row.name} — ${tlabel}: ${slabel} (${sources.join('; ')})`;
  }
  return `${row.name} — ${tlabel}: ${slabel}`;
}

const familyOptions = computed(() =>
  drivers.map(d => ({
    value: d.displayName,
    label: d.displayName,
    count: allRows.filter(r => r.family === d.displayName).length,
  })),
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    document.body.classList.add('hw-table-hydrated');
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    document.body.classList.remove('hw-table-hydrated');
  }
});
</script>

<template>
  <div class="cmx-root">
    <div class="cmx-controls">
      <input
        v-model="search"
        class="cmx-search"
        type="search"
        placeholder="Search model (e.g. QL-820, LW_450, Aimo)"
        aria-label="Search by model name or key"
      />
      <span class="cmx-result-count" aria-live="polite">
        {{ filteredRows.length }} / {{ allRows.length }} devices
      </span>
    </div>

    <div class="cmx-chips" role="group" aria-label="Filter by status">
      <button
        v-for="s in ALL_STATUSES"
        :key="s"
        :class="['cmx-chip', `cmx-chip--${s}`, { 'cmx-chip--active': selectedStatuses.has(s) }]"
        @click="toggleStatus(s)"
      >
        <span class="cmx-chip-dot" :class="`cmx-cell--${s}`" aria-hidden="true"></span>
        {{ STATUS_LABELS[s] }}
        <span class="cmx-chip-count">{{ counts[s] }}</span>
      </button>
      <button
        class="cmx-clear"
        @click="clearAll"
        :disabled="selectedStatuses.size === 0 && selectedFamilies.size === 0 && !search"
      >
        Clear
      </button>
    </div>

    <div class="cmx-chips" role="group" aria-label="Filter by family">
      <button
        v-for="opt in familyOptions"
        :key="opt.value"
        :class="['cmx-chip', { 'cmx-chip--active': selectedFamilies.has(opt.value) }]"
        @click="toggleFamily(opt.value)"
      >
        {{ opt.label }}
        <span class="cmx-chip-count">{{ opt.count }}</span>
      </button>
    </div>

    <div v-if="filteredRows.length === 0" class="cmx-empty">
      <p>No devices match these filters.</p>
      <button class="cmx-clear" @click="clearAll">Clear filters</button>
    </div>

    <table v-else class="cmx-table">
      <thead>
        <tr>
          <th scope="col">Driver</th>
          <th scope="col">Model</th>
          <th
            v-for="t in TRANSPORTS"
            :key="t"
            scope="col"
            class="cmx-th-transport"
          >{{ TRANSPORT_LABELS[t] }}</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredRows" :key="row.driver + '/' + row.key">
          <td class="cmx-td-driver">{{ row.family }}</td>
          <td>
            <a
              v-if="rowHasDetailPage(row)"
              :href="detailHref(row)"
              class="cmx-name-link"
            >{{ row.name }}</a>
            <span v-else class="cmx-name-text">{{ row.name }}</span>
          </td>
          <td v-for="t in TRANSPORTS" :key="t" class="cmx-td-cell">
            <span
              v-if="row.cells[t]"
              :class="['cmx-cell', `cmx-cell--${row.cells[t]!.status}`]"
              :title="cellTitle(row, t, row.cells[t])"
            >
              <span class="cmx-cell-label">{{ STATUS_LABELS[row.cells[t]!.status] }}</span>
            </span>
            <span v-else class="cmx-cell cmx-cell--missing" aria-hidden="true">—</span>
          </td>
          <td class="cmx-td-notes">
            <span v-if="row.multiEngine" class="cmx-note">multi-engine — no inferred lifts</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.cmx-root {
  font-size: 14px;
  --cmx-verified: #22c55e;
  --cmx-expected: #86efac;
  --cmx-partial: #f59e0b;
  --cmx-unverified: #94a3b8;
  --cmx-unsupported: #ef4444;
}

.cmx-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.cmx-search {
  flex: 1 1 220px;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
}

.cmx-search:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -1px;
}

.cmx-result-count {
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cmx-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.cmx-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font-size: 0.8125rem;
}

.cmx-chip:hover {
  border-color: var(--vp-c-brand-2);
}

.cmx-chip--active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.cmx-chip-count {
  padding: 0 0.4rem;
  background: var(--vp-c-bg-soft);
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.cmx-chip-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  display: inline-block;
}

.cmx-clear {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.8125rem;
}

.cmx-clear:hover:not(:disabled) {
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-brand-1);
}

.cmx-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cmx-empty {
  text-align: center;
  padding: 2rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.cmx-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.cmx-table th,
.cmx-table td {
  padding: 0.4rem 0.55rem;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: middle;
}

.cmx-table th {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.cmx-th-transport {
  text-align: center;
}

.cmx-td-driver {
  white-space: nowrap;
  color: var(--vp-c-text-2);
}

.cmx-td-cell {
  text-align: center;
}

.cmx-td-notes {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}

.cmx-name-link {
  font-weight: 500;
  color: var(--vp-c-brand);
  text-decoration: none;
}

.cmx-name-link:hover { text-decoration: underline; }

.cmx-name-text {
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.cmx-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 5.5rem;
  padding: 0.18rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}

.cmx-cell--verified {
  background: var(--cmx-verified);
  color: #fff;
}

.cmx-cell--expected {
  /* Pale-fill rather than outline — "this should work" reads as
     softly-positive; outline reads as "uncertain." */
  background: var(--cmx-expected);
  color: #064e3b;
}

.cmx-cell--partial {
  background: var(--cmx-partial);
  color: #1c1917;
}

.cmx-cell--unverified {
  background: var(--vp-c-bg-soft);
  color: var(--cmx-unverified);
  border: 1px solid var(--vp-c-divider);
}

.cmx-cell--unsupported {
  background: var(--cmx-unsupported);
  color: #fff;
}

.cmx-cell--missing {
  color: var(--vp-c-text-3);
  background: transparent;
  border: none;
  min-width: 0;
}

.cmx-note {
  font-style: italic;
}
</style>
