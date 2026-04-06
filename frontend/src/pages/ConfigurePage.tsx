import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUnitConfig } from '../hooks/useUnitConfig'
import type { FullConfig } from '../hooks/useUnitConfig'

export function ConfigurePage() {
  const { unitId } = useParams<{ unitId: string }>()
  const { config, loading, saving, saved, error, save } = useUnitConfig(unitId!)
  const [draft, setDraft] = useState<FullConfig | null>(null)

  useEffect(() => { if (config) setDraft(config) }, [config])

  if (loading || !draft) return <div className="min-h-screen bg-gray-950 text-white p-6">Loading…</div>
  if (error) return <div className="min-h-screen bg-gray-950 text-red-400 p-6">{error}</div>

  const setConfig = (field: keyof FullConfig['configuration'], value: number | boolean) =>
    setDraft(d => d ? { ...d, configuration: { ...d.configuration, [field]: value } } : d)

  const setAlert = (field: keyof FullConfig['alertRule'], value: number | boolean) =>
    setDraft(d => d ? { ...d, alertRule: { ...d.alertRule, [field]: value } } : d)

  const setSensor = (index: number, field: 'label' | 'minDist' | 'maxDist', value: string | number) =>
    setDraft(d => d ? {
      ...d,
      sensors: d.sensors.map(s => s.index === index ? { ...s, [field]: value } : s),
    } : d)

  const handleSave = async () => {
    if (!draft) return
    await save({
      configuration: draft.configuration,
      sensors: draft.sensors.map(s => ({ index: s.index, label: s.label, minDist: s.minDist, maxDist: s.maxDist })),
      alertRule: draft.alertRule,
    })
  }

  const numInput = (value: number, onChange: (v: number) => void, min: number, max: number) => (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-24 bg-gray-700 text-white rounded px-2 py-1 text-sm"
    />
  )

  const toggle = (checked: boolean, onChange: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link to="/setup/units" className="text-gray-400 hover:text-white text-sm">← Units</Link>
          <h1 className="text-2xl font-bold">Configure {unitId}</h1>
        </div>

        {/* ToF Sensors */}
        <section>
          <h2 className="text-lg font-semibold mb-3">ToF Sensors</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 text-left"><th className="pb-2">Index</th><th className="pb-2">Label</th><th className="pb-2">Min (mm)</th><th className="pb-2">Max (mm)</th></tr></thead>
            <tbody>
              {draft.sensors.map(s => (
                <tr key={s.index} className="border-t border-gray-800">
                  <td className="py-2 pr-4 text-gray-400">{s.index}</td>
                  <td className="py-2 pr-4"><input value={s.label} onChange={e => setSensor(s.index, 'label', e.target.value)} className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-36" /></td>
                  <td className="py-2 pr-4">{numInput(s.minDist, v => setSensor(s.index, 'minDist', v), 10, 500)}</td>
                  <td className="py-2">{numInput(s.maxDist, v => setSensor(s.index, 'maxDist', v), 100, 4000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link to={`/calibrate/${unitId}`} target="_blank" className="text-blue-400 text-xs mt-2 inline-block hover:text-blue-300">Open Calibration Mode ↗</Link>
        </section>

        {/* Detection Logic */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Detection Logic</h2>
          <div className="space-y-3">
            {([
              ['Min sensor agreement', 'minSensorAgreement', 1, 6],
              ['Dwell minimum (s)', 'dwellMinSeconds', 1, 30],
              ['Departure timeout (s)', 'departureTimeoutSeconds', 1, 30],
            ] as [string, keyof FullConfig['configuration'], number, number][]).map(([label, field, min, max]) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">{label}</span>
                {numInput(draft.configuration[field] as number, v => setConfig(field, v), min, max)}
              </div>
            ))}
          </div>
        </section>

        {/* PIR */}
        <section>
          <h2 className="text-lg font-semibold mb-3">PIR</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">PIR enabled</span>{toggle(draft.configuration.pirEnabled, v => setConfig('pirEnabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Cooldown (s)</span>{numInput(draft.configuration.pirCooldownSeconds, v => setConfig('pirCooldownSeconds', v), 1, 60)}</div>
          </div>
        </section>

        {/* IMU */}
        <section>
          <h2 className="text-lg font-semibold mb-3">IMU</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Pickup threshold (g)</span>{numInput(draft.configuration.imuPickupThresholdG, v => setConfig('imuPickupThresholdG', v), 0.5, 5)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Examination enabled</span>{toggle(draft.configuration.imuExaminationEnabled, v => setConfig('imuExaminationEnabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Duration threshold (ms)</span>{numInput(draft.configuration.imuDurationThresholdMs, v => setConfig('imuDurationThresholdMs', v), 100, 2000)}</div>
          </div>
        </section>

        {/* Alert Rule */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Alert Rule</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Alert enabled</span>{toggle(draft.alertRule.enabled, v => setAlert('enabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Dwell threshold (s)</span>{numInput(draft.alertRule.dwellThresholdSeconds, v => setAlert('dwellThresholdSeconds', v), 1, 300)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Require pickup</span>{toggle(draft.alertRule.requirePickup, v => setAlert('requirePickup', v))}</div>
          </div>
        </section>

        <div className="flex items-center gap-4 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}
