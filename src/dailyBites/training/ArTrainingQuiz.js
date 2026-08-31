import React, { useMemo, useState } from "react";
import { AR_TRAINING_QUESTIONS } from "../../data/arTrainingQuestions";
import { seededQuestionOrder } from "./arTrainingUtils";

function ArTrainingQuiz({ serviceDate, dailyPoints, weekday, loading, disabled, onAnswer }) {
  const questions = useMemo(() => seededQuestionOrder(AR_TRAINING_QUESTIONS, `${serviceDate}-${Date.now()}`), [serviceDate]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const question = questions[index % questions.length];
  const capReached = dailyPoints >= 10;

  async function choose(choiceIndex) {
    if (saving || feedback || disabled) return;
    setSelected(choiceIndex);
    setSaving(true);
    const result = await onAnswer(question, choiceIndex);
    if (!result) {
      setSelected(null);
      setSaving(false);
      return;
    }
    setFeedback({ correct: result.correct, points: result.pointsEarned || 0, dailyPoints: result.dailyPoints ?? dailyPoints });
    setSaving(false);
  }

  function nextQuestion() {
    setIndex((current) => current + 1);
    setSelected(null);
    setFeedback(null);
  }

  return (
    <section className="ar-quiz" aria-labelledby="ar-training-title">
      <div className="ar-quiz-heading">
        <div className="ar-quiz-badge" aria-hidden="true">AR</div>
        <div>
          <span className="ar-quiz-eyebrow">ADMINISTRATIVE REVIEW PRACTICE</span>
          <h2 id="ar-training-title">AR Training</h2>
          <p>Quick questions grounded in approved SPARK training materials.</p>
        </div>
        <div className={`ar-points-meter ${capReached ? "complete" : ""}`}>
          <strong>{loading ? "—" : `${dailyPoints} / 10`}</strong>
          <span>points today</span>
        </div>
      </div>

      <div className="ar-progress-track" aria-label={`${dailyPoints} of 10 possible points earned today`}>
        <span style={{ width: `${Math.min(100, dailyPoints * 10)}%` }} />
      </div>
      <div className="ar-quiz-status">
        <span>{!weekday ? "Weekend practice — points resume Monday." : capReached ? "Daily points complete — keep practicing!" : "Earn 2 points for each correct answer."}</span>
        <span>Question {index + 1}</span>
      </div>

      <article className="ar-question-card">
        <div className="ar-question-meta"><span>{question.type}</span><span>{question.category}</span></div>
        <h3>{question.prompt}</h3>
        <div className="ar-choice-grid">
          {question.choices.map((choice, choiceIndex) => {
            const isCorrect = feedback && choiceIndex === question.correctIndex;
            const isWrong = feedback && selected === choiceIndex && !feedback.correct;
            return (
              <button key={choice} type="button" onClick={() => choose(choiceIndex)} disabled={saving || Boolean(feedback) || disabled} className={`${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}>
                <span>{String.fromCharCode(65 + choiceIndex)}</span>{choice}
                {isCorrect && <strong aria-label="Correct answer">✓</strong>}
                {isWrong && <strong aria-label="Incorrect answer">×</strong>}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`ar-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
            <div><strong>{feedback.correct ? (feedback.points ? `Correct — +${feedback.points} SPARK points!` : "Correct — practice complete!") : "Not quite — no points lost."}</strong><p>{question.explanation}</p></div>
            <div className="ar-provenance"><span>Approved source</span><strong>{question.source.title}</strong><small>{question.source.locator} · {question.source.chunkId}</small></div>
            <button type="button" onClick={nextQuestion}>Next question <span aria-hidden="true">→</span></button>
          </div>
        )}
      </article>
    </section>
  );
}

export default ArTrainingQuiz;
