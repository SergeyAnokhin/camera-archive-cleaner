import TasksSection from './service/TasksSection.jsx'
import LoggingSection from './service/LoggingSection.jsx'
import MaintenanceSection from './service/MaintenanceSection.jsx'

// Combined Service tab — thin shell composing the three sections in `service/`.
export default function ServiceTab({ onDatabaseCleared, cameraId, cameras }) {
  return (
    <>
      <div className="modal-ai-provider-header">
        <i className="mdi mdi-cog-outline" /> Tasks
      </div>
      <TasksSection />

      <div className="modal-ai-provider-header">
        <i className="mdi mdi-text-box-outline" /> Logging
      </div>
      <LoggingSection />

      <div className="modal-ai-provider-header">
        <i className="mdi mdi-wrench-outline" /> Maintenance
      </div>
      <MaintenanceSection
        onDatabaseCleared={onDatabaseCleared}
        cameraId={cameraId}
        cameras={cameras}
      />
    </>
  )
}
