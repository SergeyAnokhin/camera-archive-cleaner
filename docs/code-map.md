# Code Map

Карта файлов проекта — что в каком файле лежит и за что каждый файл отвечает.

---

## Backend (`backend/`)

| Файл | Роль |
|---|---|
| [`main.py`](../backend/main.py) | FastAPI-приложение. Все HTTP-эндпоинты, настройка логирования (ANSI цвета, уровни TRACE/DEBUG/INFO), CORS, startup-хук |
| [`database.py`](../backend/database.py) | SQLite: схема таблиц, все SQL-запросы (upsert, агрегации, пагинация, AI-анализ). Единственный файл, который трогает БД |
| [`scanner.py`](../backend/scanner.py) | Обход директорий камеры, парсинг timestamp из имён файлов (Foscam-паттерны + fallback на mtime), запись в БД |
| [`config.py`](../backend/config.py) | Парсинг `cameras.yaml` → датакласс `Camera` (id, name, path_snapshots, path_videos) |
| [`thumbnails.py`](../backend/thumbnails.py) | Генерация базовых превьюшек (256×256 JPEG, Pillow). Кэш в `thumbnails_cache/`. Используется для `/thumbnail/{id}` |
| [`diff_thumbnails.py`](../backend/diff_thumbnails.py) | Превьюшки Motion Diff: попарная разница кадров (OpenCV). Кэш в `diff_thumbnails_cache/` |
| [`erosion_thumbnails.py`](../backend/erosion_thumbnails.py) | Превьюшки Erosion: морфологическая эрозия движения. Кэш в `erosion_thumbnails_cache/` |
| [`motion_thumbnails.py`](../backend/motion_thumbnails.py) | Превьюшки для 5 режимов движения: MOG2, Neon Mask, MHI, Bounding Boxes, Motion Stacking. Кэш в `motion_thumbnails_cache/` |
| [`diff_zoom_thumbnails.py`](../backend/diff_zoom_thumbnails.py) | Превьюшки Diff Zoom: кроп зоны движения. Кэш в `diff_zoom_thumbnails_cache/` |
| `cameras.yaml` | Конфиг камер. Редактируется вручную перед запуском |
| `snapshots.db` | SQLite база данных (создаётся автоматически) |

### Зависимости между файлами backend

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py
                                  ▲
