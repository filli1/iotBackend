import { useState } from 'react'

type Props = { text: string }

export function Tooltip({ text }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-600 hover:bg-gray-500 text-gray-300 text-[10px] font-bold leading-none flex items-center justify-center flex-shrink-0"
        aria-label="Help"
      >
        ?
      </button>
      {visible && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-56 bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-3 py-2 shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}
