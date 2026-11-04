/**
 * Rozcestník kurzu P1: kapitoly v pořadí přednášky a motivační otázky ze slidu 6.
 * Slidy ukazují jen otázky a názvy kapitol; kapitolu, kde student otázku poprvé umí
 * zodpovědět (zatím často „připravujeme“), řekne až „Více“. Je to jen prezentace —
 * žádný stav per student.
 */

import { P1_CHAPTERS, P1_QUESTIONS, chapterBySlug } from './p1Course.js';
import { registerServiceWorker } from '../swRegister.js';

/**
 * @param {import('./p1Course.js').Chapter} c
 * @returns {string} odkaz na hotovou kapitolu, jinak název se štítkem „připravujeme“
 */
export function chapterRef(c) {
    return c.status === 'ready'
        ? `<a href="${c.slug}.html">${c.title}</a>`
        : `${c.title} (připravujeme)`;
}

/** Slide 7: jen názvy kapitol; hotové jsou odkazy, ostatní tlumené (vysvětlí řádek pod seznamem). */
export function chaptersHtml(chapters = P1_CHAPTERS) {
    return chapters.map(c => c.status === 'ready'
        ? `<li class="is-ready"><a href="${c.slug}.html">${c.title}</a></li>`
        : `<li class="is-planned">${c.title}</li>`
    ).join('');
}

/** „Více“ pod slidem 7: úroveň a slidy každé kapitoly. */
export function chapterDetailsHtml(chapters = P1_CHAPTERS) {
    return chapters.map(c => `<li>${c.title}: ${c.level}, slidy ${c.slides}</li>`).join('');
}

/** Slide 6: jen otázky. */
export function questionsHtml(questions = P1_QUESTIONS) {
    return questions.map(q => `<li>${q.question}</li>`).join('');
}

/** „Více“ pod slidem 6: kde student otázku poprvé zodpoví. */
export function answersHtml(questions = P1_QUESTIONS) {
    return questions.map(q => {
        const where = q.answeredIn.map(s => chapterRef(chapterBySlug(s))).join(', ');
        return `<li>${q.question}<span class="course-question-where">Odpověď v kapitole: ${where}</span></li>`;
    }).join('');
}

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    document.getElementById('course-chapters').innerHTML = chaptersHtml();
    document.getElementById('course-chapter-details').innerHTML = chapterDetailsHtml();
    document.getElementById('course-questions').innerHTML = questionsHtml();
    document.getElementById('course-answers').innerHTML = answersHtml();
}
