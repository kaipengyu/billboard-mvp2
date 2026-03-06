'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from './page.module.css';
import type {
  ZipGroup,
  GeneralOption,
  WeatherCond,
  TimeCond,
  WeatherCondType,
  TimeCondType,
} from '@/lib/zipLogic';

// ── Constants ─────────────────────────────────────────────────────────────────

const WEATHER_TYPES: WeatherCondType[] = [
  'heat_wave', 'cold_snap', 'severe_weather', 'seasonal_shift',
];

const TIME_TYPES: TimeCondType[] = [
  'peak_demand_hours', 'weekday', 'after_school_weekend', 'weekend',
  'early_evening_weekday', 'pre_winter_window', 'move_in_window',
];

const labelOf = (s: string) => s.replace(/_/g, ' ');

const CANONICAL_PROGRAMS = [
  'Connected Rewards',
  'HVAC Replacement',
  'Home Performance with ENERGY STAR®',
  'My Account',
  'Smart Thermostat',
];

const PROGRAM_ALIASES: Record<string, string> = {
  HVAC: 'HVAC Replacement',
  'HVAC Tune-Up': 'HVAC Replacement',
  'Home Performance with ENERGY STAR': 'Home Performance with ENERGY STAR®',
  'Smart Energy Rewards': 'Connected Rewards',
};

const normalizeProgram = (program: string): string => {
  const normalized = PROGRAM_ALIASES[program] ?? program;
  return CANONICAL_PROGRAMS.includes(normalized) ? normalized : CANONICAL_PROGRAMS[0];
};

const normalizeGroupPrograms = (group: ZipGroup): ZipGroup => ({
  ...group,
  generalOptions: group.generalOptions.map(opt => ({
    ...opt,
    program: normalizeProgram(opt.program),
  })),
  weatherConditions: group.weatherConditions.map(cond => ({
    ...cond,
    program: normalizeProgram(cond.program),
  })),
  timeConditions: group.timeConditions.map(cond => ({
    ...cond,
    program: normalizeProgram(cond.program),
  })),
});

// ── Chip component ─────────────────────────────────────────────────────────────

function ChipList({
  items,
  onRemove,
  onAdd,
}: {
  items: string[];
  onRemove: (i: number) => void;
  onAdd: (val: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v) { onAdd(v); setDraft(''); }
  };
  return (
    <div className={styles.chips}>
      {items.map((item, i) => (
        <span key={i} className={styles.chip}>
          {item}
          <button className={styles.chipRemove} onClick={() => onRemove(i)} aria-label="remove">×</button>
        </span>
      ))}
      <input
        className={styles.addChipInput}
        value={draft}
        placeholder="Add keyword…"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      <button className={styles.addChipBtn} onClick={commit}>+ Add</button>
    </div>
  );
}

// ── Key-message list ──────────────────────────────────────────────────────────

