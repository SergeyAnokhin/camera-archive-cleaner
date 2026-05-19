# API Reference

FastAPI-бэкенд на порту `8000`. Swagger UI: `http://localhost:8000/docs`.

Все параметры фильтрации (`camera_id`, `date_from`, `date_to`) необязательны — без них запрос охватывает все камеры и всё время.

---

## Камеры и сканирование

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/cameras` | Список камер из `cameras.yaml` — id, name, пути |
| `POST` | `/scan` | Сканировать директории и обновить БД. Параметр `?camera_id=` — одна камера; без него — все |

---

## Статистика

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/stats` | Агрегированная статистика. Параметр `group_by`: `total` / `camera` / `year` / `month` / `day` / `hour`. Опционально: `camera_id`, `date_from`, `date_to` |
| `GET` | `/distribution` | 60 бакетов (по минуте) для диапазона дат. Используется в HourViewer для distribution chart |

---

## Файлы и превью

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/files` | Постраничный список файлов. Параметры: `camera_id`, `date_from`, `date_to`, `page`, `page_size` |
| `GET` | `/previews` | N равномерно выбранных `file_id` фотографий за период. Используется для стрипа превьюшек в ячейках тепловой карты |
| `GET` | `/media/{file_id}` | Отдаёт оригинальный файл (фото или видео) с правильным MIME-типом |

---

## Миниатюры (thumbnails)

Все thumbnail-эндпоинты генерируют и кэшируют превьюшку при первом обращении.

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/thumbnail/{file_id}` | Базовая миниатюра 256×256 JPEG |
| `GET` | `/diff_thumbnail/{file_id}` | Motion Diff: разница кадра со средним по странице. Параметры: `page_ids` (через запятую), `threshold` (0–255, по умолч. 20) |
| `GET` | `/diff_zoom_thumbnail/{file_id}` | Diff Zoom: кроп до самого активного тайла 1/9. Параметры: те же |
| `GET` | `/erosion_thumbnail/{file_id}` | Erosion/MOG2: морфологическая эрозия движения. Параметры: те же |
| `GET` | `/motion_thumbnail/{file_id}` | Один из 4 motion-режимов: `neon_mask` / `mhi` / `bounding_boxes` / `motion_stacking`. Параметры: `page_ids`, `threshold`, `mode` |

---

## Удаление

| Метод | Путь | Тело запроса | Описание |
|---|---|---|---|
| `POST` | `/delete/preview` | `{"file_ids": [...]}` | Превью удаления: список выбранных файлов + автоматически найденные парные видео (±5 сек) |
| `POST` | `/delete/confirm` | `{"file_ids": [...]}` | Физически удалить файлы с диска и из БД. Попутно удаляет превьюшки |
| `POST` | `/delete/preview_range` | `{"camera_id": ..., "date_from": ..., "date_to": ...}` | Превью удаления всего диапазона дат |
| `POST` | `/delete/by_range` | те же поля | Удалить все файлы в диапазоне дат |

---

## AI-анализ

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/gemini_analyze` | Анализ изображений через Gemini — свободный текстовый ответ. Тело: `file_ids`, `prompt`, `model`, `api_key` |
| `POST` | `/gemini_analyze_batch` | Анализ через Gemini с JSON-ответом, результаты сохраняются в `ai_analysis` |
| `POST` | `/claude_analyze_batch` | Анализ через Anthropic Claude с JSON-ответом, результаты сохраняются в `ai_analysis` |
| `GET` | `/ai_analysis` | Получить сохранённые AI-результаты. Параметр: `file_ids` через запятую |
| `GET` | `/ai_objects_summary` | Уникальные объекты, обнаруженные AI за диапазон. Опционально: `camera_id`, `date_from`, `date_to` |

---

## Обслуживание (maintenance)

| Метод | Путь | Описание |
|---|---|---|
| `DELETE` | `/database` | Удалить все записи файлов из БД (не трогает файлы на диске) |
| `DELETE` | `/thumbnails` | Удалить базовые превьюшки (диск + БД) |
| `DELETE` | `/diff_thumbnails` | Удалить diff-превьюшки |
| `DELETE` | `/erosion_thumbnails` | Удалить erosion-превьюшки |
| `DELETE` | `/diff_zoom_thumbnails` | Удалить diff-zoom-превьюшки |
| `DELETE` | `/motion_thumbnails` | Удалить motion-превьюшки |
| `DELETE` | `/all_thumbnails` | Удалить все превьюшки всех типов |
| `GET` | `/storage_info` | Размер БД и всех кэшей превьюшек в байтах |
