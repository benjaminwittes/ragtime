/**
 * Where a note goes, and in which shape (`point.ts`).
 *
 * The default is the worker this app already talks to: its report route takes a note from
 * a browser with no credential, so every build has somewhere honest to send one and the
 * button can be drawn everywhere. That is the change from the widget's first life, when
 * an unset address meant no widget at all.
 *
 * `VITE_POINT_URL` still names another address at build time, for a deployment that sits
 * beside a capture route of its own; that route reads the note as it is.
 */

import { WORKER_URL } from '@/lib/worker-url'

import type { PointWire } from './point.ts'

const NAMED = ((import.meta.env.VITE_POINT_URL as string | undefined) || '').trim()

export const POINT_URL = NAMED || `${WORKER_URL}/problem-reports`

export const POINT_WIRE: PointWire = NAMED ? 'note' : 'report'
