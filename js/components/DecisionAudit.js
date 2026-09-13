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

function buildDecisionContext(event, audit) {
    let labelKey;
    let fallbackLabel;
    let depth;
    let runtimeStart;
    let runtimeEnd;

    switch (event.type) {
        case 'direct-ascent':
            labelKey = 'contextBottom';
            fallbackLabel = 'Bottom time';
            depth = audit.startDepth;
            runtimeStart = audit.runtimeStart;
            runtimeEnd = audit.runtimeStart;
            break;
        case 'anchor-candidate':
            labelKey = 'contextAnchorCandidate';
            fallbackLabel = 'Anchor candidate';
            depth = event.roundedCeilingDepth;
            break;
        case 'anchor-check':
            labelKey = 'contextAnchorCheck';
            fallbackLabel = 'Anchor simulation';
            depth = event.candidateDepth;
            break;
        case 'gas-switch':
            labelKey = 'contextGasSwitch';
            fallbackLabel = 'Gas switch';
            depth = event.depth;
            runtimeStart = event.runtime;
            runtimeEnd = event.runtime;
            break;
        case 'level-decision':
            depth = event.depth;
            runtimeEnd = event.runtime;
            if (event.totalWait > 0) {
                labelKey = 'contextStop';
                fallbackLabel = 'Decompression stop';
                runtimeStart = Number.isFinite(runtimeEnd)
                    ? Math.round((runtimeEnd - event.totalWait) * 10) / 10
                    : undefined;
            } else {
                labelKey = 'contextTransit';
                fallbackLabel = 'Level transit';
                runtimeStart = runtimeEnd;
            }
            break;
        default:
            return null;
    }

    const hasTime = Number.isFinite(runtimeStart) && Number.isFinite(runtimeEnd);
    const time = hasTime
        ? (Math.abs(runtimeEnd - runtimeStart) > 1e-9
            ? `${number(runtimeStart)}–${number(runtimeEnd)}\u00a0min`
            : `${number(runtimeEnd)}\u00a0min`)
        : null;

    return {
        label: translate(`decisionAudit.${labelKey}`, fallbackLabel),
        time,
        depth: Number.isFinite(depth) ? `${number(depth)}\u00a0m` : null
    };
}

function controllingCompartment(event) {
    if (event.type === 'level-decision') {
        return event.finalControllingCompartment;
    }
    return event.controllingCompartment ?? null;
}

/**
 * Convert structured scheduler events into localized, human-readable lines.
 *
 * @param {Object|null} audit
 * @returns {Array<{type: string, text: string, context: Object|null, compartment: string|null}>}
 */
export function buildDecisionAuditLines(audit) {
    if (!audit?.events) return [];

    return audit.events.map(event => {
        const context = buildDecisionContext(event, audit);
        switch (event.type) {
            case 'direct-ascent':
                return {
                    type: event.type,
                    context,
                    compartment: controllingCompartment(event),
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
                    context,
                    compartment: controllingCompartment(event),
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
                    context,
                    compartment: controllingCompartment(event),
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
                    context,
                    compartment: controllingCompartment(event),
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
                        context,
                        compartment: controllingCompartment(event),
                        text: format(
                            translate(
                                'decisionAudit.levelTransit',
                                'Ascent from {0}\u00a0m to {1}\u00a0m is allowed without waiting at the target-depth GF of {2}%.'
                            ),
                            number(event.depth),
                            number(event.targetDepth),
                            number(event.targetGF * 100, 1)
                        )
                    };
                }
                if (event.mandatoryWait > 0 &&
                    event.additionalWait === 0 &&
                    event.switchTime === 0) {
                    return {
                        type: event.type,
                        context,
                        compartment: controllingCompartment(event),
                        text: format(
                            translate(
                                'decisionAudit.levelConvention',
                                'At {0}\u00a0m the staged-profile convention adds {1}\u00a0min. Ascent to {2}\u00a0m is then allowed at the target-depth GF of {3}%.'
                            ),
                            number(event.depth),
                            number(event.mandatoryWait),
                            number(event.targetDepth),
                            number(event.targetGF * 100, 1)
                        )
                    };
                }
                return {
                    type: event.type,
                    context,
                    compartment: controllingCompartment(event),
                    text: format(
                        translate(
                            'decisionAudit.levelWait',
                            'At {0}\u00a0m wait {1}\u00a0min: {2}\u00a0min by the staged convention, {3}\u00a0min from the target-depth check, and {4}\u00a0min for a gas switch. Ascent to {5}\u00a0m is then allowed at the target-depth GF of {6}%.'
                        ),
                        number(event.depth),
                        number(event.totalWait),
                        number(event.mandatoryWait),
                        number(event.additionalWait),
                        number(event.switchTime),
                        number(event.targetDepth),
                        number(event.targetGF * 100, 1)
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
            ${lines.map(line => {
                const context = line.context
                    ? `<div class="decision-audit-context">`
                        + `<strong>${escHtml(line.context.label)}</strong>`
                        + (line.context.time
                            ? `<span class="decision-audit-context-time">${escHtml(line.context.time)}</span>`
                            : '')
                        + (line.context.depth
                            ? `<span class="decision-audit-context-depth">${escHtml(line.context.depth)}</span>`
                            : '')
                        + `</div>`
                    : '';
                const compartmentLabel = translate(
                    'decisionAudit.contextCompartment',
                    'Controlling compartment'
                );
                const compartment = line.compartment
                    ? `TC${escHtml(line.compartment)}`
                    : '—';
                return `<li class="decision-audit-${line.type}">`
                    + context
                    + `<span class="decision-audit-compartment" title="${escHtml(compartmentLabel)}" aria-label="${escHtml(compartmentLabel)}: ${compartment}">${compartment}</span>`
                    + `<span class="decision-audit-text">${escHtml(line.text)}</span>`
                    + `</li>`;
            }).join('')}
        </ol>
    `;
}
