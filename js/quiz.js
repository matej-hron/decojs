/**
 * Quiz Module
 *
 * Generic quiz engine that loads questions from JSON data files.
 * Supports multiple quiz types, shuffling, and configurable question counts.
 * Language-aware: tries `<base>-<lang>.json` first, falls back to base path.
 */

import { translate, getCurrentLanguage } from './i18n.js';

// State
let quizData = null;
let currentQuestionIndex = 0;
let score = 0;
let answered = 0;
let hasAnswered = false;
let activeQuestions = [];
let activeBaseSource = null;

// DOM elements (initialized after DOM load)
let quizContainer, questionCounter, scoreDisplay, nextBtn, restartBtn;
let shuffleToggle, questionCountSelect, applySettingsBtn;
let categoryAllCheckbox, categoryCheckboxes;

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Build the language-specific path for a base JSON path.
 * `data/quiz-vessel.json` + `en` → `data/quiz-vessel-en.json`.
 */
function localisedQuizPath(basePath, lang) {
    return basePath.replace(/\.json$/i, `-${lang}.json`);
}

/**
 * Load quiz data, preferring the current language version and falling back
 * to the base (Czech) JSON if no localised file exists.
 */
async function loadQuizData(basePath) {
    const lang = getCurrentLanguage();
    const candidates = (lang && lang !== 'cs')
        ? [localisedQuizPath(basePath, lang), basePath]
        : [basePath];

    for (const path of candidates) {
        try {
            const response = await fetch(path);
            if (response.ok) {
                quizData = await response.json();
                updateQuestionCountOptions();
                return true;
            }
        } catch (error) {
            console.warn(`Quiz: failed to load ${path}:`, error);
        }
    }

    quizContainer.innerHTML = `
        <div class="error-card">
            <h3>${translate('quiz.runtime.errorTitle', '❌ Chyba načítání')}</h3>
            <p>${translate('quiz.runtime.errorMessage', 'Nepodařilo se načíst otázky. Zkuste obnovit stránku.')}</p>
        </div>
    `;
    return false;
}

/**
 * Update question count dropdown based on available questions
 */
function updateQuestionCountOptions() {
    if (!questionCountSelect || !quizData) return;

    const filteredQuestions = filterQuestionsByCategory(quizData.questions);
    const total = filteredQuestions.length;

    questionCountSelect.innerHTML = '';

    if (total === 0) {
        const opt = document.createElement('option');
        opt.value = 0;
        opt.textContent = '0';
        questionCountSelect.appendChild(opt);
        return;
    }

    const allLabel = translate('quiz.runtime.all', 'vše');
    const standardOptions = [5, 10, 20, 50, 100];
    standardOptions.filter(n => n <= total).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n === total ? `${n} (${allLabel})` : n;
        if (n === Math.min(10, total)) opt.selected = true;
        questionCountSelect.appendChild(opt);
    });

    if (!standardOptions.includes(total)) {
        const opt = document.createElement('option');
        opt.value = total;
        opt.textContent = `${total} (${allLabel})`;
        questionCountSelect.appendChild(opt);
    }
}

/**
 * Get selected categories
 */
function getSelectedCategories() {
    if (!categoryCheckboxes) return null;
    if (categoryAllCheckbox && categoryAllCheckbox.checked) return null; // null means all

    const selected = [];
    categoryCheckboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });
    return selected.length > 0 ? selected : null;
}

/**
 * Filter questions by selected categories
 */
function filterQuestionsByCategory(questions) {
    const selectedCategories = getSelectedCategories();
    if (!selectedCategories) return questions;

    return questions.filter(q => selectedCategories.includes(q.category));
}

/**
 * Initialize quiz with current settings
 */
