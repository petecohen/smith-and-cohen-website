import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const streams = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/streams' }),
  schema: z.object({
    title: z.string(),
    guest: z.string(),
    date: z.coerce.date(),
    status: z.enum(['announced', 'live', 'archived']).default('announced'),
    draft: z.boolean().default(false),
    // YouTube video ID — the live stream and the replay share it once the VOD is up
    youtubeId: z.string().optional(),
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
  }),
});

export const collections = { streams };
