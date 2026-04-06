import { useWsStore } from '../lib/wsStore'

export function ConnectionBanner() {
  const connected = useWsStore(s => s.connected)
  if (connected) return null
  return (
    <div className="fixed top-0 inset-x-0 bg-yellow-600 text-white text-center text-sm py-1 z-50">
      Reconnecting to server…
    </div>
  )
}
