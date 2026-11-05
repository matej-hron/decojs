/**
 * „Procvič si“ — ručně vybrané otázky z testů SPČR/CMAS vložené do kapitoly kurzu.
 *
 *     <div class="course-practice" data-quiz-source="data/quiz-physics.json"
 *          data-question-ids="6,7,8"></div>
 *
 * Otázky se berou podle ID (kategorie kvízu jsou na kapitoly moc hrubé). Každá je
 * označená zdrojem „SPČR“; vlastní otázky DecoTheory přijdou později s jiným štítkem.
 * Odpověď se ukáže až po kliknutí na možnost (stejně na přednášce i doma).
 */

/**
 * @param {string} attr  např. "6, 7,8"
 * @returns {number[]}
 */
export function parseQuestionIds(attr) {
    return String(attr ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
            const n = Number(s);
            if (!Number.isInteger(n)) throw new Error(`practice: neplatné ID otázky „${s}“`);
            return n;
        });
}

/**
 * Vybere otázky v pořadí ID.
 * @param {{questions: {id: number}[]}} data   obsah data/quiz-*.json
 * @param {number[]} ids
 * @returns {object[]}
 * @throws {Error} když ID v datech chybí (otázky se v testech nesmí potichu ztratit)
 */
export function pickQuestions(data, ids) {
    const byId = new Map(data.questions.map(q => [q.id, q]));
    return ids.map(id => {
        const q = byId.get(id);
        if (!q) throw new Error(`practice: otázka ${id} v datech není`);
        return q;
    });
}

function questionHtml(q, index) {
    const options = q.options.map(o => `
        <button type="button" class="option-btn" data-key="${o.key}">
            <span class="option-key">${o.key})</span>
            <span class="option-text">${o.text}</span>
        </button>`).join('');
    return `
        <article class="question-card course-question" data-correct="${q.correct}">
            <h3 class="question-number">Otázka ${index + 1}
                <span class="course-source-badge" title="Otázka z testů SPČR/CMAS">SPČR</span>
                <span class="question-id">(č. ${q.id})</span></h3>
            <p class="question-text">${q.question}</p>
            <div class="options-list">${options}</div>
            <div class="feedback" hidden></div>
        </article>`;
}

function wire(card, q) {
    const feedback = card.querySelector('.feedback');
    card.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ok = btn.dataset.key === q.correct;
            card.querySelectorAll('.option-btn').forEach(b => {
                b.disabled = true;
                if (b.dataset.key === q.correct) b.classList.add('correct');
                else if (b === btn) b.classList.add('incorrect');
            });
            feedback.hidden = false;
            feedback.className = `feedback ${ok ? 'feedback-correct' : 'feedback-incorrect'}`;
            feedback.innerHTML = `<div class="feedback-header">${ok ? '✅ Správně!' : '❌ Špatně.'}</div>
                <div class="feedback-explanation">${q.explanation ?? ''}</div>`;
        });
    });
}

/**
 * Vykreslí všechny bloky „Procvič si“ pod `root`.
 * @param {ParentNode} [root=document]
 * @param {{fetchImpl?: typeof fetch, base?: string|URL}} [options]
 */
export async function initPractice(root = document, options = {}) {
    const { fetchImpl = globalThis.fetch, base = new URL('../../', import.meta.url) } = options;
    for (const box of root.querySelectorAll('.course-practice[data-question-ids]')) {
        try {
            const url = new URL(box.dataset.quizSource || 'data/quiz-physics.json', base).href;
            const res = await fetchImpl(url);
            if (!res.ok) throw new Error(`${url} → ${res.status}`);
            const questions = pickQuestions(await res.json(), parseQuestionIds(box.dataset.questionIds));
            box.innerHTML = questions.map(questionHtml).join('');
            box.querySelectorAll('.course-question').forEach((card, i) => wire(card, questions[i]));
        } catch (err) {
            console.warn('practice:', err);
            box.innerHTML = '<p class="course-concept-error">Otázky se nepodařilo načíst.</p>';
        }
    }
}
