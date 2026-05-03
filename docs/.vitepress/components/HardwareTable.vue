<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import data from '../../hardware/_data.json';

interface Row {
  key: string;
  driver: string;
  family: string;
  name: string;
  transports: string[];
  status: 'verified' | 'partial' | 'broken' | 'untested';
  slug: string;
}

interface DriverMeta {
  name: string;
  displayName: string;
  package: string;
  version: string;
  totalDevices: number;
}

const STATUS_ORDER: Record<string, number> = data.statusOrder;
const STATUS_LABEL: Record<string, string> = {
  verified: '✅ verified',
  partial:  '⚠️ partial',
  broken:   '❌ broken',
  untested: '· untested',
};
const STATUS_LIST = ['verified', 'partial', 'broken', 'untested'] as const;
const TRANSPORT_LIST = ['usb', 'tcp', 'serial', 'bluetooth-spp', 'bluetooth-gatt'] as const;
const TRANSPORT_LABEL: Record<string, string> = {
  usb: 'USB',
  tcp: 'TCP',
  serial: 'Serial',
  'bluetooth-spp': 'BT SPP',
  'bluetooth-gatt': 'BT LE',
};

const allRows: Row[] = data.rows as Row[];
const familyList = (data.drivers as DriverMeta[]).map(d => d.displayName);

const search = ref('');
const selectedFamilies = ref<Set<string>>(new Set());
const selectedStatuses = ref<Set<string>>(new Set());
const selectedTransports = ref<Set<string>>(new Set());

type SortKey = 'family' | 'name' | 'status';
type SortDir = 'asc' | 'desc' | null;

const sortKey = ref<SortKey>('family');
const sortDir = ref<SortDir>('asc');

function detailHref(row: Row): string {
  return `/hardware/${row.driver}/${row.slug}`;
}

function matchesSearch(row: Row, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return row.name.toLowerCase().includes(lower) || row.key.toLowerCase().includes(lower);
}

const filteredRows = computed(() => {
  const fams = selectedFamilies.value;
  const sts = selectedStatuses.value;
  const trs = selectedTransports.value;
  const q = search.value.trim();
  return allRows.filter(row => {
    if (fams.size > 0 && !fams.has(row.family)) return false;
    if (sts.size > 0 && !sts.has(row.status)) return false;
    if (trs.size > 0) {
      const hits = [...trs].some(t => row.transports.includes(t));
      if (!hits) return false;
    }
    if (!matchesSearch(row, q)) return false;
    return true;
  });
});

const sortedRows = computed(() => {
  const rows = [...filteredRows.value];
  const dir = sortDir.value;
  if (!dir) return rows;
  const mul = dir === 'asc' ? 1 : -1;
  const k = sortKey.value;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (k) {
      case 'family': cmp = a.family.localeCompare(b.family); break;
      case 'name':   cmp = a.name.localeCompare(b.name); break;
      case 'status': cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99); break;
    }
    if (cmp === 0) cmp = a.family.localeCompare(b.family) || a.name.localeCompare(b.name);
    return cmp * mul;
  });
  return rows;
});

const counts = computed(() => {
  const c = { verified: 0, partial: 0, broken: 0, untested: 0 };
  for (const r of allRows) c[r.status as keyof typeof c]++;
  return c;
});

function toggleSet(set: Set<string>, value: string) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function cycleSort(key: SortKey) {
  if (sortKey.value !== key) {
    sortKey.value = key;
    sortDir.value = 'asc';
    return;
  }
  if (sortDir.value === 'asc') sortDir.value = 'desc';
  else if (sortDir.value === 'desc') sortDir.value = null;
  else sortDir.value = 'asc';
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key || !sortDir.value) return '';
  return sortDir.value === 'asc' ? ' ▲' : ' ▼';
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key || !sortDir.value) return 'none';
  return sortDir.value === 'asc' ? 'ascending' : 'descending';
}

function clearAll() {
  selectedFamilies.value = new Set();
  selectedStatuses.value = new Set();
  selectedTransports.value = new Set();
  search.value = '';
}