function KeyMsgList({
  msgs,
  onChange,
}: {
  msgs: string[];
  onChange: (msgs: string[]) => void;
}) {
  return (
    <div>
      {msgs.map((m, i) => (
        <div key={i} className={styles.keyMsgRow}>
          <input
            className={styles.keyMsgInput}
            value={m}
            onChange={e => {
              const next = [...msgs];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            className={styles.keyMsgRemove}
            onClick={() => onChange(msgs.filter((_, j) => j !== i))}
            aria-label="remove"
          >×</button>
        </div>
      ))}
      <div className={styles.keyMsgRow}>
        <button
          className={styles.addChipBtn}
          style={{ marginTop: '0.25rem' }}
          onClick={() => onChange([...msgs, ''])}
        >+ Add key message</button>
      </div>
    </div>
  );
}

// ── General options section ───────────────────────────────────────────────────

function GeneralSection({
  options,
  programs,
  onChange,
}: {
  options: GeneralOption[];
  programs: string[];
  onChange: (opts: GeneralOption[]) => void;
}) {
  const update = (i: number, patch: Partial<GeneralOption>) => {
    const next = options.map((o, j) => j === i ? { ...o, ...patch } : o);
    onChange(next);
  };

  return (
    <div>
      {options.map((opt, i) => (
        <div key={i} className={styles.condRow}>
          <div className={styles.condRowTop}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Program</span>
              <select
                className={styles.select}
                value={opt.program}
                onChange={e => update(i, { program: e.target.value })}
              >
                {programs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Probability (0–1)</span>
              <input
                className={styles.probInput}
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={opt.probability}
                onChange={e => update(i, { probability: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <button className={styles.removeBtn} onClick={() => onChange(options.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Key Messages</span>
            <KeyMsgList
              msgs={opt.keyMessages}
              onChange={km => update(i, { keyMessages: km })}
            />
          </div>
        </div>
      ))}
      <button
        className={styles.addRowBtn}
        onClick={() => onChange([...options, { probability: 0.1, program: programs[0] ?? '', keyMessages: [] }])}
      >
        + Add option
      </button>
    </div>
  );
}

// ── Weather conditions section ────────────────────────────────────────────────

function WeatherSection({
  conditions,
  programs,
  onChange,
}: {
  conditions: WeatherCond[];
  programs: string[];
  onChange: (conds: WeatherCond[]) => void;
}) {
  const update = (i: number, patch: Partial<WeatherCond>) => {
    onChange(conditions.map((c, j) => j === i ? { ...c, ...patch } : c));
  };

  return (
    <div>
      {conditions.map((cond, i) => (
        <div key={i} className={styles.condRow}>
          <div className={styles.condRowTop}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Trigger Type</span>
              <select
                className={styles.select}
                value={cond.type}
                onChange={e => update(i, { type: e.target.value as WeatherCondType })}
              >
                {WEATHER_TYPES.map(t => <option key={t} value={t}>{labelOf(t)}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Program</span>
              <select
                className={styles.select}
                value={cond.program}
                onChange={e => update(i, { program: e.target.value })}
              >
                {programs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button className={styles.removeBtn} onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Key Messages</span>
            <KeyMsgList
              msgs={cond.keyMessages}
              onChange={km => update(i, { keyMessages: km })}
            />
          </div>
        </div>
      ))}
      <button
        className={styles.addRowBtn}
        onClick={() => onChange([...conditions, { type: 'heat_wave', program: programs[0] ?? '', keyMessages: [] }])}
      >
        + Add weather condition
      </button>
    </div>
  );
}

// ── Time conditions section ───────────────────────────────────────────────────

function TimeSection({
  conditions,
  programs,
  onChange,
}: {
  conditions: TimeCond[];
  programs: string[];
  onChange: (conds: TimeCond[]) => void;
}) {
  const update = (i: number, patch: Partial<TimeCond>) => {
    onChange(conditions.map((c, j) => j === i ? { ...c, ...patch } : c));
  };

  return (
    <div>
      {conditions.map((cond, i) => (
        <div key={i} className={styles.condRow}>
          <div className={styles.condRowTop}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Trigger Type</span>
              <select
                className={styles.select}
                value={cond.type}
                onChange={e => update(i, { type: e.target.value as TimeCondType })}
              >
                {TIME_TYPES.map(t => <option key={t} value={t}>{labelOf(t)}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Program</span>
              <select
                className={styles.select}
                value={cond.program}
                onChange={e => update(i, { program: e.target.value })}
              >
                {programs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button className={styles.removeBtn} onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Key Messages</span>
            <KeyMsgList
              msgs={cond.keyMessages}
              onChange={km => update(i, { keyMessages: km })}
            />
          </div>
        </div>
      ))}
      <button
        className={styles.addRowBtn}
        onClick={() => onChange([...conditions, { type: 'weekday', program: programs[0] ?? '', keyMessages: [] }])}
      >
        + Add time condition
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackendPage() {
  const [groups, setGroups] = useState<ZipGroup[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((data: ZipGroup[]) => setGroups(data.map(normalizeGroupPrograms)))
      .catch(() => setToast({ msg: 'Failed to load config', ok: false }));
  }, []);

  const updateGroup = useCallback((idx: number, patch: Partial<ZipGroup>) => {
    setGroups(prev => {
      if (!prev) return prev;
      return prev.map((g, i) => i === idx ? { ...g, ...patch } : g);
    });
  }, []);

  const handleSave = async () => {
    if (!groups) return;
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groups),
      });
      if (res.ok) {
        setToast({ msg: 'Saved successfully', ok: true });
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setToast({ msg: data.error ?? 'Save failed', ok: false });
      }
    } catch {
      setToast({ msg: 'Network error', ok: false });
    } finally {
      setSaving(false);
    }
  };

  if (!groups) {
    return <div className={styles.container}><p>Loading config…</p></div>;
  }

  const group = groups[activeIdx];

  // Keep one shared canonical list across all zip groups.
  const allPrograms = CANONICAL_PROGRAMS;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Billboard Config</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {toast && (
            <span className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
              {toast.msg}
            </span>
          )}
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Group tabs */}
      <div className={styles.tabs}>
        {groups.map((g, i) => (
          <button
            key={i}
            className={`${styles.tab} ${i === activeIdx ? styles.tabActive : ''}`}
            onClick={() => setActiveIdx(i)}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Group panel */}
      <div className={styles.groupPanel}>

        {/* ── Keywords per zip (hidden for General group) ── */}
        {group.zips.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Keywords per Zip Code</p>
            {group.zips.map(zip => {
              const keywords = group.localKeywords[zip] ?? [];
              return (
                <div key={zip} className={styles.zipRow}>
                  <span className={styles.zipLabel}>{zip}</span>
                  <ChipList
                    items={keywords}
                    onAdd={val => {
                      const next = { ...group.localKeywords, [zip]: [...keywords, val] };
                      updateGroup(activeIdx, { localKeywords: next });
                    }}
                    onRemove={i => {
                      const next = { ...group.localKeywords, [zip]: keywords.filter((_, j) => j !== i) };
                      updateGroup(activeIdx, { localKeywords: next });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ── General options ── */}
        <div className={styles.section}>
          <p className={styles.sectionTitle}>General Options</p>
          <GeneralSection
            options={group.generalOptions}
            programs={allPrograms}
            onChange={opts => updateGroup(activeIdx, { generalOptions: opts })}
          />
        </div>

        {/* ── Weather conditions ── */}
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Weather Conditions</p>
          <WeatherSection
            conditions={group.weatherConditions}
            programs={allPrograms}
            onChange={conds => updateGroup(activeIdx, { weatherConditions: conds })}
          />
        </div>

        {/* ── Time conditions ── */}
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Time Conditions</p>
          <TimeSection
            conditions={group.timeConditions}
            programs={allPrograms}
            onChange={conds => updateGroup(activeIdx, { timeConditions: conds })}
          />
        </div>

      </div>
    </div>
  );
}
