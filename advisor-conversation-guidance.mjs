// Generic coaching only. Existing action, contact and cadence gates remain authoritative.
// No lead facts, inferred assets, messages, provider calls or persisted state belong here.
export function conversationGuidance(action, quality, cadence = action?.cadence) {
  if (!action || ['closed', 'clients'].includes(action.bucket) || quality?.status === 'excluded') return null;
  const available = ['ready', 'due', 'meetings'].includes(action.bucket)
    && quality?.status !== 'identity_review'
    && quality?.gates?.contact?.state === 'confirmed' && !!action.contact
    && !action.held && cadence?.allowed !== false && !['resting', 'capped', 'blocked', 'hold'].includes(cadence?.status)
    && !(cadence?.step && !cadence.step.ready);
  const base = {
    status: available ? 'prepare' : 'hold',
    label: 'Draft coaching examples - firm review required',
    notice: 'Use only after required firm review, contact restrictions and permission checks. These examples are not financial advice or a recommendation to move assets. Nothing is sent or saved by opening this guide.',
  };
  if (!available) return {...base, objective: 'Complete the saved next action before preparing outreach.', reason: cadence?.step?.hold || cadence?.reason || action.reason || 'Review this record before contact.'};
  return {...base,
    objective: 'Understand one priority in their own words and agree whether a next conversation would help.',
    opening: 'Hello, I am [your name] with [firm]. Is now a suitable time for a brief introduction? If so, may I ask what, if anything, you would like help thinking through?',
    questions: [
      'What would make a conversation with an advisor useful to you?',
      'What decisions or questions, if any, are on your mind, and what timing matters to you?',
      'What is working well with your current approach, and what would you like to understand better?',
    ],
    listening: 'Ask one question at a time. Reflect back what they actually said and check your understanding. Employer and role are not evidence of financial needs, account holdings or interest.',
    objections: [
      {concern: 'I already have an advisor.', response: 'That makes sense. There is no need to change a relationship that works for you. We can leave it here.'},
      {concern: 'I am busy.', response: 'Understood. Would you prefer to stop here, or is there a time and channel you would want me to use? Either is fine.'},
      {concern: 'I am not interested / do not contact me.', response: 'Thank you for telling me. I will respect that.', action: 'End the conversation. Record Not interested or Do not contact, matching their request; do not schedule another approach.'},
    ],
    closing: 'Have I understood your priority correctly? Would a next conversation be useful, or would you prefer to leave it here? If useful, what should we cover, who will do what, and what time and channel do you agree to?',
    capture: [
      'Record their stated priority and the actual outcome, not a presumed need or qualification.',
      'If they agreed, record the next action, who owns it, permission, channel and time. Confirm or clear any suggested follow-up time in the form.',
      'Keep notes minimal. Do not record account numbers, credentials or unnecessary sensitive details. Use your firm-approved process for financial information.',
    ],
  };
}
