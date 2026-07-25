import {
  loadState,
  saveState,
  clearState,
  createEmptySession,
  upsertAnswer,
  buildExportPayload,
  downloadJson
} from "./storage.js";
import {
  resolveOptions,
  buildQuestionQueue,
  validateSelection,
  selectionHint,
  buildNeedsSummary,
  buildRecommendations
} from "./quiz.js";

const CHECK_SVG = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
`;

const STAGE_LABELS = {
  overview: "Tổng quan",
  detail: "Đi sâu hơn",
  closing: "Phong cách nhận quà"
};

const els = {
  welcome: document.getElementById("screen-welcome"),
  quiz: document.getElementById("screen-quiz"),
  results: document.getElementById("screen-results"),
  error: document.getElementById("screen-error"),
  errorMessage: document.getElementById("error-message"),
  btnStart: document.getElementById("btn-start"),
  btnResume: document.getElementById("btn-resume"),
  btnBack: document.getElementById("btn-back"),
  btnNext: document.getElementById("btn-next"),
  btnExport: document.getElementById("btn-export"),
  btnExportResults: document.getElementById("btn-export-results"),
  btnRestart: document.getElementById("btn-restart"),
  btnRetry: document.getElementById("btn-retry"),
  progressLabel: document.getElementById("progress-label"),
  progressCount: document.getElementById("progress-count"),
  progressBar: document.getElementById("progress-bar"),
  progressFill: document.getElementById("progress-fill"),
  quizStage: document.getElementById("quiz-stage"),
  quizTitle: document.getElementById("quiz-title"),
  quizSubtitle: document.getElementById("quiz-subtitle"),
  quizOptions: document.getElementById("quiz-options"),
  quizHint: document.getElementById("quiz-hint"),
  quizCard: document.getElementById("quiz-card"),
  needsChips: document.getElementById("needs-chips"),
  timeline: document.getElementById("timeline"),
  giftList: document.getElementById("gift-list"),
  toast: document.getElementById("toast")
};

const state = {
  quiz: null,
  session: null,
  queue: [],
  index: 0,
  selected: new Set()
};

function showToast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  requestAnimationFrame(() => els.toast.classList.add("is-visible"));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.classList.remove("is-visible");
    setTimeout(() => {
      els.toast.hidden = true;
    }, 250);
  }, 2200);
}

function showScreen(name) {
  for (const key of ["welcome", "quiz", "results", "error"]) {
    const el = els[key];
    const active = key === name;
    el.hidden = !active;
    el.classList.toggle("is-active", active);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function persist() {
  if (!state.session) return;
  saveState({
    session: state.session,
    queueIds: state.queue.map((q) => q.id),
    index: state.index
  });
}

function currentQuestion() {
  return state.queue[state.index] || null;
}

function rebuildQueueFromAspects() {
  const aspects = state.session.answers.life_aspects?.selectedOptionIds || [];
  const previousId = currentQuestion()?.id;
  state.queue = buildQuestionQueue(state.quiz, aspects);

  // Keep index aligned if possible
  if (previousId) {
    const idx = state.queue.findIndex((q) => q.id === previousId);
    if (idx >= 0) state.index = idx;
  }
}

function loadSelectionForCurrent() {
  const q = currentQuestion();
  state.selected = new Set();
  if (!q) return;
  const saved = state.session.answers[q.id];
  if (saved?.selectedOptionIds) {
    saved.selectedOptionIds.forEach((id) => state.selected.add(id));
  }
}

function updateProgress() {
  const total = Math.max(state.queue.length, 1);
  const current = Math.min(state.index + 1, total);
  const pct = Math.round(((state.index) / total) * 100);
  els.progressLabel.textContent = STAGE_LABELS[currentQuestion()?.stage] || "Khám phá";
  els.progressCount.textContent = `${current}/${total}`;
  els.progressFill.style.width = `${Math.max(pct, 6)}%`;
  els.progressBar.setAttribute("aria-valuenow", String(pct));
}

function updateNextButton() {
  const q = currentQuestion();
  if (!q) {
    els.btnNext.disabled = true;
    return;
  }
  const validation = validateSelection(q, [...state.selected]);
  els.btnNext.disabled = !validation.ok;
  els.btnNext.textContent = state.index >= state.queue.length - 1 ? "Xem kết quả" : "Tiếp tục";
  els.btnBack.disabled = state.index === 0;
  els.quizHint.textContent = validation.ok ? selectionHint(q) : validation.message;
}

function toggleOption(optionId, question) {
  if (question.type === "single") {
    state.selected.clear();
    state.selected.add(optionId);
  } else {
    if (state.selected.has(optionId)) {
      state.selected.delete(optionId);
    } else {
      if (question.maxSelect && state.selected.size >= question.maxSelect) {
        showToast(`Chỉ được chọn tối đa ${question.maxSelect} mục`);
        return;
      }
      state.selected.add(optionId);
    }
  }
  renderOptions();
  updateNextButton();
}

function renderOptions() {
  const q = currentQuestion();
  const options = resolveOptions(q, state.quiz);
  const many = options.length > 6;
  els.quizOptions.classList.toggle("single-col", !many && q.type === "single");

  els.quizOptions.innerHTML = "";
  for (const opt of options) {
    const selected = state.selected.has(opt.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `option${selected ? " is-selected" : ""}`;
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.innerHTML = `
      <span class="option-emoji" style="${opt.color ? `background:${opt.color}22;color:${opt.color}` : ""}">${opt.emoji || (q.type === "multi" ? "＋" : "•")}</span>
      <span class="option-label">${opt.label}</span>
      <span class="option-check">${CHECK_SVG}</span>
    `;
    btn.addEventListener("click", () => toggleOption(opt.id, q));
    els.quizOptions.appendChild(btn);
  }
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) return;
  loadSelectionForCurrent();

  els.quizCard.style.animation = "none";
  // reflow to restart animation
  void els.quizCard.offsetWidth;
  els.quizCard.style.animation = "";

  els.quizStage.textContent = STAGE_LABELS[q.stage] || "Câu hỏi";
  els.quizTitle.textContent = q.title;
  els.quizSubtitle.textContent = q.subtitle || "";
  renderOptions();
  updateProgress();
  updateNextButton();
}

function commitCurrentAnswer() {
  const q = currentQuestion();
  const options = resolveOptions(q, state.quiz);
  const selectedMeta = options.filter((o) => state.selected.has(o.id));
  upsertAnswer(state.session, q, [...state.selected], selectedMeta);

  if (q.id === "life_aspects") {
    rebuildQueueFromAspects();
  }
  persist();
}

function finalizeSession() {
  const needs = buildNeedsSummary(state.quiz, state.session);
  const recommendations = buildRecommendations(state.quiz, state.session);
  state.session.derived = {
    selectedAspects: state.session.answers.life_aspects?.selectedOptionIds || [],
    tags: recommendations.tags,
    needs,
    recommendations: {
      day: recommendations.day,
      week: recommendations.week,
      month: recommendations.month,
      gifts: recommendations.gifts
    }
  };
  state.session.status = "completed";
  state.session.completedAt = new Date().toISOString();
  state.session.updatedAt = state.session.completedAt;
  persist();
  renderResults();
  showScreen("results");
}

function renderResults() {
  const { needs, recommendations } = state.session.derived;

  els.needsChips.innerHTML = needs
    .map(
      (n, i) => `
      <div class="chip" style="animation-delay:${i * 40}ms;color:${n.color};background:${n.color}18">
        <span>${n.emoji}</span>
        <strong>${n.label}</strong>
      </div>`
    )
    .join("");

  if (!needs.length) {
    els.needsChips.innerHTML = `<div class="chip">Chưa có khía cạnh nào được chọn</div>`;
  }

  const blocks = [
    { key: "day", label: "1 ngày", accent: "Hôm nay" },
    { key: "week", label: "1 tuần", accent: "Tuần này" },
    { key: "month", label: "1 tháng", accent: "Tháng này" }
  ];

  els.timeline.innerHTML = blocks
    .map((b) => {
      const items = recommendations[b.key] || [];
      const primary = items[0];
      const secondary = items[1];
      return `
        <article class="time-block">
          <header>
            <span class="time-label">${b.label}</span>
            <span style="color:var(--muted);font-size:0.8rem">${b.accent}</span>
          </header>
          <h4>${primary?.title || "Dành thời gian cho bản thân"}</h4>
          <p>${primary?.detail || ""}</p>
          ${
            secondary
              ? `<p style="margin-top:8px"><strong>+ ${secondary.title}</strong> — ${secondary.detail}</p>`
              : ""
          }
        </article>`;
    })
    .join("");

  const gifts = recommendations.gifts || [];
  els.giftList.innerHTML = gifts.length
    ? gifts
        .map(
          (g) => `
        <article class="gift-item">
          <strong>${g.title}</strong>
          <p>${g.reason}</p>
        </article>`
        )
        .join("")
    : `<article class="gift-item"><strong>Quà nhỏ ý nghĩa</strong><p>Dựa trên phong cách bạn chọn, một món bất ngờ nhẹ nhàng sẽ rất hợp.</p></article>`;
}

function startFresh() {
  clearState();
  state.session = createEmptySession(state.quiz);
  state.queue = buildQuestionQueue(state.quiz, []);
  state.index = 0;
  state.selected = new Set();
  persist();
  renderQuestion();
  showScreen("quiz");
}

function resumeSession(saved) {
  state.session = saved.session;
  const aspects = state.session.answers.life_aspects?.selectedOptionIds || [];
  state.queue = buildQuestionQueue(state.quiz, aspects);
  state.index = Math.min(saved.index || 0, Math.max(state.queue.length - 1, 0));

  if (state.session.status === "completed" && state.session.derived?.recommendations) {
    renderResults();
    showScreen("results");
    return;
  }
  renderQuestion();
  showScreen("quiz");
}

function goNext() {
  const q = currentQuestion();
  const validation = validateSelection(q, [...state.selected]);
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  commitCurrentAnswer();

  if (state.index >= state.queue.length - 1) {
    finalizeSession();
    return;
  }
  state.index += 1;
  persist();
  renderQuestion();
}

function goBack() {
  if (state.index === 0) return;
  // save current selection softly if any
  if (state.selected.size) {
    commitCurrentAnswer();
  }
  state.index -= 1;
  persist();
  renderQuestion();
}

function exportData() {
  if (!state.session) {
    const saved = loadState();
    if (!saved?.session) {
      showToast("Chưa có dữ liệu để xuất");
      return;
    }
    state.session = saved.session;
  }
  if (!state.quiz) {
    showToast("Chưa tải được bộ câu hỏi");
    return;
  }
  const payload = buildExportPayload(state.session, state.quiz);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`luna-advisor-${stamp}.json`, payload);
  showToast("Đã tải file JSON");
}

async function loadQuiz() {
  const res = await fetch("data/questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const quiz = await res.json();
  if (!quiz?.questions?.length) throw new Error("Bộ câu hỏi trống");
  return quiz;
}

async function init() {
  try {
    state.quiz = await loadQuiz();
  } catch (err) {
    els.errorMessage.textContent = err.message || "Không tải được data/questions.json";
    showScreen("error");
    return;
  }

  const saved = loadState();
  const canResume =
    saved?.session &&
    saved.session.quizId === state.quiz.quizId &&
    saved.session.status !== undefined;

  els.btnResume.hidden = !canResume;

  els.btnStart.addEventListener("click", startFresh);
  els.btnResume.addEventListener("click", () => resumeSession(saved));
  els.btnNext.addEventListener("click", goNext);
  els.btnBack.addEventListener("click", goBack);
  els.btnExport.addEventListener("click", exportData);
  els.btnExportResults.addEventListener("click", exportData);
  els.btnRestart.addEventListener("click", startFresh);
  els.btnRetry.addEventListener("click", () => location.reload());

  showScreen("welcome");
}

init();
