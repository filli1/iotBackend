import { NavBar } from './NavBar'

type Props = { children: React.ReactNode }

export function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <NavBar />
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  )
}