// URL hash state
function serializeState(): string {
  const parts: string[] = [];
  if (selectedFamilies.value.size > 0) parts.push('family=' + [...selectedFamilies.value].map(encodeURIComponent).join(','));
  if (selectedStatuses.value.size > 0) parts.push('status=' + [...selectedStatuses.value].join(','));
  if (selectedTransports.value.size > 0) parts.push('transport=' + [...selectedTransports.value].join(','));
  if (search.value) parts.push('q=' + encodeURIComponent(search.value));
  if (sortKey.value !== 'family' || sortDir.value !== 'asc') {
    parts.push('sort=' + sortKey.value + '-' + (sortDir.value ?? 'none'));
  }
  return parts.length === 0 ? '' : parts.join('&');
}

function deserializeState(hash: string) {
  const cleaned = hash.replace(/^#/, '');
  if (!cleaned) {
    clearAll();
    sortKey.value = 'family';
    sortDir.value = 'asc';
    return;
  }
  const params = new URLSearchParams(cleaned);
  selectedFamilies.value = new Set(params.get('family')?.split(',').map(decodeURIComponent).filter(Boolean) ?? []);
  selectedStatuses.value = new Set(params.get('status')?.split(',').filter(Boolean) ?? []);
  selectedTransports.value = new Set(params.get('transport')?.split(',').filter(Boolean) ?? []);
  search.value = decodeURIComponent(params.get('q') ?? '');
  const sort = params.get('sort');
  if (sort) {
    const [k, d] = sort.split('-');
    if (['family', 'name', 'status'].includes(k)) {
      sortKey.value = k as SortKey;
      sortDir.value = (d === 'asc' || d === 'desc') ? d : null;
    }
  }
}

let suppressHashWrite = false;

function onHashChange() {
  suppressHashWrite = true;
  deserializeState(window.location.hash);
  suppressHashWrite = false;
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    deserializeState(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('hashchange', onHashChange);
  }
});

watch([selectedFamilies, selectedStatuses, selectedTransports, search, sortKey, sortDir], () => {
  if (suppressHashWrite || typeof window === 'undefined') return;
  const next = serializeState();
  const target = next ? '#' + next : window.location.pathname + window.location.search;
  history.replaceState(null, '', target);
}, { deep: true });

function transportTagLabel(t: string): string {
  return TRANSPORT_LABEL[t] ?? t;
}
</script>

