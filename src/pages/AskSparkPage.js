import React, { useRef, useState } from "react";
import { ASK_SPARK_CATEGORIES, askSpark } from "../askSpark/askSparkService";

const EXAMPLES = [
  "How do I complete a production record?",
  "What records do I need for supper?",
  "What do I do if a student needs a special diet?",
  "What should I check before an Administrative Review?",
];

function AskSparkPage({ location, onBack }) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const answerRef = useRef(null);

  async function submit(event, example) {
    event?.preventDefault();
    const nextQuestion = String(example || question).trim();
    if (!nextQuestion || loading) return;
    setQuestion(nextQuestion);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await askSpark(nextQuestion, category);
      setResult(response);
      setTimeout(() => answerRef.current?.focus(), 0);
    } catch (requestError) {
      setError(requestError.message || "Ask SPARK could not complete the search.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ask-spark-page">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="Spark" /></div>
          <div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">SPARK</div></div>
        </div>
        <button type="button" className="homebase-exit-button" onClick={onBack}>← Manager Resources</button>
      </header>

      <main className="ask-spark-main">
        <section className="ask-spark-hero">
          <div className="ask-spark-mark" aria-hidden="true">✦</div>
          <div><span>APPROVED TRAINING GUIDANCE</span><h1>Ask SPARK</h1><p>Ask a cafeteria operations question. SPARK will answer only from the approved training library and show where the answer came from.</p></div>
        </section>

        <form className="ask-spark-form" onSubmit={submit}>
          <label htmlFor="ask-spark-question">What do you need help with?</label>
          <textarea id="ask-spark-question" rows="4" maxLength="500" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: How do I complete a production record?" disabled={loading} />
          <div className="ask-spark-form-footer">
            <label className="ask-spark-category">Topic (optional)
              <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={loading}>
                <option value="">All approved topics</option>
                {ASK_SPARK_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <button type="submit" className="ask-spark-submit" disabled={loading || !question.trim()}>
              {loading ? <><span className="spark-thinking-spinner" aria-hidden="true" /> Searching approved guidance…</> : <>✦ Ask SPARK</>}
            </button>
          </div>
          <small className="ask-spark-character-count">{question.length}/500</small>
        </form>

        {!result && !error && !loading && (
          <section className="ask-spark-examples" aria-labelledby="ask-spark-examples-title">
            <h2 id="ask-spark-examples-title">Try asking</h2>
            <div>{EXAMPLES.map((example) => <button type="button" key={example} onClick={(event) => submit(event, example)}>{example}<span aria-hidden="true">›</span></button>)}</div>
          </section>
        )}

        {error && <div className="ask-spark-state ask-spark-error" role="alert"><strong>Ask SPARK is unavailable right now.</strong><p>{error}</p><button type="button" onClick={() => submit()}>Try again</button></div>}

        {result && (
          <section className={`ask-spark-answer ${result.supported ? "" : "ask-spark-no-answer"}`} tabIndex="-1" ref={answerRef} aria-live="polite">
            <div className="ask-spark-answer-heading"><span aria-hidden="true">{result.supported ? "✦" : "⌕"}</span><div><small>ASK SPARK ANSWER</small><h2>{result.supported ? "Here’s what the approved guidance says" : "No confirmed answer found"}</h2></div></div>
            <p className="ask-spark-answer-text">{result.answer}</p>
            {result.supported && result.citations?.length > 0 && (
              <div className="ask-spark-sources"><h3>Sources</h3><p>These approved materials support the answer above.</p><ol>{result.citations.map((citation) => <li key={citation.chunkId}><strong>{citation.title}</strong><span>{citation.locatorType && citation.locatorNumber ? `${citation.locatorType.charAt(0).toUpperCase()}${citation.locatorType.slice(1)} ${citation.locatorNumber}` : citation.citationLabel}</span><small>{citation.category}{citation.year ? ` · ${citation.year}` : ""}</small></li>)}</ol></div>
            )}
            <div className="ask-spark-caution"><strong>Confirm before acting when needed.</strong><span>Ask SPARK summarizes approved training sources. Contact your supervisor when the guidance does not address your situation.</span></div>
          </section>
        )}

        <p className="ask-spark-location">Searching approved resources for {location?.school_name || "your school"}. Ask SPARK does not search the open internet.</p>
      </main>
    </div>
  );
}

export default AskSparkPage;
