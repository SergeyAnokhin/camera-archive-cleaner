// Barrel re-export — the API surface is split by domain under src/api/.
// Import from './api.js' as before; add new endpoints to the matching domain module.
export * from './api/catalog.js'
export * from './api/files.js'
export * from './api/maintenance.js'
export * from './api/deleteApi.js'
export * from './api/analysis.js'
export * from './api/compute.js'
export * from './api/tasks.js'
export * from './api/tuning.js'
