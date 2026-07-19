import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const streams = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/streams' }),
  schema: z.object({
    title: z.string(),
    // Optional — some sessions are just Karl & Pete, with no guest
    guest: z.string().optional(),
    date: z.coerce.date(),
    status: z.enum(['announced', 'live', 'archived']).default('announced'),
    draft: z.boolean().default(false),
    // YouTube video ID — the live stream and the replay share it once the VOD is up
    youtubeId: z.string().optional(),
    // Set list — track titles played in the session, in order
    tracklist: z.array(z.string()).default([]),
    // Guest-contributed artifacts shown on the session page
    images: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string().default(''),
          caption: z.string().optional(),
        })
      )
      .default([]),
    audio: z
      .array(
        z.object({
          src: z.string(),
          title: z.string().optional(),
        })
      )
      .default([]),
    // Credits / links for the guest (site, bandcamp, instagram…)
    guestLinks: z
      .array(
        z.object({
          label: z.string(),
          href: z.string(),
        })
      )
      .default([]),
    // Post-hoc comment archive: raw comment exports pasted after the stream, one
    // block per platform. `raw` is copied straight from Facebook / Instagram (or
    // screenshot-to-text); the formatter turns it into an attributed transcript.
    // No Meta API — this is human-pasted archive material. See src/lib/transcript.ts.
    commentTranscript: z
      .array(
        z.object({
          platform: z.enum(['facebook', 'instagram', 'youtube', 'other']).default('other'),
          label: z.string().optional(), // override the section heading
          format: z.enum(['auto', 'csv', 'lines', 'blocks']).default('auto'),
          raw: z.string(),
        })
      )
      .default([]),
  }),
});

export const collections = { streams };
