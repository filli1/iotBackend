type Props = { triggered: boolean }
export function PirBadge({ triggered }: Props) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${triggered ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
      PIR {triggered ? 'Triggered' : 'Idle'}
    </span>
  )
}