thumbnails.py ───────────────────┤
diff_thumbnails.py ──────────────┤  (все вызываются из main.py)
erosion_thumbnails.py ───────────┤
motion_thumbnails.py ────────────┤
diff_zoom_thumbnails.py ─────────┘
```

---

## Frontend (`frontend/src/`)

### Корневые файлы

| Файл | Роль |
|---|---|
| [`App.jsx`](../frontend/src/App.jsx) | Корневой компонент. Владеет всем состоянием: выбранная камера, уровень drill-down (year/month/day/hour), диапазон дат, режим удаления. Оркестрирует переходы между уровнями |
| [`api.js`](../frontend/src/api.js) | Все HTTP-запросы к бэкенду. Единственный файл, который знает про URL-адреса API |
| [`aiHelpers.js`](../frontend/src/aiHelpers.js) | Утилиты для AI-режимов просмотра: построение prompt, парсинг ответа |
| [`main.jsx`](../frontend/src/main.jsx) | Точка входа React. Монтирует `<App />` |

### Компоненты (`frontend/src/components/`)

| Файл | Роль |
|---|---|
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Просмотр часа: сетка фото/видео с пагинацией, distribution chart (60 столбцов по минутам), клавиатурная навигация, кнопка AI-анализа |
| [`HeatmapGrid.jsx`](../frontend/src/components/HeatmapGrid.jsx) | CSS-сетка ячеек тепловой карты. Скелетон при загрузке |
| [`HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx) | Одна ячейка тепловой карты: цвет интенсивности, бейджи фото/видео, стрип превьюшек, tooltip |
| [`GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) | Модал результатов Gemini AI-анализа: описание сцены, объекты, статистика токенов/стоимости/времени |
| [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) | Модал результатов Claude AI-анализа (аналогично Gemini) |
| [`DeleteConfirmModal.jsx`](../frontend/src/components/DeleteConfirmModal.jsx) | Модал подтверждения удаления: список файлов с относительными путями, предпросмотр парных видео |
| [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) | Модал настроек (вкладки): размер шрифта, превью на ячейку, zoom, очистка кэша, Google AI / Claude AI конфиг |
| [`Header.jsx`](../frontend/src/components/Header.jsx) | Верхняя панель: суммарный GB / кол-во фото / видео |
| [`CameraSelector.jsx`](../frontend/src/components/CameraSelector.jsx) | Горизонтальные кнопки-пилюли для выбора камеры |
| [`DrilldownBreadcrumb.jsx`](../frontend/src/components/DrilldownBreadcrumb.jsx) | Хлебные крошки навигации: All Years / 2024 / Nov / 16 |
| [`StatsBar.jsx`](../frontend/src/components/StatsBar.jsx) | Recharts bar chart под тепловой картой (размер по периодам) |
| [`ScanButton.jsx`](../frontend/src/components/ScanButton.jsx) | Кнопка «Scan», спиннер, обновление данных после сканирования |
| [`ToolsButton.jsx`](../frontend/src/components/ToolsButton.jsx) | Кнопка открытия ToolsModal |

### Режимы просмотра (`frontend/src/components/viewModes/`)

Каждый файл — один режим визуализации. Экспортирует функцию, которая принимает `file_id` и возвращает URL превьюшки.

| Файл | Режим |
|---|---|
| [`normalMode.js`](../frontend/src/components/viewModes/normalMode.js) | Обычное фото (базовый thumbnail) |
| [`motionDiffMode.js`](../frontend/src/components/viewModes/motionDiffMode.js) | Motion Diff (попарная разница кадров) |
| [`diffZoomMode.js`](../frontend/src/components/viewModes/diffZoomMode.js) | Diff Zoom (кроп зоны движения) |
| [`erosionMode.js`](../frontend/src/components/viewModes/erosionMode.js) | Erosion (морфологическая эрозия) |
| [`neonMaskMode.js`](../frontend/src/components/viewModes/neonMaskMode.js) | Neon Mask (MOG2 маска в цвете) |
| [`mhiMode.js`](../frontend/src/components/viewModes/mhiMode.js) | MHI — Motion History Image |
| [`boundingBoxesMode.js`](../frontend/src/components/viewModes/boundingBoxesMode.js) | Bounding Boxes (рамки вокруг объектов) |
| [`motionStackingMode.js`](../frontend/src/components/viewModes/motionStackingMode.js) | Motion Stacking (наложение кадров движения) |
| [`geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) | Gemini AI (иконка результата анализа) |
| [`claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) | Claude AI (иконка результата анализа) |
| [`index.js`](../frontend/src/components/viewModes/index.js) | Реестр всех режимов — единая точка импорта |

### Стили

| Файл | Роль |
|---|---|
| [`styles/variables.css`](../frontend/src/styles/variables.css) | CSS-переменные: тёмная палитра (Home Assistant), шкала интенсивности тепловой карты |
| [`styles/global.css`](../frontend/src/styles/global.css) | Глобальные стили, сброс |
| `*.css` (рядом с компонентами) | Стили конкретного компонента |

### Конфигурационные файлы frontend

| Файл | Роль |
|---|---|
| [`vite.config.js`](../frontend/vite.config.js) | Vite: проксирует `/api/*` → `http://localhost:8000` |
| [`package.json`](../frontend/package.json) | Зависимости: React, Recharts, Vite |
| [`index.html`](../frontend/index.html) | HTML-точка входа; подключает MDI-иконки из CDN |
