// Token/cost stats row + structured {scene, images} response rendering.
// Shared by GeminiAnalysisModal and ClaudeAnalysisModal (cloud AI batch results).
export function AiStatsRow({ result }) {
  if (!result) return null
  return (
    <div className="gai-stats">
      <span><i className="mdi mdi-timer-outline" /> {(result.elapsed_ms / 1000).toFixed(1)} s</span>
      <span><i className="mdi mdi-image-outline" /> {result.images_used}</span>
      <span><i className="mdi mdi-counter" /> {result.total_tokens.toLocaleString()} tok</span>
      <span className="gai-stats-detail">in {result.input_tokens.toLocaleString()} · out {result.output_tokens.toLocaleString()}</span>
      <span><i className="mdi mdi-currency-usd" /> ${result.cost_usd.toFixed(6)}</span>
      {result.saved_count > 0 && (
        <span className="gai-saved-badge">
          <i className="mdi mdi-database-check-outline" /> {result.saved_count} saved
        </span>
      )}
    </div>
  )
}

// scene + per-image list + raw fallback when JSON parsing failed
export function StructuredResponse({ result }) {
  if (!result) return null
  const parsedImages = result.parsed?.images ?? null
  const parsedScene  = result.parsed?.scene ?? null
  return (
    <>
      {parsedScene && (
        <div className="gai-response">
          <div className="gai-response-label">
            <i className="mdi mdi-image-filter-hdr-outline" /> Overall scene
          </div>
          <div className="gai-response-text gai-scene-text">{parsedScene}</div>
        </div>
      )}
      {parsedImages && (
        <div className="gai-response">
          <div className="gai-response-label">
            <i className="mdi mdi-format-list-numbered" /> Per-image analysis ({parsedImages.length})
          </div>
          <div className="gai-images-list">
            {parsedImages.map((img, i) => (
              <div key={i} className="gai-image-entry">
                <div className="gai-image-idx">#{i + 1}</div>
                <div className="gai-image-content">
                  <div className="gai-image-desc">{img.description}</div>
                  {img.objects?.length > 0 && (
                    <div className="gai-image-objects">
                      {img.objects.map((o, j) => <span key={j} className="gai-obj-tag">{o}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!parsedScene && result.raw_text && (
        <div className="gai-response">
          <div className="gai-response-label">Response (raw — failed to parse JSON)</div>
          <div className="gai-response-text">{result.raw_text}</div>
        </div>
      )}
    </>
  )
}
