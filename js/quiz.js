/**
 * Quiz Module
 * 
 * Generic quiz engine that loads questions from JSON data files.
 * Supports multiple quiz types, shuffling, and configurable question counts.
 */

// State
let quizData = null;
let currentQuestionIndex = 0;
let score = 0;
let answered = 0;
let hasAnswered = false;
let activeQuestions = [];

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
 * Load quiz data from JSON file
 */
async function loadQuizData(jsonPath) {
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load quiz data: ${response.status}`);
        }
        quizData = await response.json();
        updateQuestionCountOptions();
        return true;
    } catch (error) {
        console.error('Error loading quiz data:', error);
        quizContainer.innerHTML = `
            <div class="error-card">
                <h3>❌ Chyba načítání</h3>
                <p>Nepodařilo se načíst otázky. Zkuste obnovit stránku.</p>
                <p class="error-details">${error.message}</p>
            </div>
        `;
        return false;
    }
}

/**
 * Update question count dropdown based on available questions
 */
function updateQuestionCountOptions() {
    if (!questionCountSelect || !quizData) return;
    
    // Get filtered question count
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
    
    // Add standard options that don't exceed total
    const standardOptions = [5, 10, 20, 50, 100];
    standardOptions.filter(n => n <= total).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n === total ? `${n} (vše)` : n;
        if (n === Math.min(10, total)) opt.selected = true;
        questionCountSelect.appendChild(opt);
    });
    
    // Add "all" option if not already included
    if (!standardOptions.includes(total)) {
        const opt = document.createElement('option');
        opt.value = total;
        opt.textContent = `${total} (vše)`;
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
    if (!selectedCategories) return questions; // Return all if no filter
    
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
    
    // Get settings
    const shouldShuffle = shuffleToggle ? shuffleToggle.checked : false;
    const questionCount = questionCountSelect ? parseInt(questionCountSelect.value) : quizData.questions.length;
    
    // Filter by category first
    let filteredQuestions = filterQuestionsByCategory(quizData.questions);
    
    // Check if we have any questions after filtering
    if (filteredQuestions.length === 0) {
        quizContainer.innerHTML = `
            <div class="error-card">
                <h3>⚠️ Žádné otázky</h3>
                <p>Pro vybraná témata nejsou k dispozici žádné otázky. Vyberte alespoň jedno téma.</p>
            </div>
        `;
        return;
    }
    
    // Prepare questions
    if (shouldShuffle) {
        activeQuestions = shuffleArray(filteredQuestions).slice(0, questionCount);
    } else {
        activeQuestions = filteredQuestions.slice(0, questionCount);
    }
    
    // Update question count if filtered set is smaller
    if (activeQuestions.length < questionCount) {
        // Just use what we have
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
    nextBtn.textContent = 'Další otázka →';
    nextBtn.style.display = 'inline-block';
    restartBtn.style.display = 'none';
    
    quizContainer.innerHTML = `
        <div class="question-card">
            <h3 class="question-number">Otázka ${currentQuestionIndex + 1} z ${activeQuestions.length} <span class="question-id">(č. ${q.id})</span></h3>
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
    
    // Add click handlers to options
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
    
    // Highlight answers
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        const key = btn.dataset.key;
        
        if (key === q.correct) {
            btn.classList.add('correct');
        } else if (key === selectedKey && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });
    
    // Show feedback
    const feedback = document.getElementById('feedback');
    feedback.style.display = 'block';
    feedback.className = `feedback ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
    feedback.innerHTML = `
        <div class="feedback-header">
            ${isCorrect ? '✅ Správně!' : '❌ Špatně!'}
        </div>
        <div class="feedback-explanation">
            ${q.explanation}
        </div>
    `;
    
    // Enable next button
    nextBtn.disabled = false;
    
    // Check if this was the last question
    if (currentQuestionIndex >= activeQuestions.length - 1) {
        nextBtn.textContent = 'Zobrazit výsledky';
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
        message = 'Výborně! Perfektní skóre!';
    } else if (percentage >= 80) {
        emoji = '🎉';
        message = 'Skvělá práce!';
    } else if (percentage >= 60) {
        emoji = '👍';
        message = 'Dobrý výsledek, ale je co zlepšovat.';
    } else {
        emoji = '📚';
        message = 'Doporučujeme prostudovat teorii a zkusit znovu.';
    }
    
    quizContainer.innerHTML = `
        <div class="results-card">
            <div class="results-emoji">${emoji}</div>
            <h2>Test dokončen!</h2>
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
    questionCounter.textContent = `Otázka ${currentQuestionIndex + 1} z ${activeQuestions.length}`;
    scoreDisplay.textContent = `Skóre: ${score} / ${answered}`;
}

/**
 * Initialize the quiz module
 */
async function initQuizModule(jsonPath) {
    // Get DOM elements
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
    
    // Show loading state
    quizContainer.innerHTML = '<div class="loading">Načítání otázek...</div>';
    
    // Load quiz data
    const loaded = await loadQuizData(jsonPath);
    if (!loaded) return;
    
    // Set up event listeners
    nextBtn.addEventListener('click', nextQuestion);
    restartBtn.addEventListener('click', initQuiz);
    
    if (applySettingsBtn) {
        applySettingsBtn.addEventListener('click', initQuiz);
    }
    
    // Set up category checkbox logic
    if (categoryAllCheckbox) {
        categoryAllCheckbox.addEventListener('change', () => {
            if (categoryAllCheckbox.checked) {
                // Uncheck all individual categories
                categoryCheckboxes.forEach(cb => cb.checked = false);
            }
            updateQuestionCountOptions();
        });
    }
    
    categoryCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            // If any individual category is checked, uncheck "All"
            const anyChecked = Array.from(categoryCheckboxes).some(c => c.checked);
            if (categoryAllCheckbox) {
                categoryAllCheckbox.checked = !anyChecked;
            }
            updateQuestionCountOptions();
        });
    });
    
    // Start quiz
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
