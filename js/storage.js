const STORAGE_KEY = "ai-luna-advisor:v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function createEmptySession(quizMeta) {
  return {
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `luna-${Date.now()}`,
    quizId: quizMeta.quizId,
    quizVersion: quizMeta.version,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    status: "in_progress",
    answers: {},
    answerLog: [],
    derived: {
      selectedAspects: [],
      tags: [],
      needs: [],
      recommendations: null
    }
  };
}

export function upsertAnswer(session, question, selectedOptionIds, optionMeta) {
  const now = new Date().toISOString();
  const entry = {
    questionId: question.id,
    questionTitle: question.title,
    type: question.type,
    aspectId: question.aspectId || null,
    stage: question.stage || null,
    selectedOptionIds: [...selectedOptionIds],
    selectedLabels: optionMeta.map((o) => o.label),
    tags: [...new Set(optionMeta.flatMap((o) => o.tags || []))],
    answeredAt: now
  };

  session.answers[question.id] = entry;
  const existingIdx = session.answerLog.findIndex((a) => a.questionId === question.id);
  if (existingIdx >= 0) {
    session.answerLog[existingIdx] = entry;
  } else {
    session.answerLog.push(entry);
  }
  session.updatedAt = now;
  return session;
}

export function buildExportPayload(session, quiz) {
  return {
    exportedAt: new Date().toISOString(),
    app: "AI Luna Advisor",
    quiz: {
      quizId: quiz.quizId,
      version: quiz.version,
      locale: quiz.locale
    },
    session: {
      sessionId: session.sessionId,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt
    },
    responses: session.answerLog,
    derived: session.derived
  };
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
