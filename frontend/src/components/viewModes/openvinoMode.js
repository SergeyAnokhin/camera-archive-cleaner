import { getOpenVinoBboxThumbnailUrl, getExcludedParam, getClassesParam } from '../../api.js'

export default {
  key: 'openvino_detection',
  label: 'OpenVINO Detection',
  params: [
    { key: 'confidence', label: 'Confidence %', min: 10, max: 80, default: 25, step: 5 },
  ],
  isAiMode: true,
  needsCompute: true,
  aiProvider: 'openvino',
  getImageUrl(file, { params } = {}) {
    const model = localStorage.getItem('openvino_model') || 'yolov8n'
    const confidence = (params?.confidence ?? 25) / 100
    return getOpenVinoBboxThumbnailUrl(file.id, model, confidence, getExcludedParam(), getClassesParam())
  },
}