function initQuiz() {
    if (!quizData) return;

    currentQuestionIndex = 0;
    score = 0;
    answered = 0;
    hasAnswered = false;

    const shouldShuffle = shuffleToggle ? shuffleToggle.checked : false;
    const questionCount = questionCountSelect ? parseInt(questionCountSelect.value) : quizData.questions.length;

    let filteredQuestions = filterQuestionsByCategory(quizData.questions);

    if (filteredQuestions.length === 0) {
        quizContainer.innerHTML = `
            <div class="error-card">
                <h3>${translate('quiz.runtime.noQuestionsTitle', '⚠️ Žádné otázky')}</h3>
                <p>${translate('quiz.runtime.noQuestionsMessage', 'Pro vybraná témata nejsou k dispozici žádné otázky. Vyberte alespoň jedno téma.')}</p>
            </div>
        `;
        return;
    }

    if (shouldShuffle) {
        activeQuestions = shuffleArray(filteredQuestions).slice(0, questionCount);
    } else {
        activeQuestions = filteredQuestions.slice(0, questionCount);
    }

    renderQuestion();
}

/**
 * Get current question
 */
function getCurrentQuestion() {
    return activeQuestions[currentQuestionIndex];
}

/**
 * Render the current question
 */
function renderQuestion() {
    const q = getCurrentQuestion();
    hasAnswered = false;
    nextBtn.disabled = true;
    nextBtn.textContent = translate('quiz.buttons.next', 'Další otázka →');
    nextBtn.style.display = 'inline-block';
    restartBtn.style.display = 'none';

    const questionLabel = translate('quiz.runtime.questionOf', 'Otázka {n} z {total}')
        .replace('{n}', currentQuestionIndex + 1)
        .replace('{total}', activeQuestions.length);
    const idLabel = translate('quiz.runtime.questionIdLabel', 'č. {id}').replace('{id}', q.id);

    quizContainer.innerHTML = `
        <div class="question-card">
            <h3 class="question-number">${questionLabel} <span class="question-id">(${idLabel})</span></h3>
            <p class="question-text">${q.question}</p>
            <div class="options-list">
                ${q.options.map(opt => `
                    <button class="option-btn" data-key="${opt.key}">
                        <span class="option-key">${opt.key})</span>
                        <span class="option-text">${opt.text}</span>
                    </button>
                `).join('')}
            </div>
            <div id="feedback" class="feedback" style="display: none;"></div>
        </div>
    `;

    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(btn.dataset.key));
    });

    updateProgress();
}

/**
 * Handle answer selection
 */
