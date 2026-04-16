import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUnitConfig } from '../hooks/useUnitConfig'
import type { FullConfig } from '../hooks/useUnitConfig'
import { apiFetch } from '../lib/api'
import { Tooltip } from '../components/Tooltip'

type Subscriber = {
  userId: string
  email: string
  phoneNumber: string | null
  createdAt: string
}

type UserOption = {
  id: string
  email: string
  phoneNumber: string | null
}

export function ConfigurePage() {
  const { unitId } = useParams<{ unitId: string }>()
  const { config, loading, saving, saved, error, save, reload } = useUnitConfig(unitId!)
  const [draft, setDraft] = useState<FullConfig | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [addUserId, setAddUserId] = useState('')

  const loadSubscribers = () =>
    apiFetch<{ subscribers: Subscriber[] }>(`/api/units/${unitId}/subscriptions`)
      .then(d => setSubscribers(d.subscribers))
      .catch((err: unknown) => { console.error('Failed to load subscribers:', err) })

  useEffect(() => {
    loadSubscribers()
    apiFetch<{ users: UserOption[] }>('/api/users')
      .then(d => setAllUsers(d.users))
      .catch((err: unknown) => { console.error('Failed to load users:', err) })
  }, [unitId])

  const handleAddSubscriber = async () => {
    if (!addUserId) return
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions/${addUserId}`, { method: 'POST' })
      setAddUserId('')
      await loadSubscribers()
    } catch (err: unknown) {
      console.error('Failed to add subscriber:', err)
    }
  }

  const handleRemoveSubscriber = async (userId: string) => {
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions/${userId}`, { method: 'DELETE' })
      await loadSubscribers()
    } catch (err: unknown) {
      console.error('Failed to remove subscriber:', err)
    }
  }

  useEffect(() => { if (config) setDraft(config) }, [config])

  useEffect(() => {
    apiFetch<{ apiKey: string }>(`/api/units/${unitId}/api-key`)
      .then(d => setApiKey(d.apiKey))
      .catch(() => {})
  }, [unitId])

  const copyKey = () => {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey).then(() => {
      setKeyCopied(true)
      setTimeout(() => setKeyCopied(false), 2000)
    })
  }

  const handleAddSensor = async () => {
    if (!draft || draft.sensors.length >= 6) return
    try {
      await apiFetch(`/api/units/${unitId}/sensors`, {
        method: 'POST',
        body: JSON.stringify({ label: `sensor-${draft.sensors.length + 1}`, minDist: 50, maxDist: 1000 }),
      })
      await reload()
    } catch (err: unknown) {
      console.error('Failed to add sensor:', err)
    }
  }

  const handleRemoveSensor = async (index: number) => {
    if (!draft || draft.sensors.length <= 1) return
    try {
      await apiFetch(`/api/units/${unitId}/sensors/${index}`, { method: 'DELETE' })
      await reload()
    } catch (err: unknown) {
      console.error('Failed to remove sensor:', err)
    }
  }

  if (loading || !draft) return <div className="p-6">Loading…</div>
  if (error) return <div className="p-6 text-red-400">{error}</div>

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
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link to="/setup/units" className="text-gray-400 hover:text-white text-sm">← Units</Link>
          <h1 className="text-2xl font-bold">Configure {unitId}</h1>
        </div>

        {/* ToF Sensors */}
        <section>
          <h2 className="text-lg font-semibold mb-3">ToF Sensors</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-2">Index</th>
                <th className="pb-2">Label<Tooltip text="A human-readable name for this sensor, shown in calibration view." /></th>
                <th className="pb-2">Min (cm)<Tooltip text="Minimum distance a reading must be to count as a detection." /></th>
                <th className="pb-2">Max (cm)<Tooltip text="Maximum distance a reading counts as a detection." /></th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {draft.sensors.map(s => (
                <tr key={s.index} className="border-t border-gray-800">
                  <td className="py-2 pr-4 text-gray-400">{s.index}</td>
                  <td className="py-2 pr-4"><input value={s.label} onChange={e => setSensor(s.index, 'label', e.target.value)} className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-36" /></td>
                  <td className="py-2 pr-4">{numInput(Math.round(s.minDist / 10), v => setSensor(s.index, 'minDist', v * 10), 1, 50)}</td>
                  <td className="py-2">{numInput(Math.round(s.maxDist / 10), v => setSensor(s.index, 'maxDist', v * 10), 10, 400)}</td>
                  <td className="py-2 pl-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveSensor(s.index)}
                      disabled={draft.sensors.length <= 1}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4 mt-2">
            <button
              type="button"
              onClick={handleAddSensor}
              disabled={draft.sensors.length >= 6}
              className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-30"
            >
              + Add sensor
            </button>
            <Link to={`/calibrate/${unitId}`} target="_blank" className="text-blue-400 text-xs hover:text-blue-300">Open Calibration Mode ↗</Link>
          </div>
        </section>

        {/* Detection Logic */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Detection Logic</h2>
          <div className="space-y-3">
            {([
              ['Min sensor agreement', 'minSensorAgreement', 1, 6, 'How many ToF sensors must simultaneously detect presence.'],
              ['Dwell minimum (s)', 'dwellMinSeconds', 1, 30, 'How long presence must be continuously detected before a session starts.'],
              ['Departure timeout (s)', 'departureTimeoutSeconds', 1, 30, 'How long absence must persist before the session ends.'],
            ] as [string, keyof FullConfig['configuration'], number, number, string][]).map(([label, field, min, max, tip]) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm flex items-center">{label}<Tooltip text={tip} /></span>
                {numInput(draft.configuration[field] as number, v => setConfig(field, v), min, max)}
              </div>
            ))}
          </div>
        </section>

        {/* IMU */}
        <section>
          <h2 className="text-lg font-semibold mb-3">IMU</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm flex items-center">IMU enabled<Tooltip text="Enable vibration-based product interaction detection. Disable if no IMU is installed." /></span>
              {toggle(draft.configuration.imuEnabled, v => setConfig('imuEnabled', v))}
            </div>
            {draft.configuration.imuEnabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm flex items-center">Vibration threshold (g RMS)<Tooltip text="Minimum vibration intensity (g RMS) the IMU must measure to register a product interaction event." /></span>
                  {numInput(draft.configuration.imuVibrationThreshold, v => setConfig('imuVibrationThreshold', v), 0, 5)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm flex items-center">Duration threshold (ms)<Tooltip text="How long the vibration must be sustained to count as a product interaction event." /></span>
                  {numInput(draft.configuration.imuDurationThresholdMs, v => setConfig('imuDurationThresholdMs', v), 100, 2000)}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Alert Rule */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Alert Rule</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Alert enabled<Tooltip text="When enabled, an SMS alert is sent to all subscribers when the rule conditions are met." /></span>{toggle(draft.alertRule.enabled, v => setAlert('enabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Dwell threshold (s)<Tooltip text="Customer must be present for at least this many seconds before an alert is sent." /></span>{numInput(draft.alertRule.dwellThresholdSeconds, v => setAlert('dwellThresholdSeconds', v), 1, 300)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Require interaction<Tooltip text="If enabled, the alert only fires if the customer also interacted with the product." /></span>{toggle(draft.alertRule.requireInteraction, v => setAlert('requireInteraction', v))}</div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Notifications</h2>
          <p className="text-gray-400 text-sm mb-3">
            Users subscribed here receive an SMS alert when this unit's alert rule fires.
            A valid phone number must be set on the user account.
          </p>
          {subscribers.length === 0 ? (
            <p className="text-gray-500 text-sm">No subscribers yet.</p>
          ) : (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Phone</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map(s => (
                  <tr key={s.userId} className="border-t border-gray-800">
                    <td className="py-2 pr-4">{s.email}</td>
                    <td className="py-2 pr-4 text-gray-400">{s.phoneNumber ?? '—'}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => handleRemoveSubscriber(s.userId)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center gap-3">
            <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm">
              <option value="">Add a user…</option>
              {allUsers
                .filter(u => !subscribers.some(s => s.userId === u.id))
                .map(u => (
                  <option key={u.id} value={u.id}>
                    {u.email}{u.phoneNumber ? ` (${u.phoneNumber})` : ' (no phone)'}
                  </option>
                ))}
            </select>
            <button type="button" onClick={handleAddSubscriber} disabled={!addUserId} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">Add</button>
          </div>
        </section>

        {/* API Key */}
        <section>
          <h2 className="text-lg font-semibold mb-3">API Key</h2>
          <p className="text-gray-400 text-sm mb-3">
            Flash this key into your Arduino sketch as <code className="bg-gray-700 px-1 rounded">API_KEY</code>.
            It must be sent as the <code className="bg-gray-700 px-1 rounded">X-Api-Key</code> header on every POST.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-gray-900 text-green-400 text-sm px-3 py-2 rounded font-mono break-all">{apiKey ?? '…'}</code>
            <button onClick={copyKey} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm flex-shrink-0">{keyCopied ? 'Copied ✓' : 'Copy'}</button>
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
