import { getOpenVinoBboxThumbnailUrl, getClassesParam } from '../../api.js'

export default {
  key: 'openvino_detection',
  label: 'Object detection (local)',
  description: 'Local YOLO bounding boxes, no API key needed — requires the compute service',
  params: [
    { key: 'confidence', label: 'Confidence %', min: 10, max: 80, default: 25, step: 5 },
  ],
  isAiMode: true,
  needsCompute: true,
  aiProvider: 'openvino',
  getImageUrl(file, { params } = {}) {
    const model = localStorage.getItem('openvino_model') || 'yolov8n'
    const confidence = (params?.confidence ?? 25) / 100
    return getOpenVinoBboxThumbnailUrl(file.id, model, confidence, getClassesParam())
  },
}
