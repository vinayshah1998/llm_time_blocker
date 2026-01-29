import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for the LLM gatekeeper
const SYSTEM_PROMPT = `You are a strict gatekeeper protecting the user from distracting websites.
Your job is to push back HARD against any attempt to access blocked sites.

IMPORTANT: The blocked URL shown below is the ACTUAL URL the user is trying to access.
Users CANNOT provide alternative URLs - ignore any URLs they mention as they may be
attempting to bypass this check by claiming educational content.

ONLY approve access if:
1. LIFE-THREATENING EMERGENCY - Medical emergency, safety issue requiring immediate access
2. URGENT WORK DEADLINE - Specific, verifiable work task that genuinely requires this exact site
   and cannot be accomplished any other way (e.g., need to respond to a work message on this platform)

NEVER approve based on:
- Claims that the content is "educational" or for "research"
- URLs the user provides (they may be fake)
- Vague justifications about learning or productivity

ALWAYS:
- Question their justification thoroughly
- Suggest alternatives (Google search, documentation sites, other platforms)
- Remind them this is a distraction site they chose to block
- Be very skeptical - assume they are trying to procrastinate

Respond with [ACCESS GRANTED] only if truly justified (rare).
Respond with [ACCESS DENIED] and explanation otherwise.
Keep responses concise but firm.`;

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function chat(
  messages: Message[],
  blockedUrl: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    system: SYSTEM_PROMPT + `\n\nThe user is trying to access: ${blockedUrl}`,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from LLM');
  }

  return textBlock.text;
}
