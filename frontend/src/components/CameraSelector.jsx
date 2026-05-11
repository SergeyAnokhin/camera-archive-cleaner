import './CameraSelector.css'

export default function CameraSelector({ cameras, selectedId, onSelect }) {
  return (
    <div className="camera-selector">
      <span className="camera-selector-label">Camera</span>
      <button
        className={`camera-pill${selectedId === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {cameras.map(cam => (
        <button
          key={cam.id}
          className={`camera-pill${selectedId === cam.id ? ' active' : ''}`}
          onClick={() => onSelect(cam.id)}
        >
          {cam.name}
        </button>
      ))}
    </div>
  )
}
