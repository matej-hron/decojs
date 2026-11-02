/**
 * Rozcestník kurzu P1: kapitoly v pořadí přednášky a motivační otázky ze slidu 6.
 * Otázka odkazuje na kapitolu, kde ji student poprvé umí zodpovědět (zatím často
 * „připravujeme“). Je to jen prezentace — žádný stav per student.
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

export function chaptersHtml(chapters = P1_CHAPTERS) {
    return chapters.map(c => {
        const ready = c.status === 'ready';
        const title = ready
            ? `<a class="course-chapter-title" href="${c.slug}.html">${c.title}</a>`
            : `<span class="course-chapter-title">${c.title}</span>`;
        return `<li class="${ready ? 'is-ready' : 'is-planned'}">
            ${title}
            <span class="course-chapter-meta">${c.level} · slidy ${c.slides}</span>
            <span class="course-status${ready ? ' is-ready' : ''}">${ready ? 'hotovo' : 'připravujeme'}</span>
        </li>`;
    }).join('');
}

export function questionsHtml(questions = P1_QUESTIONS) {
    return questions.map(q => {
        const where = q.answeredIn.map(s => chapterRef(chapterBySlug(s))).join(', ');
        return `<li>${q.question}<span class="course-question-where">Odpověď: ${where}</span></li>`;
    }).join('');
}

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    document.getElementById('course-chapters').innerHTML = chaptersHtml();
    document.getElementById('course-questions').innerHTML = questionsHtml();
}
