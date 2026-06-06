import { getOpenVinoBboxThumbnailUrl, getClassesParam } from '../../api.js'

export default {
  key: 'openvino_bbox',
  label: 'OpenVINO Boxes',
  params: [],
  getImageUrl(file) {
    const model = localStorage.getItem('openvino_model') || 'yolov8n'
    const confidence = parseFloat(localStorage.getItem('openvino_confidence') || '0.25')
    return getOpenVinoBboxThumbnailUrl(file.id, model, confidence, getClassesParam())
  },
}
