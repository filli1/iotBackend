type Props = { lastEvent: string | null }
export function ImuBadge({ lastEvent }: Props) {
  const label = lastEvent === 'imu_pickup' ? 'Pickup' : lastEvent === 'imu_rotation' ? 'Rotation' : lastEvent === 'imu_shock' ? 'Shock' : 'Idle'
  const colour = lastEvent ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${colour}`}>IMU {label}</span>
}
