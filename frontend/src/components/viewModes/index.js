import normalMode from './normalMode.js'
import motionDiffMode from './motionDiffMode.js'
import diffZoomMode from './diffZoomMode.js'
import erosionMode from './erosionMode.js'
import neonMaskMode from './neonMaskMode.js'
import mhiMode from './mhiMode.js'
import boundingBoxesMode from './boundingBoxesMode.js'
import motionStackingMode from './motionStackingMode.js'
import geminiMode from './geminiMode.js'
import claudeMode from './claudeMode.js'
import openvinoMode from './openvinoMode.js'

export const VIEW_MODES = [
  normalMode,
  motionDiffMode,
  diffZoomMode,
  erosionMode,
  neonMaskMode,
  mhiMode,
  boundingBoxesMode,
  motionStackingMode,
  geminiMode,
  claudeMode,
  openvinoMode,
]
export const DEFAULT_VIEW_MODE_KEY = normalMode.key
