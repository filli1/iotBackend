import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('renders Store Attention heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Store Attention' })).toBeInTheDocument()
})
