import { EventEmitter } from 'events'

export const appBus = new EventEmitter()

// Event names
export const SHOW_MAIN = 'app:show-main'
export const SHOW_RADIAL = 'app:show-radial'
export const TOGGLE_WINDOWS = 'app:toggle-windows'