<template>
  <div class="hw-table-root">
    <!-- Filter chips + search -->
    <div class="hw-controls">
      <label class="hw-search-label">
        <span class="hw-search-text">Search</span>
        <input
          v-model="search"
          class="hw-search-input"
          type="search"
          placeholder="Model name or key (e.g. QL-820, LW_450)"
          aria-label="Search by model name or key"
        />
      </label>

      <div class="hw-facet">
        <h4 class="hw-facet-title">Family</h4>
        <div class="hw-chips">
          <button
            v-for="f in familyList"
            :key="f"
            class="hw-chip"
            :class="{ active: selectedFamilies.has(f) }"
            :aria-pressed="selectedFamilies.has(f)"
            @click="toggleSet(selectedFamilies, f)"
          >
            {{ f }}
          </button>
        </div>
      </div>

      <div class="hw-facet">
        <h4 class="hw-facet-title">Status</h4>
        <div class="hw-chips">
          <button
            v-for="s in STATUS_LIST"
            :key="s"
            class="hw-chip"
            :class="['hw-chip-' + s, { active: selectedStatuses.has(s) }]"
            :aria-pressed="selectedStatuses.has(s)"
            @click="toggleSet(selectedStatuses, s)"
          >
            {{ STATUS_LABEL[s] }} ({{ counts[s] }})
          </button>
        </div>
      </div>

      <div class="hw-facet">
        <h4 class="hw-facet-title">Transport</h4>
        <div class="hw-chips">
          <button
            v-for="t in TRANSPORT_LIST"
            :key="t"
            class="hw-chip"
            :class="{ active: selectedTransports.has(t) }"
            :aria-pressed="selectedTransports.has(t)"
            @click="toggleSet(selectedTransports, t)"
          >
            {{ transportTagLabel(t) }}
          </button>
        </div>
      </div>

      <div class="hw-facet hw-facet-toggle">
        <button
          class="hw-clear"
          @click="clearAll"
          :disabled="selectedFamilies.size === 0 && selectedStatuses.size === 0 && selectedTransports.size === 0 && !search"
        >
          Clear filters
        </button>
      </div>
    </div>

    <p class="hw-result-count" aria-live="polite">
      Showing {{ sortedRows.length }} of {{ allRows.length }} devices
    </p>

    <div v-if="sortedRows.length === 0" class="hw-empty">
      <p>No devices match these filters.</p>
      <button class="hw-clear" @click="clearAll">Clear filters</button>
    </div>

    <table v-else class="hw-table">
      <thead>
        <tr>
          <th scope="col" :aria-sort="ariaSort('family')">
            <button class="hw-sort-btn" @click="cycleSort('family')">Family{{ sortIndicator('family') }}</button>
          </th>
          <th scope="col" :aria-sort="ariaSort('name')">
            <button class="hw-sort-btn" @click="cycleSort('name')">Model{{ sortIndicator('name') }}</button>
          </th>
          <th scope="col">Transports</th>
          <th scope="col" :aria-sort="ariaSort('status')">
            <button class="hw-sort-btn" @click="cycleSort('status')">Status{{ sortIndicator('status') }}</button>
          </th>
          <th scope="col"><span class="hw-sr-only">Detail page</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedRows" :key="row.driver + '/' + row.key" :class="['hw-row', 'hw-row-' + row.status]">
          <td>{{ row.family }}</td>
          <td>
            <a :href="detailHref(row)" class="hw-name-link">{{ row.name }}</a>
          </td>
          <td>
            <span
              v-for="t in row.transports"
              :key="t"
              class="hw-tport"
            >{{ transportTagLabel(t) }}</span>
          </td>
          <td>
            <span :class="['hw-status', 'hw-status-' + row.status]">{{ STATUS_LABEL[row.status] }}</span>
          </td>
          <td>
            <a :href="detailHref(row)" class="hw-detail-link" :aria-label="'Open ' + row.name + ' detail page'">View →</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.hw-table-root {
  --hw-verified: #22c55e;
  --hw-partial: #f59e0b;
  --hw-broken: #ef4444;
  --hw-untested: #94a3b8;
  font-size: 14px;
}

.hw-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.hw-search-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hw-search-text {
  font-weight: 600;
  font-size: 0.875rem;
}

.hw-search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.hw-facet-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.hw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.hw-chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 120ms;
}

.hw-chip:hover {
  background: var(--vp-c-bg-soft);
}

.hw-chip.active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
  font-weight: 600;
}

.hw-clear {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.8125rem;
}

.hw-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hw-facet-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hw-result-count {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
}

.hw-empty {
  text-align: center;
  padding: 2rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.hw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.hw-table th,
.hw-table td {
  padding: 0.5rem 0.625rem;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: middle;
}

.hw-table th {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
  font-size: 0.8125rem;
}

.hw-sort-btn {
  background: none;
  border: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  color: var(--vp-c-text-1);
}

.hw-sort-btn:hover {
  color: var(--vp-c-brand);
}

.hw-name-link {
  font-weight: 500;
  color: var(--vp-c-brand);
  text-decoration: none;
}

.hw-name-link:hover {
  text-decoration: underline;
}

.hw-tport {
  display: inline-block;
  padding: 0.05rem 0.4rem;
  margin-right: 0.25rem;
  margin-bottom: 0.125rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.hw-status {
  white-space: nowrap;
  font-weight: 500;
}

.hw-status-verified { color: var(--hw-verified); }
.hw-status-partial  { color: var(--hw-partial); }
.hw-status-broken   { color: var(--hw-broken); }
.hw-status-untested { color: var(--hw-untested); }

.hw-detail-link {
  font-size: 0.8125rem;
  color: var(--vp-c-brand);
  text-decoration: none;
  white-space: nowrap;
}

.hw-detail-link:hover {
  text-decoration: underline;
}

.hw-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
