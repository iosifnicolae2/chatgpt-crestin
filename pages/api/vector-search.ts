import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codeBlock, oneLine } from 'common-tags'
import {
  Configuration,
  OpenAIApi,
  CreateModerationResponse,
  CreateEmbeddingResponse,
} from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { ApplicationError, UserError } from '@/lib/errors'
import OpenAI from 'openai'

const openAiKey = process.env.OPENAI_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const config = new Configuration({
  apiKey: openAiKey,
})
const openAIApi = new OpenAIApi(config)
const openai = new OpenAI({
  apiKey: openAiKey,
})

const CHATGPT_MODEL = 'gpt-3.5-turbo-1106'

export const runtime = 'edge'

export default async function handler(req: NextRequest) {
  try {
    if (!openAiKey) {
      throw new ApplicationError('Missing environment variable OPENAI_KEY')
    }

    if (!supabaseUrl) {
      throw new ApplicationError('Missing environment variable SUPABASE_URL')
    }

    if (!supabaseServiceKey) {
      throw new ApplicationError('Missing environment variable SUPABASE_SERVICE_ROLE_KEY')
    }

    const requestData = await req.json()

    if (!requestData) {
      throw new UserError('Missing request data')
    }

    const { prompt: query } = requestData

    if (!query) {
      throw new UserError('Missing query in request data')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Moderate the content to comply with OpenAI T&C
    const sanitizedQuery = query.trim()
    const moderationResponse: CreateModerationResponse = await openAIApi
      .createModeration({ input: sanitizedQuery })
      .then((res) => res.json())

    const [results] = moderationResponse.results

    if (results.flagged) {
      throw new UserError('Flagged content', {
        flagged: true,
        categories: results.categories,
      })
    }

    // Create embedding from query
    const embeddingResponse = await openAIApi.createEmbedding({
      model: 'text-embedding-ada-002',
      input: sanitizedQuery.replaceAll('\n', ' '),
    })

    if (embeddingResponse.status !== 200) {
      throw new ApplicationError('Failed to create embedding for subject', embeddingResponse)
    }

    const {
      data: [{ embedding }],
    }: CreateEmbeddingResponse = await embeddingResponse.json()

    const { error: matchError, data: matchedSongs } = await supabaseClient.rpc(
      'match_songs',
      {
        embedding,
        match_threshold: 0.58,
        match_count: 30,
        min_content_length: 0,
      }
    )

    // console.log({matchedSongs})

    if (matchError) {
      throw new ApplicationError('Failed to match songs', matchError)
    }

    // const encoder = encoding_for_model(CHATGPT_MODEL);
    // let tokenCount = 0
    let contextText = ''

    for (let i = 0; i < matchedSongs.length; i++) {
      const song = matchedSongs[i]
      // const content = `id=${song.id||''},title=${song.title||''}`
      const content = `id=${song.id||''},number=${song.info['number']||''},title=${song.title||''},categories=${song.categories?.join(',')||''},content=${song.content?.substring(0, 1000)||''}`
      // const tokens = encoder.encode(content)
      // tokenCount += tokens.length;
      //
      // if (tokenCount >= 16000) {
      //   console.warn("tokenCount >= 16000")
      //   break
      // }

      contextText += `${content.trim()}\n---\n`
    }
    // encoder.free();

    const prompt = codeBlock`${oneLine`
      Ca asistent, sarcina ta este să sortezi datele de intrare astfel incat continutul cantecului sa fie exact cu subiectul specificat.
      Descrie rationamentul pentru care acest cantec se potriveste cu subiectul.
      Rezultatul va fi un array json in results cu urmatoarele campuri: id,number,title,reason.
      `}

      Lista cantece(id,title, categories, content):
      ${contextText}

      Afiseaza cantecele doar cu acest subiect: """
      ${sanitizedQuery}
      """
    `
    // console.log({prompt})

    const completion = await openai.chat.completions.create({
      model: CHATGPT_MODEL,
      messages: [{
        role: 'user',
        content: prompt,
      }],
      max_tokens: 512,
      temperature: 0.5,
      response_format: { type: "json_object" },
      stream: true,
    });
    // console.log({completion})


    // if (!response.ok) {
    //   const error = await response.json()
    //   throw new ApplicationError('Failed to generate completion', error)
    // }

    // @ts-ignore
    const stream = OpenAIStream(completion);
    return new StreamingTextResponse(stream);

  } catch (err: unknown) {
    console.error(err)
    if (err instanceof UserError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          data: err.data,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } else if (err instanceof ApplicationError) {
      // Print out application errors with their additional data
      console.error(`${err.message}: ${JSON.stringify(err.data)}`)
    } else {
      // Print out unexpected errors as is to help with debugging
      console.error(err)
    }

    // TODO: include more response info in debug environments
    return new Response(
      JSON.stringify({
        error: 'A aparut o eroare neasteptata. Va rugam sa incercati din nou.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
