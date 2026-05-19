# Database

SQLite база данных (`backend/snapshots.db`). Инициализируется при старте бэкенда через [`backend/database.py`](../backend/database.py).

---

## Таблицы

### `files` — индекс файлов на диске

Основная таблица. Заполняется сканером при вызове `/scan`. Каждый файл (фото или видео) — одна строка.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | INTEGER PK | Автоинкремент |
| `camera_id` | TEXT | ID камеры из `cameras.yaml` |
| `file_type` | TEXT | `'photo'` или `'video'` |
| `file_path` | TEXT UNIQUE | Полный путь к файлу на диске |
| `file_size` | INTEGER | Размер файла в байтах |
| `timestamp` | TEXT | Время снимка в ISO-8601 (из имени файла или mtime) |

**Индексы:**
- `idx_cam_ts` — `(camera_id, timestamp)` — для heatmap-запросов
- `idx_cam_type_ts` — `(camera_id, file_type, timestamp)` — для фильтрации по типу

**Поведение при сканировании:** перед каждым `/scan` все записи для данной `camera_id` удаляются, затем пересоздаются заново (`DELETE` + `upsert`).

---

### `thumbnails` — кэш миниатюр

Хранит пути к сгенерированным превьюшкам (256×256 JPEG). Генерируются лениво при первом обращении к `/thumbnail/{file_id}`.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | INTEGER PK | Автоинкремент |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `thumb_path` | TEXT | Путь к файлу миниатюры в `thumbnails_cache/` |
| `created_at` | TEXT | Время создания (для автоочистки) |

Миниатюры старше 30 дней удаляются автоматически через `pop_old_basic_thumbnails()`. Все миниатюры можно сбросить вручную через `DELETE /thumbnails`.

---

### `ai_analysis` — результаты AI-анализа

Кэш результатов Gemini-анализа снимков. Один файл — одна запись. При повторном анализе запись перезаписывается (`ON CONFLICT DO UPDATE`).

| Колонка | Тип | Описание |
|---|---|---|
| `id` | INTEGER PK | Автоинкремент |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `provider` | TEXT | Провайдер AI (сейчас `'gemini'`) |
| `model` | TEXT | Модель (например, `gemini-2.0-flash`) |
| `analyzed_at` | TEXT | Время анализа |
| `scene_description` | TEXT | Тип сцены (улица, двор, парковка и т.д.) |
| `image_description` | TEXT | Детальное описание того, что видно на снимке |
| `objects` | TEXT | JSON-массив обнаруженных объектов |

**Индекс:** `idx_ai_analysis_file` — `(file_id)`.

---

## Каскадные удаления

При удалении строки из `files` — автоматически удаляются связанные записи в `thumbnails` и `ai_analysis` (`ON DELETE CASCADE`).

```
files
  ├── thumbnails   (CASCADE DELETE)
  └── ai_analysis  (CASCADE DELETE)
```

---

## Схема потока данных

```
/scan (POST)
    │
    ▼
scanner.py ──► upsert_file() ──► files
                                    │
/thumbnail/{id} (GET)               │
    │                               │
    ▼                               │
thumbnails.py ──► save_thumbnail_path() ──► thumbnails
                                    │
/gemini_analyze (POST)              │
    │                               │
    ▼                               │
Gemini API ──► save_ai_analysis() ──► ai_analysis
```
