/**
 * Quiz engine: builds a dynamic question queue from selected life aspects.
 */

export function resolveOptions(question, quiz) {
  if (question.optionSource === "aspects") {
    return quiz.aspects.map((a) => ({
      id: a.id,
      label: a.label,
      emoji: a.emoji,
      color: a.color,
      tags: [a.id]
    }));
  }
  return (question.options || []).map((o) => ({
    ...o,
    emoji: o.emoji || null
  }));
}

export function buildQuestionQueue(quiz, selectedAspectIds) {
  const byId = Object.fromEntries(quiz.questions.map((q) => [q.id, q]));
  const queue = [];

  const entry = byId[quiz.flow.entryQuestionId];
  if (entry) queue.push(entry);

  const aspectSet = new Set(selectedAspectIds || []);
  for (const aspect of quiz.aspects) {
    if (!aspectSet.has(aspect.id)) continue;
    const followups = quiz.questions.filter(
      (q) => q.stage === "detail" && q.aspectId === aspect.id
    );
    queue.push(...followups);
  }

  for (const id of quiz.flow.closingQuestionIds || []) {
    if (byId[id]) queue.push(byId[id]);
  }

  // Deduplicate while preserving order
  const seen = new Set();
  return queue.filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
}

export function validateSelection(question, selectedIds) {
  const count = selectedIds.length;
  if (question.required && count === 0) {
    return { ok: false, message: "Hãy chọn ít nhất một lựa chọn." };
  }
  if (question.type === "single" && count > 1) {
    return { ok: false, message: "Chỉ được chọn 1 đáp án." };
  }
  if (question.minSelect && count < question.minSelect) {
    return { ok: false, message: `Hãy chọn ít nhất ${question.minSelect} mục.` };
  }
  if (question.maxSelect && count > question.maxSelect) {
    return { ok: false, message: `Chỉ được chọn tối đa ${question.maxSelect} mục.` };
  }
  return { ok: true, message: "" };
}

export function selectionHint(question) {
  if (question.type === "single") return "Chọn 1 đáp án";
  const parts = [];
  if (question.minSelect) parts.push(`tối thiểu ${question.minSelect}`);
  if (question.maxSelect) parts.push(`tối đa ${question.maxSelect}`);
  return parts.length ? `Chọn nhiều · ${parts.join(", ")}` : "Chọn nhiều đáp án";
}

export function collectTags(session) {
  const tags = session.answerLog.flatMap((a) => a.tags || []);
  return [...new Set(tags)];
}

export function matchByTags(item, tags) {
  const set = new Set(tags);
  const any = item.whenTagsAny || [];
  if (any.includes("*")) return true;
  return any.some((t) => set.has(t));
}

function pickActions(list, tags, limit = 2) {
  const matched = list.filter((item) => matchByTags(item, tags));
  const defaults = list.filter((item) => (item.whenTagsAny || []).includes("*"));
  const merged = [...matched.filter((i) => !(i.whenTagsAny || []).includes("*")), ...defaults];
  const unique = [];
  const seen = new Set();
  for (const item of merged) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

function pickGifts(gifts, tags, limit = 5) {
  const scored = gifts
    .map((g) => {
      const hits = (g.whenTagsAny || []).filter((t) => tags.includes(t)).length;
      const budgetBoost = (g.budgetHints || []).some((b) => tags.includes(b)) ? 0.5 : 0;
      return { gift: g, score: hits + budgetBoost };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.gift);
}

export function buildNeedsSummary(quiz, session) {
  const aspectAnswer = session.answers.life_aspects;
  const selectedAspectIds = aspectAnswer?.selectedOptionIds || [];
  const aspectMap = Object.fromEntries(quiz.aspects.map((a) => [a.id, a]));

  const needs = selectedAspectIds.map((id) => {
    const aspect = aspectMap[id];
    const related = session.answerLog.filter((a) => a.aspectId === id);
    const highlights = related.flatMap((a) => a.selectedLabels || []).slice(0, 3);
    return {
      aspectId: id,
      label: aspect?.label || id,
      emoji: aspect?.emoji || "•",
      color: aspect?.color || "#1f6f68",
      highlights
    };
  });

  return needs;
}

export function buildRecommendations(quiz, session) {
  const tags = collectTags(session);
  const catalog = quiz.recommendationCatalog;
  return {
    tags,
    day: pickActions(catalog.actions.day, tags, 2),
    week: pickActions(catalog.actions.week, tags, 2),
    month: pickActions(catalog.actions.month, tags, 2),
    gifts: pickGifts(catalog.gifts, tags, 5)
  };
}
