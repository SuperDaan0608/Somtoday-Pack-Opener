import { describe, expect, test } from 'claude-code/testing'

import { badge, jobName, newCard, nudgeText, parseSize, restoreSize, splitInstruction, summary, taskName } from './dock-logic'

describe('dock logic', () => {
  test('parseSize accepts whole numbers 1 to 100 only', () => {
    expect(parseSize('10')).toBe(10)
    expect(parseSize(' 25 ')).toBe(25)
    expect(parseSize('100')).toBe(100)
    for (const bad of ['0', '101', 'abc', '2.5', '', '-3']) expect(parseSize(bad)).toBeNull()
  })

  test('a saved size above 20 comes back as 1', () => {
    expect(restoreSize(50)).toBe(1)
    expect(restoreSize(100)).toBe(1)
    expect(restoreSize(10)).toBe(10)
    expect(restoreSize(20)).toBe(20)
    expect(restoreSize(undefined)).toBe(1)
  })

  test('text helpers', () => {
    expect(splitInstruction(5)).toContain('exactly 5')
    expect(nudgeText(3, 10)).toBe('You used 3 of 10 helpers. Split the remaining work across the other 7, one helper per piece, all in parallel.')
    expect(jobName('Research bakery pricing, then write a report')).toBe('Research bakery pricing')
    expect(jobName('x'.repeat(10) + ' ' + 'word '.repeat(20)).length).toBeLessThanOrEqual(40)
    expect(taskName('Price check: Panera bakery menu items today please')).toBe('Price check: Panera bakery menu')
    const cards = [newCard('a', 'A'), newCard('b', 'B')]
    expect(badge(cards)).toBe('0 working · 2 queued · 0 done')
    expect(summary(cards.map(c => ({ ...c, status: 'done' as const })), 'Research bakery pricing', 134000)).toBe(
      '2 agents finished Research bakery pricing in 2m 14s',
    )
  })
})
