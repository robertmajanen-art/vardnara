import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'

const PARSE_FORM_SYSTEM = `Du är en assistent som hjälper familjer koordinera vård för anhöriga i Sverige.

Användaren ger dig ett röstmeddelande på svenska. Extrahera strukturerad information och returnera ENBART giltig JSON.

Returnera ett objekt med NÅGON av dessa strukturer beroende på innehållet:

För besök (appointment):
{
  "formType": "appointment",
  "type": "HEALTHCARE"|"SCHOOL"|"SOCIAL"|"THERAPY"|"FAMILY"|"OTHER",
  "title": "string",
  "location": "string eller null",
  "startTime": "ISO 8601 datetime eller null",
  "notes": "string eller null"
}

För uppgift (task):
{
  "formType": "task",
  "title": "string",
  "description": "string eller null",
  "dueDate": "ISO 8601 date eller null"
}

För journalanteckning (journal):
{
  "formType": "journal",
  "entryType": "NOTE"|"OBSERVATION"|"INCIDENT"|"MOOD"|"HEALTH_UPDATE",
  "title": "string",
  "body": "string",
  "tags": ["string"]
}

Om du inte kan avgöra typen, returnera { "formType": "unknown", "rawText": "string" }.
Returnera ENBART JSON, ingen förklaring.`

export const voiceParseFormRoute: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma

  // POST /api/voice/parse-form
  fastify.post('/parse-form', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'AI-parsning är inte konfigurerad (ANTHROPIC_API_KEY saknas)',
      })
    }

    const body = req.body as { transcript?: string }
    if (!body?.transcript || typeof body.transcript !== 'string') {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'transcript saknas' })
    }

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: PARSE_FORM_SYSTEM,
      messages: [{ role: 'user', content: body.transcript }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    // Strip markdown code fences if Claude wrapped the JSON in ```json ... ```
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'AI returnerade ogiltigt svar', raw })
    }

    return reply.send(parsed)
  })
}
