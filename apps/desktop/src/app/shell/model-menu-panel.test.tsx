import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { $modelPresets } from '@/store/model-presets'
import { $visibleModels } from '@/store/model-visibility'
import {
  $activeSessionId,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort
} from '@/store/session'

const submenuProps = vi.hoisted(() => vi.fn())

vi.mock('./model-edit-submenu', async importOriginal => {
  const actual = await importOriginal<typeof import('./model-edit-submenu')>()

  return {
    ...actual,
    ModelEditSubmenu: (props: Record<string, unknown>) => {
      submenuProps(props)

      return null
    }
  }
})

const getGlobalModelOptions = vi.fn()
const getMoaModels = vi.fn()

vi.mock('@/hermes', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hermes')>()

  return {
    ...actual,
    getGlobalModelOptions: (opts?: { refresh?: boolean }) => getGlobalModelOptions(opts),
    getMoaModels: () => getMoaModels()
  }
})

import { ModelMenuCloseContext, ModelMenuPanel } from './model-menu-panel'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
})

beforeEach(() => {
  submenuProps.mockClear()
  getGlobalModelOptions.mockResolvedValue({ providers: [] })
  getMoaModels.mockResolvedValue({ default_preset: 'default', presets: {} })

  $activeSessionId.set('session-1')
  $currentProvider.set('openai-codex')
  $currentModel.set('gpt-5.5')
  $currentReasoningEffort.set('xhigh')
  $currentFastMode.set(false)
  $modelPresets.set({})
  $visibleModels.set(null)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  $activeSessionId.set(null)
  $currentProvider.set('')
  $currentModel.set('')
  $currentReasoningEffort.set('')
  $currentFastMode.set(false)
  $modelPresets.set({})
  $visibleModels.set(null)
})

describe('ModelMenuPanel', () => {
  it('passes session-scoped provider/model reasoning efforts through to the active row submenu', async () => {
    const modelOptions = {
      provider: 'openai-codex',
      model: 'gpt-5.5',
      providers: [
        {
          name: 'OpenAI Codex',
          slug: 'openai-codex',
          models: ['gpt-5.5'],
          authenticated: true,
          capabilities: {
            'gpt-5.5': {
              fast: true,
              reasoning: true,
              reasoning_efforts: ['low', 'medium', 'high', 'xhigh']
            }
          }
        }
      ]
    }
    const gateway = {
      request: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        expect(method).toBe('model.options')
        expect(params).toEqual({ session_id: 'session-1' })

        return modelOptions
      })
    }

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DropdownMenu open>
          <DropdownMenuContent>
            <ModelMenuCloseContext.Provider value={vi.fn()}>
              <ModelMenuPanel
                gateway={gateway as never}
                onSelectModel={vi.fn()}
                requestGateway={vi.fn() as never}
              />
            </ModelMenuCloseContext.Provider>
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>
    )

    await waitFor(() => expect(gateway.request).toHaveBeenCalledWith('model.options', { session_id: 'session-1' }))
    expect(await screen.findByText(/Extra High/)).toBeTruthy()

    await waitFor(() =>
      expect(submenuProps).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.5',
          provider: 'openai-codex',
          reasoning: true,
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh']
        })
      )
    )
  })
})
