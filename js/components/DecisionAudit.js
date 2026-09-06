import { fmtNum } from '../format.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

function format(template, ...values) {
    return String(template).replace(/\{(\d+)\}/g, (_, index) =>
        String(values[Number(index)] ?? '')
    );
}

function number(value, decimals = 1) {
    return fmtNum(value, decimals);
}

/**
 * Convert structured scheduler events into localized, human-readable lines.
 *
 * @param {Object|null} audit
 * @returns {Array<{type: string, text: string}>}
 */
export function buildDecisionAuditLines(audit) {
    if (!audit?.events) return [];

    return audit.events.map(event => {
        switch (event.type) {
            case 'direct-ascent':
                return {
                    type: event.type,
                    text: format(
                        translate(
                            event.decision === 'surface'
                                ? 'decisionAudit.directPass'
                                : 'decisionAudit.directFail',
                            event.decision === 'surface'
                                ? 'Direct ascent passed at GF High {0}%: the surface ceiling is clear (controlling compartment {1}).'
                                : 'Direct ascent failed at GF High {0}%: ceiling {1}\u00a0m (controlling compartment {2}).'
                        ),
                        number(event.gf * 100, 0),
                        event.decision === 'surface'
                            ? event.controllingCompartment
                            : number(event.ceilingDepth),
                        event.controllingCompartment
                    )
                };

            case 'anchor-candidate':
                return {
                    type: event.type,
                    text: format(
                        translate(
                            'decisionAudit.anchorCandidate',
                            'The GF Low ceiling is {0}\u00a0m; rounded anchor candidate {1}\u00a0m (controlling compartment {2}).'
                        ),
                        number(event.ceilingDepth),
                        number(event.roundedCeilingDepth),
                        event.controllingCompartment
                    )
                };

            case 'anchor-check':
                return {
                    type: event.type,
                    text: format(
                        translate(
                            event.decision === 'accept'
                                ? 'decisionAudit.anchorAccepted'
                                : 'decisionAudit.anchorMoved',
                            event.decision === 'accept'
                                ? 'After ascent to {0}\u00a0m, the GF Low ceiling is {1}\u00a0m; the anchor is accepted (compartment {2}).'
                                : 'After ascent to {0}\u00a0m, the GF Low ceiling is {1}\u00a0m; continue with candidate {2}\u00a0m (compartment {3}).'
                        ),
                        number(event.candidateDepth),
                        number(event.ceilingDepth),
                        event.decision === 'accept'
                            ? event.controllingCompartment
                            : number(event.nextCandidateDepth),
                        event.controllingCompartment
                    )
                };

            case 'gas-switch':
                return {
                    type: event.type,
                    text: format(
                        translate(
                            event.phase === 'ascent' && event.duration > 0
                                ? 'decisionAudit.gasSwitchWait'
                                : 'decisionAudit.gasSwitch',
                            event.phase === 'ascent' && event.duration > 0
                                ? 'At {0}\u00a0m switch to {1} and wait {2}\u00a0min.'
                                : 'At {0}\u00a0m switch to {1}.'
                        ),
                        number(event.depth),
                        event.gas,
                        number(event.duration)
                    )
                };

            case 'level-decision':
                if (event.totalWait === 0) {
                    return {
                        type: event.type,
                        text: format(
                            translate(
                                'decisionAudit.levelTransit',
                                'From {0}\u00a0m to {1}\u00a0m: GF {2}%, ceiling {3}\u00a0m (compartment {4}); ascent is allowed without waiting.'
                            ),
                            number(event.depth),
                            number(event.targetDepth),
                            number(event.targetGF * 100, 1),
                            number(event.finalCeilingDepth),
                            event.finalControllingCompartment
                        )
                    };
                }
                if (event.mandatoryWait > 0 &&
                    event.additionalWait === 0 &&
                    event.switchTime === 0) {
                    return {
                        type: event.type,
                        text: format(
                            translate(
                                'decisionAudit.levelConvention',
                                'At {0}\u00a0m the staged-profile convention adds {1}\u00a0min. Ascent to {2}\u00a0m is then allowed at GF {3}% with ceiling {4}\u00a0m (compartment {5}).'
                            ),
                            number(event.depth),
                            number(event.mandatoryWait),
                            number(event.targetDepth),
                            number(event.targetGF * 100, 1),
                            number(event.finalCeilingDepth),
                            event.finalControllingCompartment
                        )
                    };
                }
                return {
                    type: event.type,
                    text: format(
                        translate(
                            'decisionAudit.levelWait',
                            'At {0}\u00a0m wait {1}\u00a0min: {2}\u00a0min by the staged convention, {3}\u00a0min from the ceiling check, {4}\u00a0min for a gas switch. Then ascent to {5}\u00a0m is allowed at GF {6}% with ceiling {7}\u00a0m (compartment {8}).'
                        ),
                        number(event.depth),
                        number(event.totalWait),
                        number(event.mandatoryWait),
                        number(event.additionalWait),
                        number(event.switchTime),
                        number(event.targetDepth),
                        number(event.targetGF * 100, 1),
                        number(event.finalCeilingDepth),
                        event.finalControllingCompartment
                    )
                };

            default:
                return null;
        }
    }).filter(Boolean);
}

/**
 * Render the localized contents of the decision-audit disclosure.
 *
 * @param {Object|null} audit
 * @returns {string}
 */
export function renderDecisionAuditHTML(audit) {
    if (audit?.error === 'out-of-range') {
        return `<p class="decision-audit-empty">${escHtml(translate(
            'decisionAudit.outOfRange',
            'The decision audit is unavailable because this profile exceeds the scheduler limit.'
        ))}</p>`;
    }
    const lines = buildDecisionAuditLines(audit);
    if (lines.length === 0) {
        return `<p class="decision-audit-empty">${escHtml(translate(
            'decisionAudit.unavailable',
            'Generate a profile to see the calculation decisions.'
        ))}</p>`;
    }

    return `
        <p class="decision-audit-summary">${escHtml(format(
            translate(
                'decisionAudit.summary',
                'Mode: {0}. GF anchor: {1}\u00a0m.'
            ),
            translate(
                `decisionAudit.mode${audit.mode[0].toUpperCase()}${audit.mode.slice(1)}`,
                audit.mode
            ),
            number(audit.anchorDepth)
        ))}</p>
        <p class="decision-audit-disclaimer">${escHtml(translate(
            'decisionAudit.disclaimer',
            'This is a diagnostic explanation of this implementation, not an independent safety validation.'
        ))}</p>
        <ol class="decision-audit-list">
            ${lines.map(line =>
                `<li class="decision-audit-${line.type}">${escHtml(line.text)}</li>`
            ).join('')}
        </ol>
    `;
}
