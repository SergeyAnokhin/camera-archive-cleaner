import { useState } from 'react'
import SliderSetting from '../SliderSetting.jsx'
import {
  ETA_WINDOW_KEY, ETA_WINDOW_MIN, ETA_WINDOW_MAX, ETA_WINDOW_DEFAULT,
  LOG_TAIL_KEY, LOG_TAIL_MIN, LOG_TAIL_MAX, LOG_TAIL_DEFAULT,
} from '../settingsConfig.js'

// Task settings section (formerly TasksTab)
export default function TasksSection() {
  const [etaWindow, setEtaWindow] = useState(() =>
    Number(localStorage.getItem(ETA_WINDOW_KEY)) || ETA_WINDOW_DEFAULT
  )
  const [logTailLines, setLogTailLines] = useState(() =>
    Number(localStorage.getItem(LOG_TAIL_KEY)) || LOG_TAIL_DEFAULT
  )

  function handleEtaWindowChange(e) {
    const v = Number(e.target.value)
    setEtaWindow(v)
    localStorage.setItem(ETA_WINDOW_KEY, v)
  }

  function handleLogTailChange(e) {
    const v = Number(e.target.value)
    setLogTailLines(v)
    localStorage.setItem(LOG_TAIL_KEY, v)
  }

  return (
    <>
      <SliderSetting
        title="ETA window (minutes)"
        min={ETA_WINDOW_MIN} max={ETA_WINDOW_MAX} step={1}
        value={etaWindow} onChange={handleEtaWindowChange}
        minLabel={String(ETA_WINDOW_MIN)} maxLabel={String(ETA_WINDOW_MAX)}
        valueLabel={`${etaWindow} min`}
        hint="Processing speed and ETA are computed over the last N minutes, not since the task started."
      />

      <SliderSetting
        title="Task log lines"
        min={LOG_TAIL_MIN} max={LOG_TAIL_MAX} step={5}
        value={logTailLines} onChange={handleLogTailChange}
        minLabel={String(LOG_TAIL_MIN)} maxLabel={String(LOG_TAIL_MAX)}
        valueLabel={`${logTailLines} lines`}
        hint="How many trailing lines to show in the log viewer. Reduce if the browser freezes when opening it."
      />
    </>
  )
}
