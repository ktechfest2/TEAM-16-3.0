"use client";
import { useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";

type Place = { code: string; name: string };
type Unit = { id: string; code: string; name: string; is_simulated: boolean; state?: string; lga?: string; ward?: string };
type Level = "states" | "lgas" | "wards" | "units";

export function DirectoryPicker({ selected, onSelect }: { selected: Unit | null; onSelect: (unit: Unit | null) => void }) {
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [items, setItems] = useState<Record<Level, Place[]>>({ states: [], lgas: [], wards: [], units: [] });
  const [fullCode, setFullCode] = useState("");
  const [loading, setLoading] = useState<Level | "code" | null>(null);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  function hierarchy(unit: Unit) {
    const match = /^(\d{2})\/(\d{2})\/(\d{2})\/\d{3}$/.exec(unit.code);
    if (!match) return null;
    return { stateCode: match[1], lgaCode: match[2], wardCode: match[3] };
  }

  function restoreHierarchy(unit: Unit) {
    const codes = hierarchy(unit);
    if (!codes) return false;
    requestGeneration.current += 1;
    setState(codes.stateCode);
    setLga(codes.lgaCode);
    setWard(codes.wardCode);
    setItems(current => ({
      states: unit.state ? [{ code: codes.stateCode, name: unit.state }, ...current.states.filter(item => item.code !== codes.stateCode)] : current.states,
      lgas: unit.lga ? [{ code: codes.lgaCode, name: unit.lga }, ...current.lgas.filter(item => item.code !== codes.lgaCode)] : current.lgas,
      wards: unit.ward ? [{ code: codes.wardCode, name: unit.ward }, ...current.wards.filter(item => item.code !== codes.wardCode)] : current.wards,
      units: [unit, ...current.units.filter(item => (item as Unit).id !== unit.id)],
    }));
    return true;
  }

  useEffect(() => {
    if (selected) restoreHierarchy(selected);
    // Restore only when the confirmed unit changes; parent changes are handled synchronously below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const level: Level = !state ? "states" : !lga ? "lgas" : !ward ? "wards" : "units";
    const params = new URLSearchParams({ level });
    if (state) params.set("state", state);
    if (lga) params.set("lga", lga);
    if (ward) params.set("ward", ward);
    const controller = new AbortController();
    setLoading(level); setError("");
    fetch(`/api/directory?${params}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error("Directory unavailable. Retry when connected.");
      return response.json();
    }).then(data => { if (generation === requestGeneration.current) setItems(current => ({ ...current, [level]: data.items || [] })); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Directory unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(null); });
    return () => controller.abort();
  }, [state, lga, ward]);

  async function findCode() {
    const generation = ++requestGeneration.current;
    if (!/^\d{2}\/\d{2}\/\d{2}\/\d{3}$/.test(fullCode)) { setError("Enter the full code, for example 01/01/01/001."); return; }
    setLoading("code"); setError("");
    try {
      const response = await fetch(`/api/directory?level=code&search=${encodeURIComponent(fullCode)}`);
      if (!response.ok) throw Error("Code lookup unavailable. Try again when connected.");
      const unit = (await response.json()).items?.[0] as Unit | undefined;
      if (generation !== requestGeneration.current) return;
      if (!unit) { setError("No polling unit matches that full code."); return; }
      const restored = { ...unit, is_simulated: false };
      if (!restoreHierarchy(restored)) { setError("The directory returned an invalid polling-unit code."); return; }
      onSelect(restored);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Code lookup failed"); }
    finally { if (generation === requestGeneration.current) setLoading(null); }
  }

  const control = (level: Level, label: string, value: string, disabled: boolean, change: (value: string) => void) => (
    <div className="min-w-0 space-y-1.5" key={level}>
      <Field label={label} htmlFor={`directory-${level}`}>
        <Select id={`directory-${level}`} value={value} disabled={disabled || loading === level} aria-busy={loading === level || undefined} onChange={event => change(event.target.value)}>
          <option value="">{loading === level ? "Loading…" : `Select ${label.toLowerCase()}`}</option>
          {items[level].map(item => <option key={level === "units" ? (item as Unit).id : item.code} value={level === "units" ? (item as Unit).id : item.code}>{item.code} — {item.name}</option>)}
        </Select>
      </Field>
      {!loading && !items[level].length && !disabled && <p className="text-xs text-slate-ink/70">No results loaded. Check your connection.</p>}
    </div>
  );

  function changeState(value: string) {
    requestGeneration.current += 1;
    setState(value); setLga(""); setWard("");
    setItems(current => ({ ...current, lgas: [], wards: [], units: [] }));
    setLoading(null); setError(""); onSelect(null);
  }

  function changeLga(value: string) {
    requestGeneration.current += 1;
    setLga(value); setWard("");
    setItems(current => ({ ...current, wards: [], units: [] }));
    setLoading(null); setError(""); onSelect(null);
  }

  function changeWard(value: string) {
    requestGeneration.current += 1;
    setWard(value);
    setItems(current => ({ ...current, units: [] }));
    setLoading(null); setError(""); onSelect(null);
  }

  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {control("states", "State or FCT", state, false, changeState)}
      {control("lgas", "LGA", lga, !state, changeLga)}
      {control("wards", "Ward", ward, !lga, changeWard)}
      {control("units", "Polling unit", selected?.id || "", !ward, value => { const unit = items.units.find(item => (item as Unit).id === value) as Unit | undefined; onSelect(unit ? { ...unit, is_simulated: false } : null); })}
    </div>
    <details className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-inset ring-[var(--hairline)]">
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-navy">Advanced: find by full polling-unit code</summary>
      <div className="flex flex-wrap gap-2 pb-2 pt-1"><Input aria-label="Full polling-unit code" value={fullCode} onChange={event => setFullCode(event.target.value)} placeholder="Full code: 01/01/01/001" className="min-w-0 flex-1" /><button type="button" onClick={() => void findCode()} disabled={loading === "code"} className="min-h-11 rounded-xl bg-midnight px-4 text-sm font-semibold text-white">{loading === "code" ? "Finding…" : "Find code"}</button></div>
    </details>
    {selected && <p className="text-xs text-trust">Confirmed: {selected.code} — {selected.name}</p>}
    {error && <p role="alert" className="text-xs text-alert">{error}</p>}
  </div>;
}
