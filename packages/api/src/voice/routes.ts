import type { FastifyPluginAsync } from 'fastify'
import OpenAI from 'openai'
import { toFile } from 'openai'

export const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  const apiKey = process.env['WHISPER_API_KEY'] ?? process.env['OPENAI_API_KEY']

  // POST /api/voice/transcribe — multipart audio → Swedish transcript (US-16)
  fastify.post('/transcribe', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!apiKey) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Röstinmatning är inte konfigurerad (WHISPER_API_KEY saknas)',
      })
    }

    const data = await req.file()
    if (!data) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ingen ljudfil bifogad' })
    }

    const allowedMime = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a']
    if (!allowedMime.includes(data.mimetype)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Filformatet stöds inte. Tillåtna format: ${allowedMime.join(', ')}`,
      })
    }

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const openai = new OpenAI({ apiKey })
    const file = await toFile(buffer, data.filename ?? 'audio.webm', { type: data.mimetype })

    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'sv',
      response_format: 'json',
    })

    return reply.send({ transcript: result.text })
  })
}