function handleAnswer(selectedKey) {
    if (hasAnswered) return;
    hasAnswered = true;
    answered++;

    const q = getCurrentQuestion();
    const isCorrect = selectedKey === q.correct;

    if (isCorrect) {
        score++;
    }

    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        const key = btn.dataset.key;

        if (key === q.correct) {
            btn.classList.add('correct');
        } else if (key === selectedKey && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    const feedback = document.getElementById('feedback');
    feedback.style.display = 'block';
    feedback.className = `feedback ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
    const verdict = isCorrect
        ? translate('quiz.runtime.correctVerdict', '✅ Správně!')
        : translate('quiz.runtime.incorrectVerdict', '❌ Špatně!');
    feedback.innerHTML = `
        <div class="feedback-header">${verdict}</div>
        <div class="feedback-explanation">${q.explanation}</div>
    `;

    nextBtn.disabled = false;

    if (currentQuestionIndex >= activeQuestions.length - 1) {
        nextBtn.textContent = translate('quiz.runtime.showResults', 'Zobrazit výsledky');
    }

    updateProgress();
}

/**
 * Go to next question or show results
 */
function nextQuestion() {
    if (currentQuestionIndex >= activeQuestions.length - 1) {
        showResults();
    } else {
        currentQuestionIndex++;
        renderQuestion();
    }
}

/**
 * Show final results
 */
function showResults() {
    const percentage = Math.round((score / activeQuestions.length) * 100);
    let message = '';
    let emoji = '';

    if (percentage === 100) {
        emoji = '🏆';
        message = translate('quiz.runtime.resultPerfect', 'Výborně! Perfektní skóre!');
    } else if (percentage >= 80) {
        emoji = '🎉';
        message = translate('quiz.runtime.resultGreat', 'Skvělá práce!');
    } else if (percentage >= 60) {
        emoji = '👍';
        message = translate('quiz.runtime.resultGood', 'Dobrý výsledek, ale je co zlepšovat.');
    } else {
        emoji = '📚';
        message = translate('quiz.runtime.resultPoor', 'Doporučujeme prostudovat teorii a zkusit znovu.');
    }

    quizContainer.innerHTML = `
        <div class="results-card">
            <div class="results-emoji">${emoji}</div>
            <h2>${translate('quiz.runtime.resultsTitle', 'Test dokončen!')}</h2>
            <div class="results-score">
                <span class="score-number">${score}</span>
                <span class="score-divider">/</span>
                <span class="score-total">${activeQuestions.length}</span>
            </div>
            <p class="results-percentage">${percentage} %</p>
            <p class="results-message">${message}</p>
        </div>
    `;

    nextBtn.style.display = 'none';
    restartBtn.style.display = 'inline-block';
}

/**
 * Update progress display
 */
function updateProgress() {
    const counterText = translate('quiz.runtime.questionOf', 'Otázka {n} z {total}')
        .replace('{n}', currentQuestionIndex + 1)
        .replace('{total}', activeQuestions.length);
    questionCounter.textContent = counterText;
    const scoreLabel = translate('quiz.runtime.scoreLabel', 'Skóre');
    scoreDisplay.textContent = `${scoreLabel}: ${score} / ${answered}`;
}

/**
 * Reload the active quiz from disk (e.g. after a language change).
 */
async function reloadActiveQuiz() {
    if (!activeBaseSource || !quizContainer) return;
    quizContainer.innerHTML = `<div class="loading">${translate('quiz.runtime.loading', 'Načítání otázek...')}</div>`;
    const loaded = await loadQuizData(activeBaseSource);
    if (loaded) initQuiz();
}

/**
 * Initialize the quiz module
 */
async function initQuizModule(jsonPath) {
    activeBaseSource = jsonPath;

    quizContainer = document.getElementById('quiz-container');
    questionCounter = document.getElementById('question-counter');
    scoreDisplay = document.getElementById('score-display');
    nextBtn = document.getElementById('next-btn');
    restartBtn = document.getElementById('restart-btn');
    shuffleToggle = document.getElementById('shuffle-toggle');
    questionCountSelect = document.getElementById('question-count');
    applySettingsBtn = document.getElementById('apply-settings-btn');
    categoryAllCheckbox = document.getElementById('category-all');
    categoryCheckboxes = document.querySelectorAll('.category-checkbox');

    quizContainer.innerHTML = `<div class="loading">${translate('quiz.runtime.loading', 'Načítání otázek...')}</div>`;

    const loaded = await loadQuizData(jsonPath);
    if (!loaded) return;

    nextBtn.addEventListener('click', nextQuestion);
    restartBtn.addEventListener('click', initQuiz);

    if (applySettingsBtn) {
        applySettingsBtn.addEventListener('click', initQuiz);
    }

    if (categoryAllCheckbox) {
        categoryAllCheckbox.addEventListener('change', () => {
            if (categoryAllCheckbox.checked) {
                categoryCheckboxes.forEach(cb => cb.checked = false);
            }
            updateQuestionCountOptions();
        });
    }

    categoryCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const anyChecked = Array.from(categoryCheckboxes).some(c => c.checked);
            if (categoryAllCheckbox) {
                categoryAllCheckbox.checked = !anyChecked;
            }
            updateQuestionCountOptions();
        });
    });

    document.addEventListener('languagechange', reloadActiveQuiz);

    initQuiz();
}

// Auto-initialize if data-quiz-source attribute is present
document.addEventListener('DOMContentLoaded', () => {
    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        const source = quizContainer.dataset.quizSource || 'data/quiz-physics.json';
        initQuizModule(source);
    }
});
