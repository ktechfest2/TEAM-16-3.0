"use client";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";

type Place = { code: string; name: string };
type Unit = { id: string; code: string; name: string; is_simulated: boolean; state?: string; lga?: string; ward?: string };
type Level = "states" | "lgas" | "wards" | "units";

export function DirectoryPicker({ selected, onSelect }: { selected: Unit | null; onSelect: (unit: Unit | null) => void }) {
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [items, setItems] = useState<Record<Level, Place[]>>({ states: [], lgas: [], wards: [], units: [] });
  const [filters, setFilters] = useState<Record<Level, string>>({ states: "", lgas: "", wards: "", units: "" });
  const [fullCode, setFullCode] = useState("");
  const [loading, setLoading] = useState<Level | "code" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
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
    }).then(data => setItems(current => ({ ...current, [level]: data.items || [] })))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Directory unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(null); });
    return () => controller.abort();
  }, [state, lga, ward]);

  async function findCode() {
    if (!/^\d{2}\/\d{2}\/\d{2}\/\d{3}$/.test(fullCode)) { setError("Enter the full code, for example 01/01/01/001."); return; }
    setLoading("code"); setError("");
    try {
      const response = await fetch(`/api/directory?level=code&search=${encodeURIComponent(fullCode)}`);
      if (!response.ok) throw Error("Code lookup unavailable. Try again when connected.");
      const unit = (await response.json()).items?.[0] as Unit | undefined;
      if (!unit) { setError("No polling unit matches that full code."); return; }
      setState(unit.code.slice(0, 2)); setLga(unit.code.slice(3, 5)); setWard(unit.code.slice(6, 8)); onSelect({ ...unit, is_simulated: false });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Code lookup failed"); }
    finally { setLoading(null); }
  }

  const control = (level: Level, label: string, value: string, disabled: boolean, change: (value: string) => void) => (
    <div className="min-w-0 space-y-1.5" key={level}>
      <Field label={label} htmlFor={`directory-${level}`}>
        <Input aria-label={`Search ${label}`} type="search" placeholder={`Search ${label.toLowerCase()}`} value={filters[level]} onChange={event => setFilters(current => ({ ...current, [level]: event.target.value }))} disabled={disabled} />
        <Select id={`directory-${level}`} value={value} disabled={disabled || loading === level} onChange={event => change(event.target.value)}>
          <option value="">{loading === level ? "Loading…" : `Select ${label.toLowerCase()}`}</option>
          {items[level].filter(item => `${item.code} ${item.name}`.toLowerCase().includes(filters[level].toLowerCase())).map(item => <option key={item.code} value={level === "units" ? (item as Unit).id : item.code}>{item.code} — {item.name}</option>)}
        </Select>
      </Field>
      {!loading && !items[level].length && !disabled && <p className="text-xs text-slate-ink/70">No results loaded. Check your connection.</p>}
      {!!filters[level] && !items[level].some(item => `${item.code} ${item.name}`.toLowerCase().includes(filters[level].toLowerCase())) && <p className="text-xs text-slate-ink/70">No matching results.</p>}
    </div>
  );

  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {control("states", "State or FCT", state, false, value => { setState(value); setLga(""); setWard(""); onSelect(null); })}
      {control("lgas", "LGA", lga, !state, value => { setLga(value); setWard(""); onSelect(null); })}
      {control("wards", "Ward", ward, !lga, value => { setWard(value); onSelect(null); })}
      {control("units", "Polling unit", selected?.id || "", !ward, value => { const unit = items.units.find(item => (item as Unit).id === value) as Unit | undefined; onSelect(unit ? { ...unit, is_simulated: false } : null); })}
    </div>
    <div className="flex flex-wrap gap-2"><Input aria-label="Full polling-unit code" value={fullCode} onChange={event => setFullCode(event.target.value)} placeholder="Full code: 01/01/01/001" className="min-w-0 flex-1" /><button type="button" onClick={() => void findCode()} disabled={loading === "code"} className="min-h-11 rounded-xl bg-midnight px-4 text-sm font-semibold text-white">Find code</button></div>
    {selected && <p className="text-xs text-trust">Confirmed: {selected.code} — {selected.name}</p>}
    {error && <p role="alert" className="text-xs text-alert">{error}</p>}
  </div>;
}
