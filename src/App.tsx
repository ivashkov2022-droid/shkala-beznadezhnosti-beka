import { useEffect, useMemo, useRef, useState } from "react";
import { options, questions, scoreRanges, themeLabels, type ThemeCode } from "./test-data";

type Screen = "test" | "result" | "history";
type Answers = Record<number, boolean>;
type SavedResult = { id: string; date: string; score: number; range: string };

const ANSWERS_KEY = "bhs-working-answers-v1";
const HISTORY_KEY = "bhs-working-history-v1";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("test");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<SavedResult[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  const questionPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedAnswers = sessionStorage.getItem(ANSWERS_KEY);
        const storedHistory = localStorage.getItem(HISTORY_KEY);
        if (storedAnswers) setAnswers(JSON.parse(storedAnswers));
        if (storedHistory) setHistory(JSON.parse(storedHistory));
      } catch {
        // If browser storage is unavailable, the test still works in memory.
      } finally {
        setReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    } catch {
      // Storage is optional.
    }
  }, [answers, ready]);

  const answerCount = Object.keys(answers).length;
  const progress = Math.round((answerCount / questions.length) * 100);
  const selected = answers[current];
  const score = Object.entries(answers).reduce(
    (sum, [index, value]) => sum + (value === questions[Number(index)].pointFor ? 1 : 0),
    0,
  );
  const resultRange = scoreRanges.find((range) => score >= range.min && score <= range.max) ?? scoreRanges[0];
  const previousResult = screen === "result" ? history[1] : undefined;
  const scoreDifference = previousResult ? score - previousResult.score : null;

  const themeSummary = useMemo(
    () => (Object.entries(themeLabels) as [ThemeCode, string][])
      .map(([code, label]) => {
        const items = questions.map((question, index) => ({ question, index })).filter(({ question }) => question.theme === code);
        const count = items.filter(({ question, index }) => answers[index] === question.pointFor).length;
        return { code, label, count, total: items.length };
      })
      .sort((a, b) => (b.count / b.total) - (a.count / a.total)),
    [answers],
  );

  function chooseAnswer(value: boolean) {
    setAnswers((previous) => ({ ...previous, [current]: value }));
  }

  function goToQuestion(index: number) {
    setCurrent(index);
    setScreen("test");
  }

  function revealQuestionOnMobile() {
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 920px)").matches) {
        questionPanelRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      }
    });
  }

  function previous() {
    if (current === 0) return;
    setCurrent((value) => Math.max(0, value - 1));
    revealQuestionOnMobile();
  }

  function next() {
    if (selected === undefined) return;
    if (current < questions.length - 1) {
      setCurrent((value) => value + 1);
      return;
    }
    finish();
  }

  function finish() {
    if (answerCount !== questions.length) {
      const firstMissing = questions.findIndex((_, index) => answers[index] === undefined);
      if (firstMissing >= 0) setCurrent(firstMissing);
      return;
    }
    const nextResult: SavedResult = {
      id: `bhs-${Date.now()}`,
      date: new Date().toISOString(),
      score,
      range: resultRange.label,
    };
    const nextHistory = [nextResult, ...history].slice(0, 24);
    setHistory(nextHistory);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      sessionStorage.removeItem(ANSWERS_KEY);
    } catch {
      // Storage is optional.
    }
    setScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restart() {
    setAnswers({});
    setCurrent(0);
    setScreen("test");
    try {
      sessionStorage.removeItem(ANSWERS_KEY);
    } catch {
      // Storage is optional.
    }
  }

  function clearHistory() {
    if (!window.confirm("Удалить сохранённую историю этого теста на устройстве?")) return;
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Storage is optional.
    }
  }

  function deleteHistoryItem(id: string) {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      // Storage is optional.
    }
  }

  async function saveLink() {
    const url = window.location.href.split(/[?#]/)[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: "Шкала безнадёжности Бека", text: "Сохраните тест, чтобы вернуться к нему через неделю.", url });
      } else {
        await navigator.clipboard.writeText(url);
        setLinkSaved(true);
        window.setTimeout(() => setLinkSaved(false), 2500);
      }
    } catch {
      // Closing the share dialog is not an error for the user.
    }
  }

  return (
    <main className="assessment-app font-golos">
      <header className="assessment-header">
        <button className="test-name" type="button" onClick={() => setScreen("test")}>
          <span className="test-code">BHS</span>
          <span>Шкала безнадёжности Бека</span>
        </button>
        <p className="header-purpose">Оценивает негативные ожидания относительно будущего за 7 дней. При повторении история сохранится.</p>
        <div className="header-actions">
          <button className="save-header-button" type="button" onClick={saveLink}>{linkSaved ? "Ссылка сохранена" : "Сохранить тест"}</button>
          <button type="button" onClick={() => setShowInfo(true)}>О методике</button>
          <button type="button" onClick={() => setScreen("history")}>История <b>{history.length}</b></button>
        </div>
      </header>

      {screen === "test" && (
        <>
          <section className="mobile-intro" aria-label="О тесте">
            <p className="micro-label">Шкала безнадёжности Бека · 20 утверждений</p>
            <h1>Оценивает негативные ожидания относительно будущего за 7 дней</h1>
            <p>При повторном прохождении история сохранится в этом браузере и покажет динамику. Ответы не отправляются на сервер.</p>
          </section>

          <div className="test-layout">
          <aside className="test-sidebar">
            <div className="sidebar-copy">
              <p className="micro-label">Период оценки</p>
              <h1>Последняя неделя,<br />включая сегодня</h1>
              <p>Для каждого утверждения выберите, было ли оно верным для вас в течение последней недели.</p>
            </div>

            <div className="test-status">
              <div className="status-head"><span>Заполнено</span><strong>{answerCount} / {questions.length}</strong></div>
              <div className="status-bar"><i style={{ width: `${progress}%` }} /></div>
              <span className="status-percent">{progress}%</span>
            </div>

            <div className="question-map" aria-label="Навигация по вопросам">
              {questions.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  className={`${index === current ? "current" : ""} ${answers[index] !== undefined ? "answered" : ""}`}
                  onClick={() => goToQuestion(index)}
                  aria-label={`Вопрос ${index + 1}${answers[index] !== undefined ? ", отвечен" : ""}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <div className="sidebar-notes">
              <p className="weekly-note"><strong>Для наблюдения динамики</strong> возвращайтесь к тесту примерно раз в 7 дней — желательно в похожее время и условиях.</p>
              <p className="privacy-note"><span>●</span> Ответы остаются в этом браузере и не отправляются на сервер.</p>
            </div>
          </aside>

          <section className="question-panel" ref={questionPanelRef}>
            <div className="question-topline">
              <span>Вопрос {String(current + 1).padStart(2, "0")}</span>
              <span>из {questions.length}</span>
            </div>

            <div className="question-body">
              <h2>{questions[current].text}</h2>
              <p className="answer-prompt">Верно или неверно?</p>
              <div className="response-list" role="radiogroup" aria-label="Ответ на утверждение">
                {options.map((option, index) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected === option.value}
                    className={`response-${index} ${selected === option.value ? "selected" : ""}`}
                    key={String(option.value)}
                    onClick={() => chooseAnswer(option.value)}
                  >
                    <span className="response-number">{index + 1}</span>
                    <span className="radio-mark" aria-hidden="true"><i /></span>
                    <span className="response-copy">
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="question-controls">
              <button className="back-control" type="button" disabled={current === 0} onClick={previous}>← Назад</button>
              <span className="save-state">{selected === undefined ? "Ответ не выбран" : "Ответ сохранён"}</span>
              <button className="next-control" type="button" disabled={selected === undefined} onClick={next}>
                {current === questions.length - 1 ? "Завершить" : "Следующий вопрос"} <span>→</span>
              </button>
            </div>
          </section>
          </div>
        </>
      )}

      {screen === "result" && (
        <section className="result-view">
          <div className="result-heading">
            <div>
              <p className="micro-label">Результат за последнюю неделю</p>
              <h1>{resultRange.label}</h1>
              <p>{resultRange.explanation}</p>
            </div>
            <div className="score-card"><strong>{score}</strong><span>из 20 баллов</span></div>
          </div>

          <div className="result-scale">
            <div className="result-marker" style={{ left: `${(score / 20) * 100}%` }}><i /><span>{score}</span></div>
            <div className="scale-segments"><i /><i /><i /><i /></div>
            <div className="scale-labels"><span>0</span><span>3</span><span>8</span><span>14</span><span>20</span></div>
          </div>

          <div className="trend-summary">
            <p className="micro-label">Сравнение с предыдущим прохождением</p>
            {previousResult && scoreDifference !== null ? (
              <div>
                <strong>{scoreDifference === 0 ? "Без изменения" : `На ${Math.abs(scoreDifference)} ${Math.abs(scoreDifference) === 1 ? "балл" : Math.abs(scoreDifference) < 5 ? "балла" : "баллов"} ${scoreDifference < 0 ? "ниже" : "выше"}`}</strong>
                <p>Предыдущий результат — {previousResult.score}/20 от {formatDate(previousResult.date)}. Это числовая динамика, а не отдельный клинический вывод.</p>
              </div>
            ) : (
              <div><strong>Первое измерение</strong><p>Следующее прохождение через неделю позволит увидеть направление изменения, а не только разовый балл.</p></div>
            )}
          </div>

          <div className="result-columns">
            <article className="result-advice"><p className="micro-label">Что можно сделать</p><h2>{resultRange.nextStep}</h2></article>
            <article className="result-symptoms">
              <p className="micro-label">Тематический профиль</p>
              <ol>{themeSummary.map((item) => <li key={item.code}><span>{item.label}</span><b>{item.count}/{item.total}</b></li>)}</ol>
            </article>
          </div>

          <div className="clinical-disclaimer">
            <strong>Это не диагноз</strong>
            <p>Результат описывает выраженность негативных ожиданий за последнюю неделю. Он не устанавливает депрессию, не определяет намерения человека и не заменяет личную оценку состояния специалистом.</p>
          </div>

          <div className="result-buttons">
            <button className="primary-button" type="button" onClick={() => window.print()}>Распечатать результат</button>
            <button type="button" onClick={() => setScreen("history")}>Посмотреть историю</button>
            <button type="button" onClick={restart}>Пройти заново</button>
          </div>
          <div className="return-reminder">
            <div><p className="micro-label">Сохраните ссылку — история останется с вами</p><strong>Возвращайтесь к тесту примерно раз в 7 дней</strong><span>Результаты сохранятся на этом устройстве, и вы сможете видеть свою динамику при повторных прохождениях в этом браузере.</span></div>
            <button type="button" onClick={saveLink}>{linkSaved ? "Ссылка скопирована" : "Поделиться / сохранить ссылку"}</button>
          </div>
        </section>
      )}

      {screen === "history" && (
        <section className="history-view">
          <div className="history-heading">
            <div><p className="micro-label">Локальная история</p><h1>Динамика ожиданий относительно будущего</h1><p className="history-intro">Для сопоставимости проходите тест примерно раз в неделю, ориентируясь на одинаковый период — последние семь дней.</p></div>
            <button type="button" onClick={() => setScreen("test")}>Вернуться к тесту →</button>
          </div>
          {!history.length ? (
            <div className="history-empty"><strong>Измерений пока нет</strong><p>Завершённый тест автоматически сохранится здесь.</p></div>
          ) : (
            <div className="history-table">
              {history.map((item) => (
                <article key={item.id}>
                  <time>{formatDate(item.date)}</time>
                  <div className="history-line"><i style={{ width: `${(item.score / 20) * 100}%` }} /></div>
                  <strong>{item.score}<small>/20</small></strong>
                  <div className="history-range">
                    <span>{item.range}</span>
                    <button className="delete-entry" type="button" onClick={() => deleteHistoryItem(item.id)} aria-label={`Удалить результат от ${formatDate(item.date)}`} title="Удалить эту запись">
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 6.5h9m-7-2h5m-6.2 2 .7 9h6l.7-9M8.7 9v4m2.6-4v4" /></svg>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!!history.length && <button className="clear-button" type="button" onClick={clearHistory}>Удалить историю на устройстве</button>}
          <div className="history-save-link"><span>Сохраните ссылку и проходите тест раз в неделю: результаты останутся на этом устройстве и сложатся в историю изменений.</span><button type="button" onClick={saveLink}>{linkSaved ? "Ссылка скопирована" : "Поделиться / сохранить ссылку"}</button></div>
        </section>
      )}

      {showInfo && (
        <div className="modal-backdrop">
          <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title">
            <button className="modal-close" type="button" onClick={() => setShowInfo(false)} aria-label="Закрыть">×</button>
            <p className="micro-label">Шкала безнадёжности Бека / BHS</p>
            <h2 id="info-title">О методике и расчёте</h2>
            <p>Шкалу разработали Аарон Бек, Арлин Вайсман, Дэвид Лестер и Ларри Трекслер; первое исследование опубликовано в 1974 году. Методика описывает негативные ожидания и отношение человека к будущему.</p>
            <p>В BHS 20 утверждений с ответами «верно» или «неверно». Балл начисляется за подтверждение пессимистического утверждения или отрицание оптимистического; итоговая сумма находится в диапазоне от 0 до 20.</p>
            <dl>
              <div><dt>0–3</dt><dd>минимальная выраженность</dd></div>
              <div><dt>4–8</dt><dd>лёгкая выраженность</dd></div>
              <div><dt>9–14</dt><dd>умеренная выраженность</dd></div>
              <div><dt>15–20</dt><dd>высокая выраженность</dd></div>
            </dl>
            <p className="modal-note">Суммарный балл нельзя автоматически переводить в вывод о суицидальных намерениях. Если вы чувствуете непосредственную угрозу жизни или здоровью, позвоните 112 и обратитесь к человеку, который может находиться рядом.</p>
            <div className="method-links">
              <a href="https://pubmed.ncbi.nlm.nih.gov/4436473/" target="_blank" rel="noreferrer">Первое исследование шкалы</a>
              <a href="https://www.pearsonclinical.co.uk/en-gb/Store/Professional-Assessments/Personality-%26-Biopsychosocial/Brief/Beck-Hopelessness-Scale/p/P100009006" target="_blank" rel="noreferrer">Описание BHS у издателя</a>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowInfo(false)}>Понятно</button>
          </section>
        </div>
      )}
    </main>
  );
}
